import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import {
  DevPanelError,
  EXIT_TAIL_LINES,
  type ConfigChangedEvent,
  type ConfigSource,
  type ExitDetails,
  type ExitEvent,
  type InstallChangedEvent,
  type InstallOutputEvent,
  type InstallResult,
  type InstallState,
  type LogEvent,
  type PortConflict,
  type PortConflictChangedEvent,
  type PortOwner,
  type RepoView,
  type ServiceConfig,
  type ServiceStatus,
  type Snapshot,
  type StatusChangedEvent,
  type SuggestedService,
} from '@devpanel/shared';
import {
  LOCAL_CONFIG_DIR,
  REPO_CONFIG_FILE,
  deleteLocalConfig,
  localConfigPath,
  readLocalConfig,
  readRepoConfig,
  validateConfig,
  writeLocalConfig,
  type ConfigResult,
  type ServiceDefinition,
} from './config.js';
import { detectServices } from './detect.js';
import { readWorkspace } from './workspace.js';
import { killTree, spawnService, type ServiceProcess } from './process.js';
import { ancestry, findPortListeners, listProcesses, type ProcessInfo } from './ports.js';
import { OutputTail } from './output-tail.js';
import { watchReadiness, type ReadinessWatch } from './readiness.js';
import {
  DEFAULT_ENVIRONMENT,
  PNPM_LOCK_FILE,
  isPnpmRepo,
  needsInstall,
  type Environment,
} from './environment.js';

/** Timing parameters; production defaults per the spec, tests pass short ones. */
export interface CoreTimings {
  /** How long a Service may stay `starting` before it becomes `unhealthy`. */
  readinessTimeoutMs: number;
  /** How long a Service without readiness criteria must stay alive to become `running`. */
  livenessMs: number;
  /** How long `stopService` waits after Ctrl+C before killing the process tree. */
  gracefulStopMs: number;
  /** Interval of healthUrl polling while `starting`. */
  healthPollMs: number;
  /** Interval of readiness re-checks while `unhealthy`. */
  unhealthyPollMs: number;
  /** Interval of git branch refresh. */
  branchRefreshMs: number;
  /** How long resolving a port conflict waits for the port to become free. */
  portFreeTimeoutMs: number;
}

export const DEFAULT_TIMINGS: CoreTimings = {
  readinessTimeoutMs: 120_000,
  livenessMs: 3_000,
  gracefulStopMs: 5_000,
  healthPollMs: 1_000,
  unhealthyPollMs: 5_000,
  branchRefreshMs: 10_000,
  portFreeTimeoutMs: 15_000,
};

export interface CoreOptions {
  /** App data directory: holds the Workspace file, Local Configs, PID file and Access Key. */
  appDataDir: string;
  timings?: Partial<CoreTimings>;
  /** Tool environment (pnpm probe, install command); tests replace it. */
  environment?: Partial<Environment>;
}

export interface CoreEvents {
  statusChanged: [StatusChangedEvent];
  log: [LogEvent];
  exit: [ExitEvent];
  configChanged: [ConfigChangedEvent];
  installOutput: [InstallOutputEvent];
  installChanged: [InstallChangedEvent];
  portConflictChanged: [PortConflictChangedEvent];
}

/** A running or finished `pnpm install` of one Repo. */
interface InstallRun {
  /** Set while the install runs. */
  process?: ServiceProcess;
  /** Resolves when the install has finished. */
  done: Promise<InstallResult>;
  /** Exit code of the finished install. */
  exitCode?: number;
}

interface ServiceState {
  definition: ServiceDefinition;
  status: ServiceStatus;
  process?: ServiceProcess;
  stopping?: Promise<void>;
  /** Readiness checks of the current run; present only while `starting` or `unhealthy`. */
  readiness?: ReadinessWatch;
  /** How the Service ended by itself; present only while `crashed` or `exited`. */
  lastExit?: ExitDetails;
  /** New definition from a config change while running; applied once the Service exits. */
  pending?: ServiceDefinition;
  /** Gone from the config while running; dropped once the Service exits. */
  removed?: boolean;
  /** Its port is held by someone else (a blocked start, or still taken after a Stop). */
  portConflict?: PortConflict;
}

