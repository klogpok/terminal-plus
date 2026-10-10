import { Injectable, inject, signal } from '@angular/core';
import type {
  CommandPayload,
  CommandResult,
  CommandType,
  EventMessage,
  EventType,
  Events,
  RepoView,
  ServerMessage,
  ServiceConfig,
  ServiceStatus,
  ServiceView,
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

/**
 * Output of one `pnpm install` run, shown in its own tab. Minimal plain-text host until the
 * terminal tabs (ticket 03) can show it in xterm; `output` is raw pty data (with ANSI).
 */
export interface InstallTab {
  repoId: string;
  output: string;
  state: 'running' | 'succeeded' | 'failed';
  exitCode?: number;
}

/** Keep at most this much install output per tab (characters, tail kept). */
const INSTALL_OUTPUT_LIMIT = 500_000;

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
  private readonly installTabsState = signal<InstallTab[]>([]);

  readonly connection = this.connectionState.asReadonly();
  /** Technical reason of the last disconnect. */
  readonly connectionDetails = this.connectionDetailsState.asReadonly();
  readonly repos = this.reposState.asReadonly();
  readonly errors = this.errorsState.asReadonly();
  /** Open `pnpm install` output tabs (one per Repo). */
  readonly installTabs = this.installTabsState.asReadonly();

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
    this.command('startService', { repoId, serviceId }).catch((error: UiErrorInfo) => {
      // A port conflict is shown on the Service itself (`portConflict`), with its button.
      if (error.code !== 'portTaken') this.showError(error);
    });
  }

  /** Frees the Service's port (stops our Service or kills the foreign process), then starts it. */
  resolvePortConflict(repoId: string, serviceId: string): void {
    this.run('resolvePortConflict', { repoId, serviceId });
  }

  stopService(repoId: string, serviceId: string): void {
    this.run('stopService', { repoId, serviceId });
  }

  restartService(repoId: string, serviceId: string): void {
    this.run('restartService', { repoId, serviceId });
  }

  /** Runs `pnpm install` in a pnpm Repo and opens a tab with its output. */
  installDependencies(repoId: string): void {
    this.updateInstallTab(repoId, () => ({ repoId, output: '', state: 'running' }));
    this.command('installDependencies', { repoId }).then(
      ({ ok, exitCode }) =>
        this.updateInstallTab(repoId, (tab) => ({ ...tab!, state: ok ? 'succeeded' : 'failed', exitCode })),
      (error: UiErrorInfo) => {
        this.closeInstallTab(repoId);
        this.showError(error);
      },
    );
  }

  closeInstallTab(repoId: string): void {
    this.installTabsState.update((tabs) => tabs.filter((t) => t.repoId !== repoId));
  }

  saveLocalConfig(repoId: string, services: ServiceConfig[]): void {
    this.run('saveLocalConfig', { repoId, services });
  }

  deleteLocalConfig(repoId: string): void {
    this.run('deleteLocalConfig', { repoId });
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
      case 'exit': {
        const { repoId, serviceId, exitCode, stoppedByUser, lastLines } = event.payload;
        if (!stoppedByUser) this.updateService(repoId, serviceId, (s) => ({ ...s, lastExit: { exitCode, lastLines } }));
        break;
      }
      case 'installChanged': {
        const { repoId, install } = event.payload;
        this.reposState.update((repos) =>
          repos.map((repo) => {
            if (repo.id !== repoId) return repo;
            const { install: _old, ...rest } = repo;
            return install ? { ...rest, install } : rest;
          }),
        );
        if (install?.state === 'running') {
          // Another client may have started it: open (or reset) the tab here too.
          this.updateInstallTab(repoId, (tab) =>
            tab?.state === 'running' ? tab : { repoId, output: '', state: 'running' },
          );
        } else if (install?.state === 'failed') {
          this.updateInstallTab(repoId, (tab) => tab && { ...tab, state: 'failed', exitCode: install.exitCode });
        } else if (install === undefined) {
          this.updateInstallTab(repoId, (tab) => tab && { ...tab, state: 'succeeded', exitCode: 0 });
        }
        break;
      }
      case 'installOutput': {
        const { repoId, data } = event.payload;
        this.updateInstallTab(repoId, (tab) => {
          const current = tab ?? { repoId, output: '', state: 'running' as const };
          return { ...current, output: (current.output + data).slice(-INSTALL_OUTPUT_LIMIT) };
        });
        break;
      }
      case 'portConflictChanged': {
        const { repoId, serviceId, portConflict } = event.payload;
        this.updateService(repoId, serviceId, ({ portConflict: _old, ...service }) =>
          portConflict ? { ...service, portConflict } : service,
        );
        break;
      }
      case 'configChanged': {
        const { repo } = event.payload;
        this.reposState.update((repos) => repos.map((r) => (r.id === repo.id ? repo : r)));
        break;
      }
    }
  }

  /** Replaces (or adds, when `change` returns a tab for a missing one) the install tab of a Repo. */
  private updateInstallTab(repoId: string, change: (tab: InstallTab | undefined) => InstallTab | undefined): void {
    this.installTabsState.update((tabs) => {
      const index = tabs.findIndex((t) => t.repoId === repoId);
      const next = change(tabs[index]);
      if (!next) return tabs;
      return index < 0 ? [...tabs, next] : tabs.map((t, i) => (i === index ? next : t));
    });
  }

  private setServiceStatus(repoId: string, serviceId: string, status: ServiceStatus): void {
    this.updateService(repoId, serviceId, ({ lastExit, ...service }) =>
      // Exit details belong to `crashed`/`exited` only; a new start clears them.
      status === 'crashed' || status === 'exited'
        ? { ...service, status, ...(lastExit !== undefined && { lastExit }) }
        : { ...service, status },
    );
  }

  private updateService(repoId: string, serviceId: string, change: (service: ServiceView) => ServiceView): void {
    this.reposState.update((repos) =>
      repos.map((repo) =>
        repo.id !== repoId
          ? repo
          : { ...repo, services: repo.services.map((s) => (s.id === serviceId ? change(s) : s)) },
      ),
    );
  }

  private connectionLost(details: string): UiErrorInfo {
    return { code: 'connectionLost', params: {}, details };
  }
}
