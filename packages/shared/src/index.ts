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

/** A Service proposed by auto-detection for a Repo without any config. */
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
  /** Auto-detected Services; only when `configSource` is 'none'. */
  suggestions?: SuggestedService[];
  /** A Repo Config exists, so the Local Config of this Repo is unused and can be deleted. */
  unusedLocalConfig?: boolean;
  services: ServiceView[];
}

/** Full state, enough for a (re)connecting client to rebuild its UI. Grows with later tickets. */
export interface Snapshot {
  repos: RepoView[];
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

/** Events sent to clients, by name. Names match the `core` event names. */
export interface Events {
  statusChanged: StatusChangedEvent;
  exit: ExitEvent;
  repoChanged: RepoChangedEvent;
  /** Live Service output. A client opening a tab first fetches `getServiceOutput`, see there. */
  log: LogEvent;
  installOutput: InstallOutputEvent;
  installChanged: InstallChangedEvent;
  configChanged: ConfigChangedEvent;
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
  /** Without `path` the Server shows a folder picker; `null` result = the user cancelled it. */
  addRepo: { payload: { path?: string; name?: string }; result: RepoView | null };
  /** Stops every process of the Repo, removes it and its Local Config; never touches the folder. */
  removeRepo: { payload: { repoId: string }; result: null };
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
  /** Deletes the Repo's Local Config (offered once a Repo Config exists). */
  deleteLocalConfig: { payload: { repoId: string }; result: null };
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
