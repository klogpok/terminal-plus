/**
 * Message contract and types shared by `core`, `server` and `web`.
 *
 * Adding a command: add an entry to `Commands` (payload + result), then add its handler in
 * `packages/server/src/commands.ts` (the compiler insists) and a method on the web `BackendService`.
 * Adding an event: add an entry to `Events`, emit it from `core` under the same name, list it in
 * `FORWARDED_EVENTS` in `packages/server/src/server.ts`, and handle it in `BackendService`.
 *
 * `web` must only `import type` from this package (the Angular build does not bundle it).
 */

export * from './errors.js';
export * from './strings.js';
import type { ErrorInfo } from './errors.js';

// ---------------------------------------------------------------------------------------------
// Domain views
// ---------------------------------------------------------------------------------------------

/** Service Status, see GLOSSARY.md. */
export type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'stopping'
  | 'crashed'
  | 'exited';

export interface ServiceView {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  port?: number;
  url?: string;
  dependsOn: string[];
  status: ServiceStatus;
  /** How the Service ended by itself; set only while it is `crashed` or `exited`. */
  lastExit?: ExitDetails;
  /** The config changed while the Service was running; it still runs the old definition until restarted. */
  configChanged?: boolean;
  /** The Service is gone from the config but still running; it disappears once it stops. */
  removedFromConfig?: boolean;
  /** Its port is held by someone else: a start was blocked, or the port stayed taken after a Stop. */
  portConflict?: PortConflict;
  /**
   * A start is waiting for these dependencies (names, dependsOn order) to become `running`. The
   * Status stays `stopped` meanwhile; stopping the Service cancels the start.
   */
  waitingFor?: string[];
}

/**
 * Who holds a port, classified by `kind`. Add a kind here (and a case in the UI strings) to support
 * a new owner; ticket 07 adds Orphans.
 */
export type PortOwner =
  /** A DevPanel Service (of another Repo, or another Service of the same Repo). */
  | { kind: 'service'; pid: number; repoId: string; repoName: string; serviceId: string; serviceName: string }
  /** Any other process. */
  | { kind: 'process'; pid: number; processName: string }
  /** An Orphan: a process left over from a previous run of the DevPanel Server. */
  | { kind: 'orphan'; pid: number; orphan: Orphan };

export type PortOwnerKind = PortOwner['kind'];

/** A port held by someone else, attached to the Service that needs it. */
export interface PortConflict {
  port: number;
  owner: PortOwner;
  /**
   * `start`: the port blocked a start; resolving frees it and starts the Service.
   * `stop`: the port stayed taken after the Service stopped; resolving only frees it.
   */
  reason: 'start' | 'stop';
}

/** Exit code and the last output lines (ANSI stripped) of a Service that ended by itself. */
export interface ExitDetails {
  exitCode: number;
  /** Up to `EXIT_TAIL_LINES` last lines of output. */
  lastLines: string[];
}

/** How many last output lines a crashed or exited Service reports. */
export const EXIT_TAIL_LINES = 30;

/** Where a Repo's Services come from: its Repo Config, the Local Config, or nowhere yet. */
export type ConfigSource = 'repo' | 'local' | 'none';

/** One Service definition as written to a Local Config (subset of the Repo Config fields). */
export interface ServiceConfig {
  id: string;
  name?: string;
  command: string;
  cwd?: string;
}

/**
 * A Service the user adds to a Local Config from the UI. The Server generates its `id` from `name`;
 * `dependsOn` names other Services of the Repo by id.
 */
export interface NewService {
  name: string;
  command: string;
  port?: number;
  url?: string;
  readyPattern?: string;
  dependsOn?: string[];
}

/** Fields of the "Add Service" form, as named by `serviceInvalid` errors. */
export type NewServiceField = keyof NewService;

/** A Service proposed by auto-detection for a Repo without a Repo Config. */
export interface SuggestedService extends ServiceConfig {
  name: string;
  /** Whether the UI ticks it by default. */
  preselected: boolean;
}

/**
 * Dependency install state of a pnpm Repo (one with `pnpm-lock.yaml`). Absent on `RepoView` when
 * nothing is to be done: not a pnpm Repo, or `node_modules` exists and no install is running.
 */
