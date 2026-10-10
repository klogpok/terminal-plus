import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
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
  type RepoChangedEvent,
  type RepoView,
  type ServiceConfig,
  type ServiceStatus,
  type SessionChangedEvent,
  type SessionClosedEvent,
  type SessionKind,
  type SessionOutputEvent,
  type SessionView,
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
import { OutputBuffer } from './output-buffer.js';
import { readWorkspace, writeWorkspace } from './workspace.js';
import { spawnService, type ServiceProcess } from './process.js';
import { windowsShell, type DesktopShell } from './shell.js';
import { repoIdFor } from './repo-id.js';
import { readGitBranch } from './git.js';
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
}

export const DEFAULT_TIMINGS: CoreTimings = {
  readinessTimeoutMs: 120_000,
  livenessMs: 3_000,
  gracefulStopMs: 5_000,
  healthPollMs: 1_000,
  unhealthyPollMs: 5_000,
  branchRefreshMs: 10_000,
};

export interface CoreOptions {
  /** App data directory: holds the Workspace file, Local Configs, PID file and Access Key. */
  appDataDir: string;
  timings?: Partial<CoreTimings>;
  /** Folder picker and folder/URL opener; defaults to the Windows implementation. */
  shell?: DesktopShell;
  /** Tool environment (pnpm probe, install command); tests replace it. */
  environment?: Partial<Environment>;
}

/** Colors assigned to new Repos, in order; the first one not used by another Repo wins. */
export const REPO_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#6366f1',
  '#f97316',
];

export interface CoreEvents {
  statusChanged: [StatusChangedEvent];
  log: [LogEvent];
  exit: [ExitEvent];
  configChanged: [ConfigChangedEvent];
  repoChanged: [RepoChangedEvent];
  installOutput: [InstallOutputEvent];
  installChanged: [InstallChangedEvent];
  sessionChanged: [SessionChangedEvent];
  sessionClosed: [SessionClosedEvent];
  sessionOutput: [SessionOutputEvent];
}

/** An open Session (running, or finished by itself and still shown in its tab). */
interface SessionState {
  id: string;
  repoId: string;
  kind: SessionKind;
  number: number;
  /** Set while the process runs. */
  process?: ServiceProcess;
  exitCode?: number;
  output: OutputBuffer;
  /** Set once `closeSession` (or Repo removal / shutdown) began ending it. */
  closing?: Promise<void>;
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
  /** Recent output; survives restarts (a separator is appended instead of clearing). */
  output: OutputBuffer;
  /** Terminal size from the most recent `resizePty`; the next spawn uses it too. */
  size?: { cols: number; rows: number };
  stopping?: Promise<void>;
  /** Readiness checks of the current run; present only while `starting` or `unhealthy`. */
  readiness?: ReadinessWatch;
  /** How the Service ended by itself; present only while `crashed` or `exited`. */
  lastExit?: ExitDetails;
  /** New definition from a config change while running; applied once the Service exits. */
  pending?: ServiceDefinition;
  /** Gone from the config while running; dropped once the Service exits. */
  removed?: boolean;
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
  folderMissing: boolean;
  branch?: string;
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

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function isFolder(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    return false;
  }
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

/** Dimmed "── перезапуск HH:MM ──" line written into a Service's output before each new run. */
function restartSeparator(previousOutput: string, now = new Date()): string {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const newline = previousOutput.endsWith('\n') ? '' : '\r\n';
  return `${newline}\u001b[0m\u001b[2m── перезапуск ${time} ──\u001b[0m\r\n`;
}

/**
 * DevPanel core: all process and configuration logic. Has no dependency on any transport.
 */
export class DevPanelCore extends EventEmitter<CoreEvents> {
  readonly timings: CoreTimings;
  readonly appDataDir: string;
  private readonly shell: DesktopShell;
  private repos = new Map<string, RepoState>();
  /** Open Sessions by id, in opening order. */
  private readonly sessions = new Map<string, SessionState>();
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly environment: Environment;

  constructor(options: CoreOptions) {
    super();
    this.appDataDir = options.appDataDir;
    this.shell = options.shell ?? windowsShell;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.environment = { ...DEFAULT_ENVIRONMENT, ...options.environment };
  }

