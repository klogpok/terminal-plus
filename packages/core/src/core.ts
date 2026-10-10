import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { ServiceStatus } from '@devpanel/shared';
import { readRepoConfig, type ServiceDefinition } from './config.js';
import { readWorkspace } from './workspace.js';
import { spawnService, type ServiceProcess } from './process.js';

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
}

export interface ServiceView {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  port?: number;
  url?: string;
  dependsOn: string[];
  status: ServiceStatus;
}

export interface RepoView {
  id: string;
  name: string;
  path: string;
  color?: string;
  /** Set when the Repo Config cannot be read or is invalid. */
  configError?: string;
  services: ServiceView[];
}

export interface StatusChangedEvent {
  repoId: string;
  serviceId: string;
  status: ServiceStatus;
}

export interface LogEvent {
  repoId: string;
  serviceId: string;
  /** A chunk of pty output, including ANSI sequences. */
  data: string;
}

export interface ExitEvent {
  repoId: string;
  serviceId: string;
  exitCode: number;
  /** True when the exit was caused by `stopService`. */
  stoppedByUser: boolean;
}

export interface CoreEvents {
  statusChanged: [StatusChangedEvent];
  log: [LogEvent];
  exit: [ExitEvent];
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

  constructor(options: CoreOptions) {
    super();
    this.appDataDir = options.appDataDir;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
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

  /** Starts a Service through `cmd.exe /d /s /c` in its working directory. */
  async startService(repoId: string, serviceId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    const service = this.getService(repo, serviceId);
    if (service.process) return;

    const { definition } = service;
    const cwd = path.resolve(repo.path, definition.cwd ?? '.');
    this.setStatus(repo, service, 'starting');
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command: definition.command, cwd, env: definition.env });
    } catch (err) {
      this.setStatus(repo, service, 'crashed');
      throw err;
    }
    service.process = proc;
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

  /** Stops every running Service. */
  async shutdown(): Promise<void> {
    const stops: Promise<void>[] = [];
    for (const repo of this.repos.values()) {
      for (const service of repo.services.values()) {
        if (service.process) stops.push(this.stopService(repo.id, service.definition.id));
      }
    }
    await Promise.all(stops);
  }

  private getRepo(repoId: string): RepoState {
    const repo = this.repos.get(repoId);
    if (!repo) throw new Error(`Unknown Repo "${repoId}"`);
    return repo;
  }

  private getService(repo: RepoState, serviceId: string): ServiceState {
    const service = repo.services.get(serviceId);
    if (!service) throw new Error(`Unknown Service "${serviceId}" in Repo "${repo.name}"`);
    return service;
  }

  private setStatus(repo: RepoState, service: ServiceState, status: ServiceStatus): void {
    if (service.status === status) return;
    service.status = status;
    this.emit('statusChanged', { repoId: repo.id, serviceId: service.definition.id, status });
  }
}
