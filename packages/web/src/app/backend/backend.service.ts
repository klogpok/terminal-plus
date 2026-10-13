import { Injectable, inject, signal } from '@angular/core';
import type {
  CommandPayload,
  CommandResult,
  CommandType,
  EventMessage,
  EventType,
  Events,
  NewService,
  Orphan,
  RepoChangedEvent,
  RepoView,
  ServerMessage,
  ServiceConfig,
  ServiceRef,
  ServiceSetView,
  ServiceStatus,
  ServiceView,
  SessionKind,
  SessionView,
  UiLanguage,
} from '@devpanel/shared';
import { describeError, loadedUiLanguage, type UiErrorInfo } from '../ui-strings';
import { RELOAD_PAGE, cacheUiLanguage } from '../ui-language';
import { BACKEND_TRANSPORT } from './backend-transport';

export type ConnectionState = 'connecting' | 'open' | 'closed';

/** "Exit DevPanel" from this tab: not requested, stopping everything, or done (Server gone). */
export type ExitState = 'none' | 'exiting' | 'exited';

/** An error shown to the user: plain-language message + technical details under "Details". */
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
  private readonly reloadPage = inject(RELOAD_PAGE);
  /** The Server's UI Language this tab could not switch to (already reported), if any. */
  private unfollowedUiLanguage: UiLanguage | undefined;

  private readonly connectionState = signal<ConnectionState>('connecting');
  private readonly connectionDetailsState = signal('');
  private readonly reposState = signal<RepoView[]>([]);
  private readonly sessionsState = signal<SessionView[]>([]);
  private readonly errorsState = signal<UiError[]>([]);
  private readonly installTabsState = signal<InstallTab[]>([]);

  readonly connection = this.connectionState.asReadonly();
  /** Technical reason of the last disconnect. */
  readonly connectionDetails = this.connectionDetailsState.asReadonly();
  readonly repos = this.reposState.asReadonly();
  /** Open Sessions (running or finished), in opening order; each has one tab. */
  readonly sessions = this.sessionsState.asReadonly();
  private readonly orphansState = signal<Orphan[]>([]);
  /** Processes left over from a previous run of the Server, not killed yet. */
  readonly orphans = this.orphansState.asReadonly();
  private readonly serviceSetsState = signal<ServiceSetView[]>([]);
  /** The Service Sets of the Server's machine, in creation order. */
  readonly serviceSets = this.serviceSetsState.asReadonly();
  private readonly exitState = signal<ExitState>('none');
  /** "Exit DevPanel" progress in this tab. */
  readonly exit = this.exitState.asReadonly();
  readonly errors = this.errorsState.asReadonly();
  /** Open `pnpm install` output tabs (one per Repo). */
  readonly installTabs = this.installTabsState.asReadonly();

  private nextCommandId = 1;
  private nextErrorId = 1;
  /** `reposReordered` events received; a failed `moveRepo` must not undo an order stored meanwhile. */
  private serverReorders = 0;
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

  /** Frees the Service's port (stops our Service or kills the foreign process), then starts it. */
  resolvePortConflict(repoId: string, serviceId: string): void {
    this.run('resolvePortConflict', { repoId, serviceId });
  }

  /** Dismiss: a `crashed`/`exited` Service becomes `stopped` without starting. */
  dismissExit(repoId: string, serviceId: string): void {
    this.run('dismissExit', { repoId, serviceId });
  }

  stopService(repoId: string, serviceId: string): void {
    this.run('stopService', { repoId, serviceId });
  }

  restartService(repoId: string, serviceId: string): void {
    this.run('restartService', { repoId, serviceId });
  }

  /** "Start all" of one Repo (dependsOn order is kept by the Server). */
  startAll(repoId: string): void {
    this.run('startAll', { repoId });
  }

  /** "Stop all" of one Repo: Services only, never Sessions. */
  stopAll(repoId: string): void {
    this.run('stopAll', { repoId });
  }

  /** "Stop everything in all Repos": every Service in the Workspace, never Sessions. */
  stopAllRepos(): void {
    this.run('stopAllRepos', {});
  }

  /** "Exit DevPanel" (the UI confirms first): stops every Service and Session, then the Server. */
  exitDevPanel(): void {
    this.exitState.set('exiting');
    this.command('shutdown', {}).then(
      () => this.exitState.set('exited'),
      (error: UiErrorInfo) => {
        this.exitState.set('none');
        this.showError(error);
      },
    );
  }

  /** Asks the Server to store the UI Language; every tab reloads on `uiLanguageChanged`. */
  setUiLanguage(language: UiLanguage): void {
    this.run('setUiLanguage', { language });
  }

  /** Kills every Orphan (each with its whole process tree). */
  killOrphans(): void {
    this.run('killOrphans', {});
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

  /** Adds a Service to the Repo's Local Config; rejects with `UiErrorInfo` for the form to show. */
  async addLocalService(repoId: string, service: NewService): Promise<void> {
    await this.command('addLocalService', { repoId, service });
  }

  /** Creates a Service Set; rejects with `UiErrorInfo` (e.g. `serviceSetNameTaken`) for the dialog to show. */
  async createServiceSet(name: string, services: ServiceRef[]): Promise<ServiceSetView> {
    const set = await this.command('createServiceSet', { name, services });
    // `serviceSetsChanged` brings the same list; adding it now shows it without waiting.
    this.serviceSetsState.update((sets) => (sets.some((s) => s.id === set.id) ? sets : [...sets, set]));
    return set;
  }

  /** Removes a Service from the Repo's Local Config (the Server stops it first when it runs). */
  removeLocalService(repoId: string, serviceId: string): void {
    this.run('removeLocalService', { repoId, serviceId });
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

  /**
   * Moves a Repo to `toIndex` in the list at once and asks the Server to store the order; when that
   * fails, the previous order comes back (unless the Server sent another order meanwhile) and the
   * error is shown.
   */
  moveRepo(repoId: string, toIndex: number): void {
    const before = this.reposState();
    const from = before.findIndex((r) => r.id === repoId);
    if (from < 0 || from === toIndex) return;
    const moved = before.filter((r) => r.id !== repoId);
    moved.splice(toIndex, 0, before[from]!);
    this.reposState.set(moved);
    const reorderedBefore = this.serverReorders;
    this.command('moveRepo', { repoId, toIndex }).catch((error: UiErrorInfo) => {
      if (this.serverReorders === reorderedBefore) this.reorderRepos(before.map((r) => r.id));
      this.showError(error);
    });
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

  /**
   * Opens a Claude Code or shell Session in the Repo folder. Resolves with the new Session, or
   * `undefined` when it failed (the error, e.g. "Claude Code is not installed", is shown).
   */
  async openSession(repoId: string, kind: SessionKind): Promise<SessionView | undefined> {
    try {
      const session = await this.command(kind === 'claude' ? 'openClaude' : 'openTerminal', { repoId });
      this.applySession(session);
      return session;
    } catch (error) {
      this.showError(error as UiErrorInfo);
      return undefined;
    }
  }

  /** Ends a Session (its process tree is killed if it still runs) and drops its tab. */
  closeSession(sessionId: string): void {
    this.command('closeSession', { sessionId }).then(
      () => this.forgetSession(sessionId),
      (error: UiErrorInfo) => {
        // Already gone on the Server (e.g. it restarted): just drop the tab.
        if (error.code === 'sessionNotFound') this.forgetSession(sessionId);
        else this.showError(error);
      },
    );
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
    this.command(type, payload).catch((error: UiErrorInfo) => {
      // A port conflict (from a start, restart or start all) is shown on the Service itself
      // (`portConflict`), with its button; listing it again would only duplicate it.
      if (error.code !== 'portTaken') this.showError(error);
    });
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
      (snapshot) => {
        this.reposState.set(snapshot.repos);
        this.sessionsState.set(snapshot.sessions);
        this.orphansState.set(snapshot.orphans ?? []);
        this.serviceSetsState.set(snapshot.serviceSets);
        this.followUiLanguage(snapshot.uiLanguage);
      },
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
      case 'waitingChanged': {
        const { repoId, serviceId, waitingFor } = event.payload;
        this.updateService(repoId, serviceId, ({ waitingFor: _old, ...service }) =>
          waitingFor ? { ...service, waitingFor } : service,
        );
        break;
      }
      case 'configChanged': {
        const { repo } = event.payload;
        this.reposState.update((repos) => repos.map((r) => (r.id === repo.id ? repo : r)));
        break;
      }
      case 'repoChanged':
        this.applyRepoChange(event.payload);
        break;
      case 'reposReordered':
        this.serverReorders++;
        this.reorderRepos(event.payload.repoIds);
        break;
      case 'orphansFound':
        this.orphansState.set(event.payload.orphans);
        break;
      case 'sessionChanged':
        this.applySession(event.payload.session);
        break;
      case 'sessionClosed':
        this.forgetSession(event.payload.sessionId);
        break;
      case 'uiLanguageChanged':
        this.followUiLanguage(event.payload.language);
        break;
      case 'serviceSetsChanged':
        this.serviceSetsState.set(event.payload.serviceSets);
        break;
    }
  }

  /**
   * The Server's UI Language is the source of truth: when it differs from the loaded string set,
   * cache it and reload the page in it. Services and Sessions keep running; the page restores them.
   * When it cannot be cached the reload would open in the old language again (and again), so the
   * tab stays and says why, once per language.
   */
  private followUiLanguage(language: UiLanguage): void {
    if (language === loadedUiLanguage()) return;
    if (cacheUiLanguage(language)) {
      this.reloadPage();
    } else if (this.unfollowedUiLanguage !== language) {
      this.unfollowedUiLanguage = language;
      this.showError({
        code: 'uiLanguageNotFollowed',
        params: {},
        details: `The UI Language is now "${language}", but the browser storage (localStorage) is unavailable.`,
      });
    }
  }

  /** Adds or replaces a Session (idempotent: command results and events may both arrive). */
  private applySession(session: SessionView): void {
    this.sessionsState.update((sessions) =>
      sessions.some((s) => s.id === session.id)
        ? sessions.map((s) => (s.id === session.id ? session : s))
        : [...sessions, session],
    );
  }

  private forgetSession(sessionId: string): void {
    this.sessionsState.update((sessions) => sessions.filter((s) => s.id !== sessionId));
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

  /** Puts the Repos in the order of `repoIds`; unknown ids are ignored, unlisted Repos keep their order at the end. */
  private reorderRepos(repoIds: string[]): void {
    const rank = new Map(repoIds.map((id, i) => [id, i]));
    const rankOf = (repo: RepoView) => rank.get(repo.id) ?? repoIds.length;
    // Array sort is stable: unlisted Repos (equal rank) keep their relative order.
    this.reposState.update((repos) => [...repos].sort((a, b) => rankOf(a) - rankOf(b)));
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