  /** Reads the Workspace file and each Repo's config, and starts watching the config files. */
  async load(): Promise<void> {
    this.closeWatchers();
    const workspace = await readWorkspace(this.appDataDir);
    const repos = new Map<string, RepoState>();
    for (const entry of workspace.repos) {
      const repo = await this.createRepo(entry.path, entry.name, entry.color);
      repos.set(repo.id, repo);
    }
    this.repos = repos;
    this.watchLocalConfigs();
    for (const repo of repos.values()) this.watchRepo(repo);
    this.startRepoRefresh();
  }

  listRepos(): RepoView[] {
    return [...this.repos.values()].map((repo) => this.repoView(repo));
  }

  /** Periodically re-checks every Repo's folder and git branch; changes go out as `repoChanged`. */
  private startRepoRefresh(): void {
    if (this.refreshTimer) return;
    let running = false;
    this.refreshTimer = setInterval(() => {
      if (running) return;
      running = true;
      void Promise.all([...this.repos.values()].map((repo) => this.refreshRepo(repo)))
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    }, this.timings.branchRefreshMs);
    this.refreshTimer.unref();
  }

  private stopRepoRefresh(): void {
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  /** Re-reads folder presence and branch of one Repo; emits `repoChanged` when either changed. */
  private async refreshRepo(repo: RepoState): Promise<void> {
    const missing = !(await isFolder(repo.path));
    const branch = missing ? repo.branch : await readGitBranch(repo.path);
    if (this.repos.get(repo.id) !== repo) return; // removed or relocated meanwhile
    if (missing === repo.folderMissing && branch === repo.branch) return;
    const cameBack = repo.folderMissing && !missing;
    const wentAway = !repo.folderMissing && missing;
    repo.folderMissing = missing;
    repo.branch = branch;
    if (wentAway || cameBack) this.unwatchRepo(repo);
    if (cameBack) {
      // The folder is back (e.g. a drive reconnected): its config may only now be readable, and
      // the old watcher died with the folder.
      await this.reloadConfig(repo);
      this.watchRepo(repo);
    }
    this.emit('repoChanged', { repoId: repo.id, repo: this.repoView(repo) });
  }

  /**
   * Adds a folder to the Workspace. Without `path` the backend shows the folder picker; resolves
   * with `null` when the user cancels it. The name defaults to the folder name; a color is assigned.
   * Rejects a folder already in the Workspace (`repoAlreadyAdded`) and a taken name (`repoNameTaken`,
   * whose params carry the path so the client can retry with another name).
   */
  async addRepo(options: { path?: string; name?: string }): Promise<RepoView | null> {
    const picked = options.path ?? (await this.shell.pickFolder());
    if (picked === undefined) return null;
    const repoPath = path.resolve(picked);
    const existing = this.repos.get(repoIdFor(repoPath));
    if (existing) {
      throw new DevPanelError(
        'repoAlreadyAdded',
        { path: repoPath, repoName: existing.name },
        `${repoPath} is already in the Workspace as "${existing.name}"`,
      );
    }
    await this.requireFolder(repoPath);
    const name = (options.name ?? path.basename(repoPath)).trim() || repoPath;
    this.requireFreeName(name, repoPath);
    const used = new Set([...this.repos.values()].map((r) => r.color?.toLowerCase()));
    const color = REPO_COLORS.find((c) => !used.has(c)) ?? REPO_COLORS[this.repos.size % REPO_COLORS.length]!;

    const repo = await this.createRepo(repoPath, name, color);
    this.repos.set(repo.id, repo);
    this.watchRepo(repo);
    await this.saveWorkspace();
    const view = this.repoView(repo);
    this.emit('repoChanged', { repoId: repo.id, repo: view });
    return view;
  }

  /**
   * Removes a Repo from the Workspace: stops every process it owns (the client confirms first,
   * listing them), deletes its Local Config, and never touches the Repo folder.
   */
  async removeRepo(repoId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const install = repo.install?.process;
    await Promise.all([
      this.closeSessions(repo.id),
      ...[...repo.services.values()]
        .filter((s) => s.process)
        .map((s) => this.stopService(repo.id, s.definition.id)),
      ...(install ? [install.stop(this.timings.gracefulStopMs)] : []),
    ]);
    if (this.repos.get(repoId) !== repo) return; // removed concurrently
    this.repos.delete(repoId);
    this.unwatchRepo(repo);
    await this.saveWorkspace();
    await deleteLocalConfig(this.appDataDir, repo.path);
    this.emit('repoChanged', { repoId, repo: null });
  }

  /**
   * Points a Repo at another folder (picker when `newPath` is omitted; `null` when cancelled),
   * keeping its name, color, position and Local Config. The Repo id changes with the path, so
   * `repoChanged` carries the old id and the new state.
   */
  async relocateRepo(repoId: string, newPath: string | undefined): Promise<RepoView | null> {
    const repo = this.getRepo(repoId);
    const picked = newPath ?? (await this.shell.pickFolder());
    if (picked === undefined) return null;
    const resolved = path.resolve(picked);
    const newId = repoIdFor(resolved);
    const other = newId === repoId ? undefined : this.repos.get(newId);
    if (other) {
      throw new DevPanelError(
        'repoAlreadyAdded',
        { path: resolved, repoName: other.name },
        `${resolved} is already in the Workspace as "${other.name}"`,
      );
    }
    await this.requireFolder(resolved);
    const liveSession = [...this.sessions.values()].some((s) => s.repoId === repoId && s.process);
    if ([...repo.services.values()].some((s) => s.process) || repo.install?.process || liveSession) {
      throw new DevPanelError('repoBusy', { repoName: repo.name }, `Repo "${repo.name}" has running processes`);
    }

    const oldLocal = localConfigPath(this.appDataDir, repo.path);
    const newLocal = localConfigPath(this.appDataDir, resolved);
    if (oldLocal !== newLocal && (await exists(oldLocal))) {
      await mkdir(path.dirname(newLocal), { recursive: true });
      await rename(oldLocal, newLocal);
    }
    this.unwatchRepo(repo);
    const moved = await this.createRepo(resolved, repo.name, repo.color);
    this.repos = new Map([...this.repos].map(([id, r]) => (id === repoId ? [moved.id, moved] : [id, r])));
    this.watchRepo(moved);
    await this.saveWorkspace();
    const view = this.repoView(moved);
    this.emit('repoChanged', { repoId, repo: view });
    // Finished Sessions (still shown in their tabs) follow the Repo to its new id.
    for (const session of this.sessions.values()) {
      if (session.repoId !== repoId || moved.id === repoId) continue;
      session.repoId = moved.id;
      this.emit('sessionChanged', { session: this.sessionView(session) });
    }
    return view;
  }

  /** Opens the Repo folder in Explorer (through the backend, never the browser). */
  async openFolder(repoId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    await this.requireRepoFolder(repo);
    await this.runShell(() => this.shell.openFolder(repo.path));
  }

  /** Opens a Service's configured `url` in the default browser (through the backend). */
  async openUrl(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const { definition } = this.getService(repo, serviceId);
    if (definition.url === undefined) {
      const serviceName = definition.name ?? definition.id;
      throw new DevPanelError(
        'serviceHasNoUrl',
        { repoName: repo.name, serviceName },
        `Service "${definition.id}" of Repo "${repo.name}" has no url`,
      );
    }
    const url = definition.url;
    await this.runShell(() => this.shell.openUrl(url));
  }

  private async runShell(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      throw new DevPanelError('shellFailed', {}, err instanceof Error ? err.message : String(err));
    }
  }