export type InstallState =
  /** No `node_modules` yet: the UI offers "Install dependencies". */
  | { state: 'needed' }
  /** `pnpm install` is running. */
  | { state: 'running' }
  /** The last `pnpm install` failed and dependencies are still missing. */
  | { state: 'failed'; exitCode: number };

export interface RepoView {
  id: string;
  name: string;
  path: string;
  color?: string;
  /**
   * Set when the active config file cannot be read or is invalid (technical, English). If the Repo
   * still lists Services, they come from the last valid config.
   */
  configError?: string;
  /** True when the Repo folder no longer exists; its Services cannot start until it is relocated. */
  folderMissing?: boolean;
  /** Current git branch (or short commit when detached); absent for non-git folders. */
  branch?: string;
  /** Dependency install state; see `InstallState`. */
  install?: InstallState;
  /** Absent means 'none' (kept optional so older builders stay valid). */
  configSource?: ConfigSource;
  /**
   * Auto-detected Services; only without a Repo Config. With `configSource` 'none' they are offered
   * for the first save; with 'local' as commands for "Add Service".
   */
  suggestions?: SuggestedService[];
  /** A Repo Config exists, so the Local Config of this Repo is unused and can be deleted. */
  unusedLocalConfig?: boolean;
  services: ServiceView[];
}

/**
 * What a process DevPanel spawned belonged to: a Service, or a Session of some kind (Claude Code or
 * a shell).
 */
export type ProcessOwner =
  | { kind: 'service'; serviceId: string; serviceName: string }
  | { kind: 'session'; sessionKind: SessionKind };

/**
 * Processes of one Service run (or Session) left over from a previous run of the DevPanel Server
 * (after a crash or a forced shutdown). Only processes whose PID and creation time both still
 * match are included, so a process that merely reused an old PID is never an Orphan.
 */
export interface Orphan {
  /** Stable id of the left-over run, for `killOrphans`. */
  id: string;
  repoId: string;
  /** Repo name as it was when the process was started (the Repo may be gone by now). */
  repoName: string;
  owner: ProcessOwner;
  /** The surviving processes (each is killed with its whole tree). */
  pids: number[];
}

/** What a Session runs: Claude Code or a shell. */
export type SessionKind = 'claude' | 'shell';

/**
 * An interactive Session (Claude Code or a shell) in a Repo folder; one UI tab per Session. A
 * Session whose process exited by itself stays listed as `finished` until its tab is closed.
 */
export interface SessionView {
  id: string;
  repoId: string;
  kind: SessionKind;
  /** 1-based number among the open Sessions of the same kind in the same Repo ("Терминал 2"). */
  number: number;
  state: 'running' | 'finished';
  /** Exit code once `finished`. */
  exitCode?: number;
}

/**
 * UI Language: which language DevPanel shows its text in. One value per DevPanel app data folder;
 * English when nothing is stored.
 */
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** Every UI Language, in the order the header switch offers them; English (the default) first. */
export const UI_LANGUAGES = ['en', 'ru'] as const;

/** Whether `value` names a UI Language (for stored or cached values, which may be anything). */
export function isUiLanguage(value: unknown): value is UiLanguage {
  return (UI_LANGUAGES as readonly unknown[]).includes(value);
}

/** Full state, enough for a (re)connecting client to rebuild its UI. Grows with later tickets. */
export interface Snapshot {
  repos: RepoView[];
  /** Open Sessions (running or finished), in opening order. */
  sessions: SessionView[];
  /** Orphans found on Server start and not killed yet (absent = none). */
  orphans?: Orphan[];
  /** The stored UI Language; a tab that loaded another string set switches to it. */
  uiLanguage: UiLanguage;
  /** The Service Sets of this machine, in creation order. */
  serviceSets: ServiceSetView[];
}

/** One Service of a Service Set. */
export interface ServiceSetEntryView {
  ref: ServiceRef;
  /** The Repo name last seen for `ref` (kept while the Service is not found). */
  repoName: string;
  /** The Service name last seen for `ref` (kept while the Service is not found). */
  serviceName: string;
  /** Whether `ref` names a Service of the Workspace right now. */
  found: boolean;
}

/**
 * Service Set: a named list of Services from any Repos of the Workspace, stored only on this
 * machine (never in a Repo). The id stays fixed when the Set is renamed.
 */
