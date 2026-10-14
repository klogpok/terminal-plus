/**
 * The errors the web UI shows: every `ErrorCode` from the Server (packages/shared/src/errors.ts)
 * plus the client-side codes below. Each UI string set has a message for every code under `errors`.
 */
import type { ErrorParams, ServiceSetStartReportEntry } from '@devpanel/shared';

/** Errors raised in the browser itself (not by the Server). */
export interface ClientErrorParams {
  /** A Service Set start left Services not found or not running (from `serviceSetStartReported`). */
  serviceSetStartIncomplete: {
    name: string;
    notFound: ServiceSetStartReportEntry[];
    notRunning: ServiceSetStartReportEntry[];
  };
  /** The connection to the Server dropped while a command was in flight, or was never open. */
  connectionLost: Record<string, never>;
  /** The Server's UI Language changed, but this tab cannot cache it, so it cannot reload in it. */
  uiLanguageNotFollowed: Record<string, never>;
}

export type UiErrorCode = keyof ErrorParams | keyof ClientErrorParams;
export type AllErrorParams = ErrorParams & ClientErrorParams;

/** An error from the Server (`ErrorInfo`) or from the client. */
export type UiErrorInfo = {
  [C in UiErrorCode]: { code: C; params: AllErrorParams[C]; details: string };
}[UiErrorCode];