  /** Throws `repoFolderMissing` (and flags the Repo) when its folder is gone. */
  private async requireRepoFolder(repo: RepoState): Promise<void> {
    if (await isFolder(repo.path)) return;
    if (!repo.folderMissing) {
      repo.folderMissing = true;
      this.emit('repoChanged', { repoId: repo.id, repo: this.repoView(repo) });
    }
    throw new DevPanelError('repoFolderMissing', { repoName: repo.name }, `Folder not found: ${repo.path}`);
  }

  /** Builds a Repo's state (folder presence, branch, config); the caller starts watching it. */
  private async createRepo(repoPath: string, name: string, color: string | undefined): Promise<RepoState> {
    const resolved = path.resolve(repoPath);
    const folderMissing = !(await isFolder(resolved));
    const repo: RepoState = {
      id: repoIdFor(resolved),
      name,
      path: resolved,
      color,
      configSource: 'none',
      unusedLocalConfig: false,
      folderMissing,
      branch: folderMissing ? undefined : await readGitBranch(resolved),
      services: new Map(),
      reloading: Promise.resolve(),
    };
    await this.reloadConfig(repo);
    return repo;
  }

  private async requireFolder(folder: string): Promise<void> {
    if (!(await isFolder(folder))) {
      throw new DevPanelError('folderNotFound', { path: folder }, `${folder} is not an existing folder`);
    }
  }