export interface ServiceSetView {
  id: string;
  name: string;
  services: ServiceSetEntryView[];
}

/** What `startServiceSet` could not bring to `running` (both empty: every Service runs). */
export interface ServiceSetStartResult {
  /** Entries whose Service is not found (skipped). */
  notFound: ServiceRef[];
  /** Started (or already `unhealthy`/`stopping`) Services that did not reach `running`. */
  notRunning: ServiceRef[];
}

/** An entry of a Service Set named in a start report. */
export interface ServiceSetStartReportEntry {
  ref: ServiceRef;
  repoName: string;
  serviceName: string;
}

/**
 * A Service Set start finished with Services not found or not running (wherever it was started
 * from: panel or tray). Every window shows it as one message.
 */
export interface ServiceSetStartReportedEvent {
  id: string;
  name: string;
  notFound: ServiceSetStartReportEntry[];
  notRunning: ServiceSetStartReportEntry[];
}

/** The full list of Service Sets, after each change. */
export interface ServiceSetsChangedEvent {
  serviceSets: ServiceSetView[];
}

/** The current list of Orphans: found on Server start, then after each kill (empty = none left). */
export interface OrphansFoundEvent {
  orphans: Orphan[];
}

/** The UI Language was changed (`setUiLanguage`); every tab reloads in it. */
export interface UiLanguageChangedEvent {
  language: UiLanguage;
}

/** Addresses one Service. */
export interface ServiceRef {
  repoId: string;
  serviceId: string;
}

// ---------------------------------------------------------------------------------------------
// Events (Server → clients, broadcast to every client)
// ---------------------------------------------------------------------------------------------

export interface StatusChangedEvent extends ServiceRef {
  status: ServiceStatus;
}

export interface LogEvent extends ServiceRef {
  /** A chunk of pty output, including ANSI sequences. */
  data: string;
}

export interface ExitEvent extends ServiceRef {
  exitCode: number;
  /** True when the exit was caused by `stopService`. */
  stoppedByUser: boolean;
  /** Last output lines, ANSI stripped (up to `EXIT_TAIL_LINES`). */
  lastLines: string[];
}

/**
 * A Repo was added, changed (folder missing/back, branch, relocated) or removed.
 * `repoId` is the id clients know the Repo by; `repo` is its new state (`null` = removed). After
 * `relocateRepo` the new state has a different id (ids derive from the path): replace in place.
 * An unknown `repoId` with a non-null `repo` means the Repo was added (append it).
 */
export interface RepoChangedEvent {
  repoId: string;
  repo: RepoView | null;
}

/** The Repos were reordered (`moveRepo`): every Repo id, in the new Workspace order. */
export interface ReposReorderedEvent {
  repoIds: string[];
}

/** A chunk of `pnpm install` pty output for a Repo (including ANSI sequences). */
export interface InstallOutputEvent {
  repoId: string;
  data: string;
}

/** A Repo's `InstallState` changed; `install` absent = nothing to install any more. */
export interface InstallChangedEvent {
  repoId: string;
  install?: InstallState;
}

/** Outcome of `installDependencies`. */
export interface InstallResult {
  ok: boolean;
  exitCode: number;
}

/** A Repo's config was (re)loaded: replaces the whole Repo view. */
export interface ConfigChangedEvent {
  repo: RepoView;
}

/** A Service's `portConflict` appeared, changed or was cleared (`portConflict` absent). */
export interface PortConflictChangedEvent extends ServiceRef {
  portConflict?: PortConflict;
}

/** A start began, progressed or stopped waiting for dependencies (`waitingFor` absent once it no longer waits). */
export interface WaitingChangedEvent extends ServiceRef {
  waitingFor?: string[];
}

/** A Session was opened or finished by itself: its new state. */
export interface SessionChangedEvent {
  session: SessionView;
}

/** A Session was closed (its tab closed, or its Repo removed); its process tree is gone. */
export interface SessionClosedEvent {
  sessionId: string;
  repoId: string;
}

/** A chunk of a Session's pty output (including ANSI sequences). */
export interface SessionOutputEvent {
  sessionId: string;
  data: string;
}

