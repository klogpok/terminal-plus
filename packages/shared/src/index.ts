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
  /** Set when the Repo Config cannot be read or is invalid (technical, English). */
  configError?: string;
  /** Dependency install state; see `InstallState`. */
  install?: InstallState;
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

/** Events sent to clients, by name. Names match the `core` event names. */
export interface Events {
  statusChanged: StatusChangedEvent;
  exit: ExitEvent;
  installOutput: InstallOutputEvent;
  installChanged: InstallChangedEvent;
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
  /** Runs `pnpm install` in a pnpm Repo; replies when it has finished. */
  installDependencies: { payload: { repoId: string }; result: InstallResult };
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
