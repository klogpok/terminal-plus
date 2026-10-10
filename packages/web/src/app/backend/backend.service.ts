import { Injectable, inject, signal } from '@angular/core';
import type {
  CommandPayload,
  CommandResult,
  CommandType,
  EventMessage,
  EventType,
  Events,
  RepoChangedEvent,
  RepoView,
  ServerMessage,
  ServiceConfig,
  ServiceStatus,
} from '@devpanel/shared';
import { describeError, type UiErrorInfo } from '../strings';
import { BACKEND_TRANSPORT } from './backend-transport';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** An error shown to the user: plain-Russian message + technical details under "Details". */
export interface UiError {
  id: number;
  message: string;
  details: string;
}

interface Pending {
  resolve(result: unknown): void;
  reject(error: UiErrorInfo): void;
}

/**
 * The single gateway between Angular components and the DevPanel Server. Holds the shared state as
 * signals, sends commands, and applies events. Components never touch the transport.
 */
@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly transport = inject(BACKEND_TRANSPORT);

  private readonly connectionState = signal<ConnectionState>('connecting');
  private readonly connectionDetailsState = signal('');
  private readonly reposState = signal<RepoView[]>([]);
  private readonly errorsState = signal<UiError[]>([]);

  readonly connection = this.connectionState.asReadonly();
  /** Technical reason of the last disconnect. */
  readonly connectionDetails = this.connectionDetailsState.asReadonly();
  readonly repos = this.reposState.asReadonly();
  readonly errors = this.errorsState.asReadonly();

  private nextCommandId = 1;
  private nextErrorId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<EventType, Set<(payload: never) => void>>();

  constructor() {
    this.transport.connect({
      open: () => this.onOpen(),
      message: (message) => this.onMessage(message),
      close: (details) => this.onClose(details),
    });
  }

  // --- Commands -------------------------------------------------------------------------------

  startService(repoId: string, serviceId: string): void {
    this.run('startService', { repoId, serviceId });
  }

  stopService(repoId: string, serviceId: string): void {
    this.run('stopService', { repoId, serviceId });
  }

  restartService(repoId: string, serviceId: string): void {
    this.run('restartService', { repoId, serviceId });
  }

  saveLocalConfig(repoId: string, services: ServiceConfig[]): void {
    this.run('saveLocalConfig', { repoId, services });
  }

  deleteLocalConfig(repoId: string): void {
    this.run('deleteLocalConfig', { repoId });
  }

  /**
   * Adds a Repo. Without `path` the Server shows its folder picker. Resolves with `null` when the
   * user cancelled; rejects with the `UiErrorInfo` (e.g. `repoNameTaken`) for the caller to handle.
   */
  async addRepo(options: { path?: string; name?: string } = {}): Promise<RepoView | null> {
    const repo = await this.command('addRepo', options);
    if (repo) this.applyRepoChange({ repoId: repo.id, repo });
    return repo;
  }

  removeRepo(repoId: string): void {
    this.run('removeRepo', { repoId });
  }

  /** Lets the user pick the new folder of a Repo (picker shown by the Server). */
  relocateRepo(repoId: string): void {
    this.command('relocateRepo', { repoId }).then(
      (repo) => repo && this.applyRepoChange({ repoId, repo }),
      (error: UiErrorInfo) => this.showError(error),
    );
  }

  openFolder(repoId: string): void {
    this.run('openFolder', { repoId });
  }

  openUrl(repoId: string, serviceId: string): void {
    this.run('openUrl', { repoId, serviceId });
  }

  /** Sends a command; rejects with a `UiErrorInfo`. Use `run` for fire-and-forget UI actions. */
  command<K extends CommandType>(type: K, payload: CommandPayload<K>): Promise<CommandResult<K>> {
    if (this.connectionState() !== 'open') {
      return Promise.reject(this.connectionLost('not connected'));
    }
    const id = this.nextCommandId++;
    return new Promise<CommandResult<K>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
      this.transport.send({ kind: 'command', id, type, payload } as never);
    });
  }

  /** Sends a command and shows any failure as a UI error. */
  run<K extends CommandType>(type: K, payload: CommandPayload<K>): void {
    this.command(type, payload).catch((error: UiErrorInfo) => this.showError(error));
  }

  // --- Events ---------------------------------------------------------------------------------

  /** Subscribes to a Server event (for features that need more than the state signals). */
  on<K extends EventType>(type: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  // --- Errors ---------------------------------------------------------------------------------

  showError(error: UiErrorInfo): void {
    const uiError: UiError = { id: this.nextErrorId++, message: describeError(error), details: error.details };
    this.errorsState.update((errors) => [...errors, uiError]);
  }

  dismissError(id: number): void {
    this.errorsState.update((errors) => errors.filter((e) => e.id !== id));
  }

  // --- Transport callbacks --------------------------------------------------------------------

  private onOpen(): void {
    this.connectionState.set('open');
    this.connectionDetailsState.set('');
    // A (re)connecting client rebuilds everything from a snapshot.
    this.command('getSnapshot', {}).then(
      (snapshot) => this.reposState.set(snapshot.repos),
      (error: UiErrorInfo) => this.showError(error),
    );
  }

  private onClose(details: string): void {
    this.connectionState.set('closed');
    this.connectionDetailsState.set(details);
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(this.connectionLost(details));
  }

  private onMessage(message: ServerMessage): void {
    if (message.kind === 'reply') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(message.error);
      return;
    }
    this.applyEvent(message);
    for (const listener of this.listeners.get(message.type) ?? []) listener(message.payload as never);
  }

  /** State updates for events; add a case when an event changes the shared state. */
  private applyEvent(event: EventMessage): void {
    switch (event.type) {
      case 'statusChanged': {
        const { repoId, serviceId, status } = event.payload;
        this.setServiceStatus(repoId, serviceId, status);
        break;
      }
      case 'exit':
        break;
      case 'configChanged': {
        const { repo } = event.payload;
        this.reposState.update((repos) => repos.map((r) => (r.id === repo.id ? repo : r)));
        break;
      }
      case 'repoChanged':
        this.applyRepoChange(event.payload);
        break;
    }
  }

  /**
   * Added (unknown id), changed, relocated (new id: replaced in place) or removed (`repo: null`).
   * Idempotent, so a command result and the matching event can both be applied.
   */
  private applyRepoChange({ repoId, repo }: RepoChangedEvent): void {
    this.reposState.update((repos) => {
      if (!repo) return repos.filter((r) => r.id !== repoId);
      // Replace the entry known by the old id, else the one already carrying the new id.
      let index = repos.findIndex((r) => r.id === repoId);
      if (index < 0) index = repos.findIndex((r) => r.id === repo.id);
      if (index < 0) return [...repos, repo];
      return repos.flatMap((r, i) => (i === index ? [repo] : r.id === repo.id ? [] : [r]));
    });
  }

  private setServiceStatus(repoId: string, serviceId: string, status: ServiceStatus): void {
    this.reposState.update((repos) =>
      repos.map((repo) =>
        repo.id !== repoId
          ? repo
          : { ...repo, services: repo.services.map((s) => (s.id === serviceId ? { ...s, status } : s)) },
      ),
    );
  }

  private connectionLost(details: string): UiErrorInfo {
    return { code: 'connectionLost', params: {}, details };
  }
}