/** Events sent to clients, by name. Names match the `core` event names. */
export interface Events {
  portConflictChanged: PortConflictChangedEvent;
  waitingChanged: WaitingChangedEvent;
  statusChanged: StatusChangedEvent;
  exit: ExitEvent;
  repoChanged: RepoChangedEvent;
  reposReordered: ReposReorderedEvent;
  /** Live Service output. A client opening a tab first fetches `getServiceOutput`, see there. */
  log: LogEvent;
  installOutput: InstallOutputEvent;
  installChanged: InstallChangedEvent;
  configChanged: ConfigChangedEvent;
  orphansFound: OrphansFoundEvent;
  sessionChanged: SessionChangedEvent;
  sessionClosed: SessionClosedEvent;
  /** Live Session output. A tab first fetches `getSessionOutput` (same ordering rule as `log`). */
  sessionOutput: SessionOutputEvent;
  uiLanguageChanged: UiLanguageChangedEvent;
  serviceSetsChanged: ServiceSetsChangedEvent;
  serviceSetStartReported: ServiceSetStartReportedEvent;
}

export type EventType = keyof Events;

// ---------------------------------------------------------------------------------------------
// Commands (client → Server, each answered with exactly one reply)
// ---------------------------------------------------------------------------------------------

/** Commands by name: `payload` sent by the client, `result` returned on success. */
export interface Commands {
  getSnapshot: { payload: Record<string, never>; result: Snapshot };
  startService: { payload: ServiceRef; result: null };
  stopService: { payload: ServiceRef; result: null };
  restartService: { payload: ServiceRef; result: null };
  /**
   * Frees the Service's port (stops the owning Service or kills the foreign process), waits until it
   * is free, then starts the Service, unless the conflict came from a Stop.
   */
  resolvePortConflict: { payload: ServiceRef; result: null };
  /** Dismiss: a `crashed`/`exited` Service becomes `stopped` without starting; other Statuses are left alone. */
  dismissExit: { payload: ServiceRef; result: null };
  /** "Start all": starts every Service of the Repo in dependsOn order (Services only, never Sessions). */
  startAll: { payload: { repoId: string }; result: null };
  /** "Stop all": stops every Service of the Repo (Services only, never Sessions). */
  stopAll: { payload: { repoId: string }; result: null };
  /** "Stop everything in all Repos": stops every Service in the Workspace (never Sessions). */
  stopAllRepos: { payload: Record<string, never>; result: null };
  /** Without `path` the Server shows a folder picker; `null` result = the user cancelled it. */
  addRepo: { payload: { path?: string; name?: string }; result: RepoView | null };
  /** Stops every process of the Repo, removes it and its Local Config; never touches the folder. */
  removeRepo: { payload: { repoId: string }; result: null };
  /**
   * Moves a Repo to `toIndex` in the Workspace order (clamped to the list) and emits
   * `reposReordered`; moving it to where it already is does nothing. Fails with `repoNotFound`.
   */
  moveRepo: { payload: { repoId: string; toIndex: number }; result: null };
  /** Points a Repo at a new folder (picker when `path` is omitted), keeping name and color. */
  relocateRepo: { payload: { repoId: string; path?: string }; result: RepoView | null };
  openFolder: { payload: { repoId: string }; result: null };
  /** Opens the Service's configured `url` in the default browser. */
  openUrl: { payload: ServiceRef; result: null };
  /**
   * Buffered recent output of a Service (raw, ANSI included). Replies on one connection are ordered
   * with events: `log` events received before this reply are already contained in the result,
   * later ones are not. A tab drops `log` events until the reply, writes the result, then streams.
   */
  getServiceOutput: { payload: ServiceRef; result: string };
  /** Keyboard input for a Service's pty (dropped when the Service is not running). */
  writeToPty: { payload: ServiceRef & { data: string }; result: null };
  /** Terminal size of a Service tab; the most recent resize from any client wins. */
  resizePty: { payload: ServiceRef & { cols: number; rows: number }; result: null };
  /** Runs `pnpm install` in a pnpm Repo; replies when it has finished. */
  installDependencies: { payload: { repoId: string }; result: InstallResult };
  /** Saves the chosen Services as the Repo's Local Config (in the app data directory, never in the Repo). */
  saveLocalConfig: { payload: { repoId: string; services: ServiceConfig[] }; result: null };
  /**
   * Adds one Service to the Repo's Local Config (creating it when the Repo has no config yet); the
   * Service is listed `stopped`. Fails with `serviceInvalid` (nothing saved) or `repoConfigInUse`.
   */
  addLocalService: { payload: { repoId: string; service: NewService }; result: null };
  /**
   * Removes a Service from the Repo's Local Config, stopping it first when it runs and dropping it
   * from the `dependsOn` of the others. Removing the last one deletes the Local Config.
   */
  removeLocalService: { payload: ServiceRef; result: null };
  /** Deletes the Repo's Local Config (offered once a Repo Config exists). */
  deleteLocalConfig: { payload: { repoId: string }; result: null };
  /**
   * Kills the given Orphans (all when `ids` is omitted), each process with its whole tree. A process
   * whose PID and creation time no longer match is skipped, never killed.
   */
  killOrphans: { payload: { ids?: string[] }; result: null };
  /** "Exit DevPanel": stops every Service and Session, replies, then the Server exits. */
  shutdown: { payload: Record<string, never>; result: null };
  /** Opens a shell Session in the Repo folder. */
  openTerminal: { payload: { repoId: string }; result: SessionView };
  /** Opens a Claude Code Session in the Repo folder; fails with `claudeMissing` when not installed. */
  openClaude: { payload: { repoId: string }; result: SessionView };
  /** Ends a Session (kills its process tree if it still runs) and forgets it. */
  closeSession: { payload: { sessionId: string }; result: null };
  /** Buffered output of a Session; ordered with `sessionOutput` events like `getServiceOutput`. */
  getSessionOutput: { payload: { sessionId: string }; result: string };
  /** Keyboard input for a Session's pty (dropped once the Session has finished). */
  writeToSession: { payload: { sessionId: string; data: string }; result: null };
  /** Terminal size of a Session tab; the most recent resize from any client wins. */
  resizeSession: { payload: { sessionId: string; cols: number; rows: number }; result: null };
  /**
   * Stores the UI Language in the app data folder and emits `uiLanguageChanged`; setting the current
   * value again does nothing. Fails with `uiLanguageNotSaved` when the file cannot be written.
   */
  setUiLanguage: { payload: { language: UiLanguage }; result: null };
  /**
   * Creates a Service Set (stored in the app data folder) and emits `serviceSetsChanged`. The name
   * is trimmed. Fails with `serviceSetNameEmpty`, `serviceSetNameTaken` (ignoring case) or
   * `serviceSetEmpty` (no Services).
   */
  createServiceSet: { payload: { name: string; services: ServiceRef[] }; result: ServiceSetView };
  /**
   * Starts every Service of the Service Set that is not `running` or `starting`, in parallel, the
   * way Start does (dependencies, port checks, Orphans); stops nothing. Resolves once each started
   * Service reached `running` or ended up otherwise; when some did not, also emits
   * `serviceSetStartReported`. Fails with `serviceSetNotFound`.
   */
  startServiceSet: { payload: { id: string }; result: ServiceSetStartResult };
}

export type CommandType = keyof Commands;
export type CommandPayload<K extends CommandType> = Commands[K]['payload'];
export type CommandResult<K extends CommandType> = Commands[K]['result'];

// ---------------------------------------------------------------------------------------------
// Wire messages (JSON over the WebSocket at `WS_PATH`)
// ---------------------------------------------------------------------------------------------

/** WebSocket endpoint path; the Access Key goes in the `key` query parameter. */
export const WS_PATH = '/ws';
/** Default Server port. */
export const DEFAULT_PORT = 7777;

export type CommandMessage = {
  [K in CommandType]: { kind: 'command'; id: number; type: K; payload: CommandPayload<K> };
}[CommandType];

export type ReplyMessage =
  | { kind: 'reply'; id: number; ok: true; result: unknown }
  | { kind: 'reply'; id: number; ok: false; error: ErrorInfo };

export type EventMessage = {
  [K in EventType]: { kind: 'event'; type: K; payload: Events[K] };
}[EventType];

export type ClientMessage = CommandMessage;
export type ServerMessage = ReplyMessage | EventMessage;