  private requireFreeName(name: string, repoPath: string, exceptRepoId?: string): void {
    const taken = [...this.repos.values()].some(
      (r) => r.id !== exceptRepoId && r.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      throw new DevPanelError('repoNameTaken', { name, path: repoPath }, `A Repo named "${name}" already exists`);
    }
  }

  private async saveWorkspace(): Promise<void> {
    await writeWorkspace(this.appDataDir, {
      repos: [...this.repos.values()].map((r) => ({
        path: r.path,
        name: r.name,
        ...(r.color !== undefined && { color: r.color }),
      })),
    });
  }

  /** Full state for a (re)connecting client. */
  snapshot(): Snapshot {
    return { repos: this.listRepos(), sessions: this.listSessions() };
  }

  /** Starts a Service through `cmd.exe /d /s /c` in its working directory. */
  async startService(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const service = this.getService(repo, serviceId);
    if (service.process) return;
    await this.requireRepoFolder(repo);

    await this.ensurePnpm(repo);
    if (service.process) return;
    const { definition } = service;
    const cwd = path.resolve(repo.path, definition.cwd ?? '.');
    if (service.output.text()) this.appendOutput(repo, service, restartSeparator(service.output.text()));
    service.lastExit = undefined;
    this.setStatus(repo, service, 'starting');
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command: definition.command, cwd, env: definition.env, ...service.size });
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
      this.appendOutput(repo, service, data);
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
    service.stopping = proc.stop(this.timings.gracefulStopMs).finally(() => {
      service.stopping = undefined;
    });
    return service.stopping;
  }

  /** Stops the Service if it runs (waiting for the exit), then starts it again. */
  async restartService(repoId: string, serviceId: string): Promise<void> {
    await this.stopService(repoId, serviceId);
    await this.startService(repoId, serviceId);
  }

  /** The buffered recent output of a Service (raw, with ANSI sequences), for a newly opened tab. */
  getServiceOutput(repoId: string, serviceId: string): string {
    return this.getService(this.getRepo(repoId), serviceId).output.text();
  }

  /** Sends keyboard input to a Service's pty. Input for a Service that is not running is dropped. */
  writeToPty(repoId: string, serviceId: string, data: string): void {
    const service = this.getService(this.getRepo(repoId), serviceId);
    service.process?.write(data);
  }

  /** Resizes a Service's pty. Clients are equal peers: the most recent resize wins. */
  resizePty(repoId: string, serviceId: string, cols: number, rows: number): void {
    const service = this.getService(this.getRepo(repoId), serviceId);
    service.size = { cols, rows };
    service.process?.resize(cols, rows);
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

  // --- Sessions -------------------------------------------------------------------------------

  /** Opens a shell Session in the Repo folder. */
  async openTerminal(repoId: string): Promise<SessionView> {
    const repo = this.getRepo(repoId);
    await this.requireRepoFolder(repo);
    return this.openSession(repo, 'shell', this.environment.shellCommand);
  }

  /** Opens a Claude Code Session (`claude` through `cmd.exe`) in the Repo folder, after `where claude`. */
  async openClaude(repoId: string): Promise<SessionView> {
    const repo = this.getRepo(repoId);
    await this.requireRepoFolder(repo);
    if (!(await this.environment.isClaudeAvailable())) {
      throw new DevPanelError('claudeMissing', {}, '"where claude" found nothing on PATH');
    }
    return this.openSession(this.getRepo(repoId), 'claude', this.environment.claudeCommand);
  }

  /**
   * Ends a Session: kills its whole process tree if it still runs, then forgets it and emits
   * `sessionClosed`. Closing an unknown (already closed) Session does nothing.
   */
  closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return Promise.resolve();
    session.closing ??= (async () => {
      // No graceful period: closing the tab is the user's explicit "end it" (confirmed in the UI).
      await session.process?.stop(0);
      this.sessions.delete(session.id);
      this.emit('sessionClosed', { sessionId: session.id, repoId: session.repoId });
    })();
    return session.closing;
  }

  /** Buffered output of a Session (raw, with ANSI sequences), for a newly opened tab. */
  getSessionOutput(sessionId: string): string {
    return this.getSession(sessionId).output.text();
  }

  /** Keyboard input for a Session's pty; dropped once it has finished. */
  writeToSession(sessionId: string, data: string): void {
    this.getSession(sessionId).process?.write(data);
  }

  /** Resizes a Session's pty. Clients are equal peers: the most recent resize wins. */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    this.getSession(sessionId).process?.resize(cols, rows);
  }

  /** Open Sessions (running and finished), in opening order. */
  listSessions(): SessionView[] {
    return [...this.sessions.values()].map((s) => this.sessionView(s));
  }

  private openSession(repo: RepoState, kind: SessionKind, command: string): SessionView {
    const taken = new Set(
      [...this.sessions.values()].filter((s) => s.repoId === repo.id && s.kind === kind).map((s) => s.number),
    );
    let number = 1;
    while (taken.has(number)) number++;
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command, cwd: repo.path });
    } catch (err) {
      throw new DevPanelError(
        'sessionSpawnFailed',
        { repoName: repo.name },
        `Failed to spawn "${command}" in ${repo.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const session: SessionState = { id: randomUUID(), repoId: repo.id, kind, number, process: proc, output: new OutputBuffer() };
    this.sessions.set(session.id, session);
    proc.onData((data) => {
      session.output.append(data);
      this.emit('sessionOutput', { sessionId: session.id, data });
    });
    void proc.exited.then((exitCode) => {
      session.process = undefined;
      session.exitCode = exitCode;
      // Ended by `closeSession`: it is forgotten there; otherwise it stays listed as finished.
      if (session.closing || this.sessions.get(session.id) !== session) return;
      this.emit('sessionChanged', { session: this.sessionView(session) });
    });
    const view = this.sessionView(session);
    this.emit('sessionChanged', { session: view });
    return view;
  }

  private sessionView(session: SessionState): SessionView {
    return {
      id: session.id,
      repoId: session.repoId,
      kind: session.kind,
      number: session.number,
      state: session.process ? 'running' : 'finished',
      ...(session.exitCode !== undefined && { exitCode: session.exitCode }),
    };
  }

  private getSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new DevPanelError('sessionNotFound', {}, `Unknown Session "${sessionId}"`);
    return session;
  }

  /** Ends every Session of a Repo (all of them when `repoId` is omitted). */
  private closeSessions(repoId?: string): Promise<void[]> {
    return Promise.all(
      [...this.sessions.values()].filter((s) => repoId === undefined || s.repoId === repoId).map((s) => this.closeSession(s.id)),
    );
  }

  /** Stops every running Service, every Session and any running dependency install. */
  async shutdown(): Promise<void> {
    this.stopRepoRefresh();
    const stops: Promise<unknown>[] = [this.closeSessions()];
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
      ...(repo.folderMissing && { folderMissing: true }),
      ...(repo.branch !== undefined && { branch: repo.branch }),
      ...this.installView(repo),
      services: [...repo.services.values()].map(({ definition: d, status, lastExit, pending, removed }) => ({
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
      })),
    };
  }

  /**
   * Re-reads the Repo's config. A Repo Config takes precedence; without one the Local Config is
   * used; the two are never merged. An invalid file only sets `configError`: the last valid
   * Services stay active.
   */
  private async reloadConfig(repo: RepoState): Promise<void> {
    // A missing folder (deleted, drive disconnected) keeps the last known config: the Repo stays
    // listed as missing with its Services until it comes back or is relocated.
    if (!(await isFolder(repo.path))) return;
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
        next.set(definition.id, { definition, status: 'stopped', output: new OutputBuffer() });
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
    for (const repo of this.repos.values()) this.unwatchRepo(repo);
  }

  private unwatchRepo(repo: RepoState): void {
    repo.watcher?.close();
    repo.watcher = undefined;
    clearTimeout(repo.reloadTimer);
    repo.reloadTimer = undefined;
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

  /** Buffers output and emits it as `log`, so the buffer and the live stream never diverge. */
  private appendOutput(repo: RepoState, service: ServiceState, data: string): void {
    service.output.append(data);
    this.emit('log', { repoId: repo.id, serviceId: service.definition.id, data });
  }

  private setStatus(repo: RepoState, service: ServiceState, status: ServiceStatus): void {
    if (service.status === status) return;
    service.status = status;
    this.emit('statusChanged', { repoId: repo.id, serviceId: service.definition.id, status });
  }
}
