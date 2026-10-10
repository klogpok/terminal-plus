import { EventEmitter } from 'node:events';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DevPanelError,
  type ExitEvent,
  type LogEvent,
  type RepoChangedEvent,
  type RepoView,
  type ServiceStatus,
  type Snapshot,
  type StatusChangedEvent,
} from '@devpanel/shared';
import { readRepoConfig, type ServiceDefinition } from './config.js';
import { readWorkspace, writeWorkspace } from './workspace.js';
import { spawnService, type ServiceProcess } from './process.js';
import { windowsShell, type DesktopShell } from './shell.js';
import { localConfigPath, repoIdFor } from './local-config.js';
import { readGitBranch } from './git.js';

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
  repoChanged: [RepoChangedEvent];
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
  folderMissing: boolean;
  branch?: string;
  services: Map<string, ServiceState>;
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

/**
 * DevPanel core: all process and configuration logic. Has no dependency on any transport.
 */
export class DevPanelCore extends EventEmitter<CoreEvents> {
  readonly timings: CoreTimings;
  readonly appDataDir: string;
  private readonly shell: DesktopShell;
  private repos = new Map<string, RepoState>();
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(options: CoreOptions) {
    super();
    this.appDataDir = options.appDataDir;
    this.shell = options.shell ?? windowsShell;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
  }

  /** Reads the Workspace file and each Repo's Repo Config. */
  async load(): Promise<void> {
    const workspace = await readWorkspace(this.appDataDir);
    const repos = new Map<string, RepoState>();
    for (const entry of workspace.repos) {
      const repo = await this.readRepo(entry.path, entry.name, entry.color);
      repos.set(repo.id, repo);
    }
    this.repos = repos;
    this.startRepoRefresh();
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
    repo.folderMissing = missing;
    repo.branch = branch;
    if (cameBack && ![...repo.services.values()].some((s) => s.process)) {
      // The folder is back (e.g. a drive reconnected): its config may only now be readable.
      const fresh = await this.readRepo(repo.path, repo.name, repo.color);
      repo.services = fresh.services;
      repo.configError = fresh.configError;
    }
    this.emit('repoChanged', { repoId: repo.id, repo: this.viewOf(repo) });
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

    const repo = await this.readRepo(repoPath, name, color);
    this.repos.set(repo.id, repo);
    await this.saveWorkspace();
    const view = this.viewOf(repo);
    this.emit('repoChanged', { repoId: repo.id, repo: view });
    return view;
  }

  /**
   * Removes a Repo from the Workspace: stops every process it owns (the client confirms first,
   * listing them), deletes its Local Config, and never touches the Repo folder.
   */
  async removeRepo(repoId: string): Promise<void> {
    const repo = this.getRepo(repoId);
    // Ticket 09: also close the Repo's Sessions here.
    await Promise.all(
      [...repo.services.values()]
        .filter((s) => s.process)
        .map((s) => this.stopService(repo.id, s.definition.id)),
    );
    if (this.repos.get(repoId) !== repo) return; // removed concurrently
    this.repos.delete(repoId);
    await this.saveWorkspace();
    await rm(localConfigPath(this.appDataDir, repo.path), { force: true });
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
    if ([...repo.services.values()].some((s) => s.process)) {
      throw new DevPanelError('repoBusy', { repoName: repo.name }, `Repo "${repo.name}" has running Services`);
    }

    const oldLocal = localConfigPath(this.appDataDir, repo.path);
    const newLocal = localConfigPath(this.appDataDir, resolved);
    if (oldLocal !== newLocal && (await exists(oldLocal))) {
      await mkdir(path.dirname(newLocal), { recursive: true });
      await rename(oldLocal, newLocal);
    }
    const moved = await this.readRepo(resolved, repo.name, repo.color);
    this.repos = new Map([...this.repos].map(([id, r]) => (id === repoId ? [moved.id, moved] : [id, r])));
    await this.saveWorkspace();
    const view = this.viewOf(moved);
    this.emit('repoChanged', { repoId, repo: view });
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
      this.emit('repoChanged', { repoId: repo.id, repo: this.viewOf(repo) });
    }
    throw new DevPanelError('repoFolderMissing', { repoName: repo.name }, `Folder not found: ${repo.path}`);
  }

  private async readRepo(repoPath: string, name: string, color: string | undefined): Promise<RepoState> {
    const resolved = path.resolve(repoPath);
    const folderMissing = !(await isFolder(resolved));
    const repo: RepoState = {
      id: repoIdFor(resolved),
      name,
      path: resolved,
      color,
      folderMissing,
      branch: folderMissing ? undefined : await readGitBranch(resolved),
      services: new Map(),
    };
    if (folderMissing) return repo;
    const result = await readRepoConfig(resolved);
    if (!result.ok) {
      repo.configError = result.error;
    } else {
      for (const definition of result.config?.services ?? []) {
        repo.services.set(definition.id, { definition, status: 'stopped' });
      }
    }
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

  listRepos(): RepoView[] {
    return [...this.repos.values()].map((repo) => this.viewOf(repo));
  }

  private viewOf(repo: RepoState): RepoView {
    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      ...(repo.color !== undefined && { color: repo.color }),
      ...(repo.configError !== undefined && { configError: repo.configError }),
      ...(repo.folderMissing && { folderMissing: true }),
      ...(repo.branch !== undefined && { branch: repo.branch }),
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
    };
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
    await this.requireRepoFolder(repo);

    const { definition } = service;
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

  /** Stops every running Service. */
  async shutdown(): Promise<void> {
    this.stopRepoRefresh();
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
