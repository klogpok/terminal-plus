import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  DevPanelError,
  type ExitEvent,
  type InstallChangedEvent,
  type InstallOutputEvent,
  type InstallResult,
  type InstallState,
  type LogEvent,
  type RepoView,
  type ServiceStatus,
  type Snapshot,
  type StatusChangedEvent,
} from '@devpanel/shared';
import { readRepoConfig, type ServiceDefinition } from './config.js';
import { readWorkspace } from './workspace.js';
import { spawnService, type ServiceProcess } from './process.js';
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
  /** Tool environment (pnpm probe, install command); tests replace it. */
  environment?: Partial<Environment>;
}

export interface CoreEvents {
  statusChanged: [StatusChangedEvent];
  log: [LogEvent];
  exit: [ExitEvent];
  installOutput: [InstallOutputEvent];
  installChanged: [InstallChangedEvent];
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
}

interface RepoState {
  id: string;
  name: string;
  path: string;
  color?: string;
  configError?: string;
  /** The last `installDependencies` run, if any. */
  install?: InstallRun;
  services: Map<string, ServiceState>;
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

  /** Reads the Workspace file and each Repo's Repo Config. */
  async load(): Promise<void> {
    const workspace = await readWorkspace(this.appDataDir);
    const repos = new Map<string, RepoState>();
    for (const entry of workspace.repos) {
      const repoPath = path.resolve(entry.path);
      const repo: RepoState = {
        id: repoIdFor(repoPath),
        name: entry.name,
        path: repoPath,
        color: entry.color,
        services: new Map(),
      };
      const result = await readRepoConfig(repoPath);
      if (!result.ok) {
        repo.configError = result.error;
      } else {
        for (const definition of result.config?.services ?? []) {
          repo.services.set(definition.id, { definition, status: 'stopped' });
        }
      }
      repos.set(repo.id, repo);
    }
    this.repos = repos;
  }

  listRepos(): RepoView[] {
    return [...this.repos.values()].map((repo) => ({
      id: repo.id,
      name: repo.name,
      path: repo.path,
      ...(repo.color !== undefined && { color: repo.color }),
      ...(repo.configError !== undefined && { configError: repo.configError }),
      ...this.installView(repo),
      services: [...repo.services.values()].map(({ definition: d, status }) => ({
        id: d.id,
        name: d.name ?? d.id,
        command: d.command,
        ...(d.cwd !== undefined && { cwd: d.cwd }),
        ...(d.port !== undefined && { port: d.port }),
        ...(d.url !== undefined && { url: d.url }),
        dependsOn: d.dependsOn ?? [],
        status,
      })),
    }));
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

    const { definition } = service;
    await this.ensurePnpm(repo);
    if (service.process) return;
    const cwd = path.resolve(repo.path, definition.cwd ?? '.');
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
    // No readiness checks yet (ticket 04): a spawned Service counts as running right away.
    this.setStatus(repo, service, 'running');
    proc.onData((data) => this.emit('log', { repoId: repo.id, serviceId, data }));
    proc.exited.then((exitCode) => {
      service.process = undefined;
      const stoppedByUser = service.stopping !== undefined;
      this.setStatus(repo, service, stoppedByUser ? 'stopped' : exitCode === 0 ? 'exited' : 'crashed');
      this.emit('exit', { repoId: repo.id, serviceId, exitCode, stoppedByUser });
    });
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
