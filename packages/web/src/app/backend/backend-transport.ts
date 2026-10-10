import { InjectionToken } from '@angular/core';
import type { ClientMessage, ServerMessage } from '@devpanel/shared';

/** Callbacks a transport reports to (exactly one listener: `BackendService`). */
export interface TransportListener {
  /** Connected (also after every reconnect). */
  open(): void;
  message(message: ServerMessage): void;
  /** Disconnected; `details` is technical (English). The transport keeps trying to reconnect. */
  close(details: string): void;
}

/**
 * The only way the UI reaches the DevPanel Server. `WsTransport` is the web implementation,
 * `IpcTransport` will be the desktop one, and tests use `FakeTransport`.
 */
export interface BackendTransport {
  connect(listener: TransportListener): void;
  send(message: ClientMessage): void;
}

export const BACKEND_TRANSPORT = new InjectionToken<BackendTransport>('BackendTransport');
