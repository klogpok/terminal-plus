/**
 * Error contract. `core` throws `DevPanelError` with a stable `code` and `params`; the Server sends
 * it as `ErrorInfo`; the UI turns `code` + `params` into a plain-Russian message (strings file) and
 * shows `details` (technical, English) under "Details".
 *
 * Adding an error: add a code with its params to `ErrorParams`, throw `new DevPanelError(code, params,
 * details)` in `core`, and add the message to `errors` in `packages/web/src/app/strings.ts`.
 */

import type { ServiceStatus } from './index.js';

/** Error codes and the parameters their messages need. */
export interface ErrorParams {
  /** A command named a Repo id that is not in the Workspace. */
  repoNotFound: { repoId: string };
  /** A command named a Service id that is not in the Repo's config. */
  serviceNotFound: { repoName: string; serviceId: string };
  /** The Service process could not be spawned. */
  spawnFailed: { repoName: string; serviceName: string };
  /**
   * A Service was not started because one of its dependencies (dependsOn) did not become `running`:
   * it ended up `crashed`, `exited` or `unhealthy`, or was stopped while starting.
   */
  dependencyFailed: {
    repoName: string;
    serviceName: string;
    dependencyName: string;
    dependencyStatus: ServiceStatus;
  };
  /** The Repo uses pnpm (has `pnpm-lock.yaml`) but `pnpm` is not on PATH. */
  pnpmMissing: { repoName: string };
  /** `installDependencies` was asked for a Repo that is not a pnpm Repo. */
  notPnpmRepo: { repoName: string };
  /** The Repo Config is invalid or unreadable (shown on the Repo). */
  configInvalid: { repoName: string };
  /** A malformed or unknown command reached the Server. */
  badCommand: Record<string, never>;
  /** Anything unexpected. */
  internal: Record<string, never>;
}

export type ErrorCode = keyof ErrorParams;

/** Serializable error sent from the Server to clients. */
export type ErrorInfo = {
  [C in ErrorCode]: { code: C; params: ErrorParams[C]; details: string };
}[ErrorCode];

/** An expected failure with a stable code; `message` is the technical details. */
export class DevPanelError<C extends ErrorCode = ErrorCode> extends Error {
  constructor(
    readonly code: C,
    readonly params: ErrorParams[C],
    details: string,
  ) {
    super(details);
    this.name = 'DevPanelError';
  }
}

/** Converts anything thrown into an `ErrorInfo`; unknown errors become `internal`. */
export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof DevPanelError) {
    return { code: error.code, params: error.params, details: error.message } as ErrorInfo;
  }
  const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return { code: 'internal', params: {}, details };
}