interface RepoState {
  id: string;
  name: string;
  path: string;
  color?: string;
  configError?: string;
  /** The last `installDependencies` run, if any. */
  install?: InstallRun;
  configSource: ConfigSource;
  suggestions?: SuggestedService[];
  unusedLocalConfig: boolean;
  services: Map<string, ServiceState>;
  /** Watches the Repo folder for config file changes. */
  watcher?: FSWatcher;
  reloadTimer?: NodeJS.Timeout;
  /** Serializes config reloads of this Repo. */
  reloading: Promise<void>;
}

/** Files in a Repo root whose change triggers a config reload. */
const WATCHED_REPO_FILES = new Set([REPO_CONFIG_FILE, 'package.json', 'pnpm-workspace.yaml']);
/** File watchers fire several times per save; reload once after the burst. */
const CONFIG_RELOAD_DEBOUNCE_MS = 100;

/** Has a process (possibly stopping); its definition must not change under it. */
function isLive(service: ServiceState): boolean {
  return service.process !== undefined;
}

function sameDefinition(a: ServiceDefinition, b: ServiceDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** `process.kill(pid, 0)`: true while the process has not exited (libuv checks the exit code on Windows). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** How often port occupancy is re-checked while waiting for a port to become free. */
const PORT_POLL_MS = 200;
/** After a Stop, how long the port may take to be released before its owner is reported. */
const PORT_RELEASE_AFTER_STOP_MS = 1_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Technical (English) description of a port owner for error details. */
function describeOwner(owner: PortOwner): string {
  switch (owner.kind) {
    case 'service':
      return `Service "${owner.serviceName}" of Repo "${owner.repoName}"`;
    case 'process':
      return owner.processName;
  }
}

/** Repo id: stable hash of the normalized Repo path (a Repo is identified by its path). */
function repoIdFor(repoPath: string): string {
  const normalized = path.resolve(repoPath).toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

/**
 * DevPanel core: all process and configuration logic. Has no dependency on any transport.
 */
export class DevPanelCore extends EventEmitter<CoreEvents> {
  readonly timings: CoreTimings;
  readonly appDataDir: string;
  private repos = new Map<string, RepoState>();
  private readonly environment: Environment;

  constructor(options: CoreOptions) {
    super();
    this.appDataDir = options.appDataDir;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.environment = { ...DEFAULT_ENVIRONMENT, ...options.environment };
  }

  /** Reads the Workspace file and each Repo's config, and starts watching the config files. */
  async load(): Promise<void> {
    this.closeWatchers();
    const workspace = await readWorkspace(this.appDataDir);
    const repos = new Map<string, RepoState>();
    for (const entry of workspace.repos) {
      const repoPath = path.resolve(entry.path);
      const repo: RepoState = {
        id: repoIdFor(repoPath),
        name: entry.name,
        path: repoPath,
        color: entry.color,
        configSource: 'none',
        unusedLocalConfig: false,
        services: new Map(),
        reloading: Promise.resolve(),
      };
      await this.reloadConfig(repo);
      repos.set(repo.id, repo);
    }
    this.repos = repos;
    this.watchLocalConfigs();
    for (const repo of repos.values()) this.watchRepo(repo);
  }

  listRepos(): RepoView[] {
    return [...this.repos.values()].map((repo) => this.repoView(repo));
  }

  /** Full state for a (re)connecting client. */
  snapshot(): Snapshot {
    return { repos: this.listRepos() };
  }

  /** Starts a Service through `cmd.exe /d /s /c` in its working directory. */
  async startService(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const service = this.getService(repo, serviceId);
    if (service.process) return;

    await this.ensurePnpm(repo);
    if (service.process) return;
    await this.ensurePortFree(repo, service);
    if (service.process) return;
    const { definition } = service;
    const cwd = path.resolve(repo.path, definition.cwd ?? '.');
    service.lastExit = undefined;
    this.setStatus(repo, service, 'starting');
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command: definition.command, cwd, env: definition.env });
    } catch (err) {
      this.setStatus(repo, service, 'crashed');
      throw new DevPanelError(
        'spawnFailed',
        { repoName: repo.name, serviceName: definition.name ?? definition.id },
        `Failed to spawn "${definition.command}" in ${cwd}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    service.process = proc;
    const tail = new OutputTail(EXIT_TAIL_LINES);
    const readiness = watchReadiness({
      criteria: definition,
      timings: this.timings,
      isAlive: () => service.process === proc && isProcessAlive(proc.pid),
      onReady: () => this.onReadinessChange(repo, service, 'running'),
      onUnhealthy: () => this.onReadinessChange(repo, service, 'unhealthy'),
    });
    service.readiness = readiness;
    proc.onData((data) => {
      tail.push(data);
      readiness.feed(data);
      this.emit('log', { repoId: repo.id, serviceId, data });
    });
    proc.exited.then((exitCode) => {
      readiness.dispose();
      service.readiness = undefined;
      service.process = undefined;
      const stoppedByUser = service.stopping !== undefined;
      const lastLines = tail.snapshot();
      if (!stoppedByUser) service.lastExit = { exitCode, lastLines };
      this.setStatus(repo, service, stoppedByUser ? 'stopped' : exitCode === 0 ? 'exited' : 'crashed');
      this.emit('exit', { repoId: repo.id, serviceId, exitCode, stoppedByUser, lastLines });
      this.settleAfterExit(repo, service);
    });
  }

  /** Readiness result: applies only while the run is still `starting`/`unhealthy`. */
  private onReadinessChange(repo: RepoState, service: ServiceState, status: 'running' | 'unhealthy'): void {
    if (service.status !== 'starting' && service.status !== 'unhealthy') return;
    if (status === 'running') service.readiness = undefined;
    this.setStatus(repo, service, status);
  }

  /**
   * Stops a Service: Ctrl+C, wait for the graceful period, then kill the whole process tree.
   * Resolves once the Service has exited.
   */
  async stopService(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const service = this.getService(repo, serviceId);
    if (service.stopping) return service.stopping;
    const proc = service.process;
    if (!proc) return;

    service.readiness?.dispose();
    service.readiness = undefined;
    this.setStatus(repo, service, 'stopping');
    service.stopping = proc
      .stop(this.timings.gracefulStopMs)
      .then(() => this.checkPortReleased(repo, service))
      .finally(() => {
        service.stopping = undefined;
      });
    return service.stopping;
  }

  /** After a Stop: confirms the Service's port was released; otherwise records who still holds it. */
  private async checkPortReleased(repo: RepoState, service: ServiceState): Promise<void> {
    const { port } = service.definition;
    if (port === undefined) return;
    try {
      if (await this.waitPortFree(port, PORT_RELEASE_AFTER_STOP_MS)) {
        this.setPortConflict(repo, service, undefined);
        return;
      }
      const owner = await this.findPortOwner(port);
      this.setPortConflict(repo, service, owner && { port, owner, reason: 'stop' });
    } catch {
      // netstat failed: the next start checks the port again.
    }
  }

  /**
   * Frees the Service's port: stops the DevPanel Service that holds it, or kills the foreign process
   * (with its tree). Waits until the port is free, then starts the Service, unless the conflict came
   * from a Stop. The owner is looked up afresh, so a stale conflict never kills the wrong process.
   */
  async resolvePortConflict(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const service = this.getService(repo, serviceId);
    const startAfter = service.portConflict?.reason !== 'stop';
    const { port } = service.definition;
    if (port !== undefined) {
      const owner = await this.findPortOwner(port);
      if (owner) await this.freePortFrom(owner);
      if (!(await this.waitPortFree(port, this.timings.portFreeTimeoutMs))) {
        const serviceName = service.definition.name ?? service.definition.id;
        throw new DevPanelError(
          'portNotFreed',
          { repoName: repo.name, serviceName, port },
          `Port ${port} was still listened on ${this.timings.portFreeTimeoutMs} ms after freeing it from ${owner ? describeOwner(owner) : 'nobody'}`,
        );
      }
    }
    this.setPortConflict(repo, service, undefined);
    if (startAfter) await this.startService(repoId, serviceId);
  }

  /** Stops our Service or kills the foreign process holding a port. */
  private async freePortFrom(owner: PortOwner): Promise<void> {
    switch (owner.kind) {
      case 'service':
        await this.stopService(owner.repoId, owner.serviceId);
        return;
      case 'process':
        // Never kill the DevPanel Server itself.
        if (owner.pid === process.pid) return;
        await killTree(owner.pid);
        return;
    }
  }

  /** Polls until nothing listens on `port`; false if it is still taken after `timeoutMs`. */
  private async waitPortFree(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((await findPortListeners(port)).length === 0) return true;
      if (Date.now() >= deadline) return false;
      await delay(PORT_POLL_MS);
    }
  }

  /** Stops the Service if it runs (waiting for the exit), then starts it again. */
  async restartService(repoId: string, serviceId: string): Promise<void> {
    await this.stopService(repoId, serviceId);
    await this.startService(repoId, serviceId);
  }

  /**
   * Runs the install command (`pnpm install`) in the folder of a pnpm Repo, in a pty, streaming
   * `installOutput` and announcing `installChanged`. Resolves when it has finished; a call while an
   * install of the same Repo runs joins that install.
   */
  async installDependencies(repoId: string): Promise<InstallResult> {
    const repo = this.getRepo(repoId);
    if (repo.install?.process) return repo.install.done;
    if (!isPnpmRepo(repo.path)) {
      throw new DevPanelError(
        'notPnpmRepo',
        { repoName: repo.name },
        `Repo "${repo.name}" has no ${PNPM_LOCK_FILE}; DevPanel installs dependencies only for pnpm Repos`,
      );
    }
    await this.ensurePnpm(repo);
    if (repo.install?.process) return repo.install.done;

    const command = this.environment.installCommand;
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command, cwd: repo.path });
    } catch (err) {
      throw new DevPanelError(
        'spawnFailed',
        { repoName: repo.name, serviceName: command },
        `Failed to spawn "${command}" in ${repo.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    proc.onData((data) => this.emit('installOutput', { repoId: repo.id, data }));
    const run: InstallRun = {
      process: proc,
      done: proc.exited.then((exitCode) => {
        run.process = undefined;
        run.exitCode = exitCode;
        this.emitInstallChanged(repo);
        return { ok: exitCode === 0, exitCode };
      }),
    };
    repo.install = run;
    this.emitInstallChanged(repo);
    return run.done;
  }

  /** Stops every running Service (and any running dependency install). */
  async shutdown(): Promise<void> {
    const stops: Promise<void>[] = [];
    for (const repo of this.repos.values()) {
      const install = repo.install?.process;
      if (install) stops.push(install.stop(this.timings.gracefulStopMs));
      for (const service of repo.services.values()) {
        if (service.process) stops.push(this.stopService(repo.id, service.definition.id));
      }
    }
    this.closeWatchers();
    await Promise.all(stops);
  }

  private installState(repo: RepoState): InstallState | undefined {
    if (repo.install?.process) return { state: 'running' };
    if (!needsInstall(repo.path)) return undefined;
    const exitCode = repo.install?.exitCode;
    return exitCode !== undefined && exitCode !== 0 ? { state: 'failed', exitCode } : { state: 'needed' };
  }

  private emitInstallChanged(repo: RepoState): void {
    this.emit('installChanged', { repoId: repo.id, ...this.installView(repo) });
  }

  private installView(repo: RepoState): { install?: InstallState } {
    const install = this.installState(repo);
    return install ? { install } : {};
  }

  // --- Ports ------------------------------------------------------------------------------------

  /**
   * Before a start: when the Service's port is held (on any address), records the conflict and
   * fails with `portTaken` instead of spawning.
   */
  private async ensurePortFree(repo: RepoState, service: ServiceState): Promise<void> {
    const { port } = service.definition;
    if (port === undefined) return;
    const owner = await this.findPortOwner(port);
    if (!owner) {
      this.setPortConflict(repo, service, undefined);
      return;
    }
    this.setPortConflict(repo, service, { port, owner, reason: 'start' });
    const serviceName = service.definition.name ?? service.definition.id;
    throw new DevPanelError(
      'portTaken',
      { repoName: repo.name, serviceName, port, owner },
      `Port ${port} is listened on by PID ${owner.pid} (${describeOwner(owner)}); "${serviceName}" was not started`,
    );
  }

  /**
   * Who listens on `port`, or undefined when it is free. A listener whose process descends from one
   * of our live Services is that Service; anything else is a foreign process.
   */
  private async findPortOwner(port: number): Promise<PortOwner | undefined> {
    const listeners = await findPortListeners(port);
    if (listeners.length === 0) return undefined;
    let processes: Map<number, ProcessInfo>;
    try {
      processes = await listProcesses();
    } catch {
      processes = new Map();
    }
    const servicesByPid = new Map<number, { repo: RepoState; service: ServiceState }>();
    for (const repo of this.repos.values()) {
      for (const service of repo.services.values()) {
        if (service.process) servicesByPid.set(service.process.pid, { repo, service });
      }
    }
    for (const { pid } of listeners) {
      for (const ancestor of ancestry(pid, processes)) {
        const ours = servicesByPid.get(ancestor);
        if (!ours) continue;
        const { definition } = ours.service;
        return {
          kind: 'service',
          pid,
          repoId: ours.repo.id,
          repoName: ours.repo.name,
          serviceId: definition.id,
          serviceName: definition.name ?? definition.id,
        };
      }
    }
    const { pid } = listeners[0]!;
    return { kind: 'process', pid, processName: processes.get(pid)?.name ?? `PID ${pid}` };
  }

  private setPortConflict(repo: RepoState, service: ServiceState, conflict: PortConflict | undefined): void {
    if (JSON.stringify(service.portConflict) === JSON.stringify(conflict)) return;
    service.portConflict = conflict;
    this.emit('portConflictChanged', {
      repoId: repo.id,
      serviceId: service.definition.id,
      ...(conflict && { portConflict: conflict }),
    });
  }

  /** In a pnpm Repo, fails with a coded error (shown with a hint) when pnpm is not on PATH. */
  private async ensurePnpm(repo: RepoState): Promise<void> {
    if (!isPnpmRepo(repo.path)) return;
    if (await this.environment.isPnpmAvailable()) return;
    throw new DevPanelError(
      'pnpmMissing',
      { repoName: repo.name },
      `Repo "${repo.name}" has ${PNPM_LOCK_FILE} but "where pnpm" found nothing on PATH`,
    );
  }

  // --- Config lifecycle -----------------------------------------------------------------------

  /**
   * Saves the chosen Services as the Repo's Local Config in the app data directory (never in the
   * Repo) and applies it right away.
   */
  async saveLocalConfig(repoId: string, services: ServiceConfig[]): Promise<void> {
    const repo = this.getRepo(repoId);
    const result = validateConfig({ services }, 'Local Config');
    if (!result.ok) throw new DevPanelError('configInvalid', { repoName: repo.name }, result.error);
    await writeLocalConfig(this.appDataDir, repo.path, result.config!);
    await this.reloadNow(repo);
  }

  /** Deletes the Repo's Local Config (offered once a Repo Config exists) and applies the result. */
  async deleteLocalConfig(repoId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    await deleteLocalConfig(this.appDataDir, repo.path);
    await this.reloadNow(repo);
  }

  private repoView(repo: RepoState): RepoView {
    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      ...(repo.color !== undefined && { color: repo.color }),
      ...(repo.configError !== undefined && { configError: repo.configError }),
      configSource: repo.configSource,
      ...(repo.suggestions !== undefined && { suggestions: repo.suggestions }),
      ...(repo.unusedLocalConfig && { unusedLocalConfig: true }),
      ...this.installView(repo),
      services: [...repo.services.values()].map(({ definition: d, status, lastExit, pending, removed, portConflict }) => ({
        id: d.id,
        name: d.name ?? d.id,
        command: d.command,
        ...(d.cwd !== undefined && { cwd: d.cwd }),
        ...(d.port !== undefined && { port: d.port }),
        ...(d.url !== undefined && { url: d.url }),
        dependsOn: d.dependsOn ?? [],
        status,
        ...(lastExit !== undefined && { lastExit }),
        ...(pending !== undefined && { configChanged: true }),
        ...(removed && { removedFromConfig: true }),
        ...(portConflict !== undefined && { portConflict }),
      })),
    };
  }

  /**
   * Re-reads the Repo's config. A Repo Config takes precedence; without one the Local Config is
   * used; the two are never merged. An invalid file only sets `configError`: the last valid
   * Services stay active.
   */
  private async reloadConfig(repo: RepoState): Promise<void> {
    const repoResult = await readRepoConfig(repo.path);
    const localResult = await readLocalConfig(this.appDataDir, repo.path);
    const exists = (r: ConfigResult) => !r.ok || r.config !== undefined;

    let result: ConfigResult | undefined;
    if (exists(repoResult)) {
      repo.configSource = 'repo';
      result = repoResult;
    } else if (exists(localResult)) {
      repo.configSource = 'local';
      result = localResult;
    } else {
      repo.configSource = 'none';
    }
    repo.unusedLocalConfig = repo.configSource === 'repo' && exists(localResult);
    repo.suggestions = repo.configSource === 'none' ? await detectServices(repo.path) : undefined;

    if (result && !result.ok) {
      repo.configError = result.error;
      return;
    }
    repo.configError = undefined;
    this.applyDefinitions(repo, result?.config?.services ?? []);
  }

  /** Stopped Services take the new definitions; live ones keep theirs until they exit. */
  private applyDefinitions(repo: RepoState, definitions: ServiceDefinition[]): void {
    const next = new Map<string, ServiceState>();
    for (const definition of definitions) {
      const current = repo.services.get(definition.id);
      if (!current) {
        next.set(definition.id, { definition, status: 'stopped' });
        continue;
      }
      current.removed = undefined;
      if (isLive(current)) {
        current.pending = sameDefinition(current.definition, definition) ? undefined : definition;
      } else {
        current.definition = definition;
        current.pending = undefined;
      }
      next.set(definition.id, current);
    }
    for (const [id, current] of repo.services) {
      if (next.has(id) || !isLive(current)) continue;
      current.removed = true;
      current.pending = undefined;
      next.set(id, current);
    }
    repo.services = next;
  }

  /** After a Service exits: drop it if it left the config, or switch to its pending definition. */
  private settleAfterExit(repo: RepoState, service: ServiceState): void {
    const id = service.definition.id;
    if (repo.services.get(id) !== service) return;
    if (service.removed) {
      repo.services.delete(id);
    } else if (service.pending) {
      service.definition = service.pending;
      service.pending = undefined;
    } else {
      return;
    }
    this.emit('configChanged', { repo: this.repoView(repo) });
  }

  /** Reloads the Repo's config (serialized with other reloads) and emits `configChanged`. */
  private reloadNow(repo: RepoState): Promise<void> {
    clearTimeout(repo.reloadTimer);
    repo.reloadTimer = undefined;
    const run = repo.reloading.then(async () => {
      if (this.repos.get(repo.id) !== repo) return;
      await this.reloadConfig(repo);
      this.emit('configChanged', { repo: this.repoView(repo) });
    });
    repo.reloading = run.catch(() => undefined);
    return run;
  }

  private scheduleReload(repo: RepoState): void {
    clearTimeout(repo.reloadTimer);
    repo.reloadTimer = setTimeout(() => {
      repo.reloadTimer = undefined;
      void this.reloadNow(repo).catch(() => undefined);
    }, CONFIG_RELOAD_DEBOUNCE_MS);
  }

  private localConfigWatcher?: FSWatcher;

  /** Watches the Repo folder (top level only) for changes of its config files. */
  private watchRepo(repo: RepoState): void {
    try {
      repo.watcher = watch(repo.path, { persistent: false }, (_event, filename) => {
        if (filename === null || WATCHED_REPO_FILES.has(path.basename(filename))) this.scheduleReload(repo);
      });
      repo.watcher.on('error', () => undefined);
    } catch {
      // Folder missing or not watchable: the config is re-read on the next load.
    }
  }

  /** Watches the Local Config directory; a change reloads the Repo whose file it is. */
  private watchLocalConfigs(): void {
    const dir = path.join(this.appDataDir, LOCAL_CONFIG_DIR);
    try {
      mkdirSync(dir, { recursive: true });
      this.localConfigWatcher = watch(dir, { persistent: false }, (_event, filename) => {
        for (const repo of this.repos.values()) {
          if (filename === null || path.basename(localConfigPath(this.appDataDir, repo.path)) === filename) {
            this.scheduleReload(repo);
          }
        }
      });
      this.localConfigWatcher.on('error', () => undefined);
    } catch {
      // Not watchable: changes made through `saveLocalConfig` still apply immediately.
    }
  }

  private closeWatchers(): void {
    this.localConfigWatcher?.close();
    this.localConfigWatcher = undefined;
    for (const repo of this.repos.values()) {
      repo.watcher?.close();
      repo.watcher = undefined;
      clearTimeout(repo.reloadTimer);
      repo.reloadTimer = undefined;
    }
  }

  private getRepo(repoId: string): RepoState {
    const repo = this.repos.get(repoId);
    if (!repo) throw new DevPanelError('repoNotFound', { repoId }, `Unknown Repo "${repoId}"`);
    return repo;
  }

  private getService(repo: RepoState, serviceId: string): ServiceState {
    const service = repo.services.get(serviceId);
    if (!service) {
      throw new DevPanelError(
        'serviceNotFound',
        { repoName: repo.name, serviceId },
        `Unknown Service "${serviceId}" in Repo "${repo.name}"`,
      );
    }
    return service;
  }

  private setStatus(repo: RepoState, service: ServiceState, status: ServiceStatus): void {
    if (service.status === status) return;
    service.status = status;
    this.emit('statusChanged', { repoId: repo.id, serviceId: service.definition.id, status });
  }
}
