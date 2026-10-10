import { Injectable } from '@angular/core';
import { WS_PATH, type ClientMessage, type ServerMessage } from '@devpanel/shared';
import type { BackendTransport, TransportListener } from './backend-transport';

/** Reads `key` from a URL fragment like `#key=...`. */
export function accessKeyFromHash(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('key');
  return key ? key : null;
}

/** WebSocket URL of the Server that served the page (or proxies to it in `ng serve`). */
export function webSocketUrl(location: Pick<Location, 'protocol' | 'host'>, accessKey: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}?key=${encodeURIComponent(accessKey)}`;
}

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5_000;

/** Web `BackendTransport`: a WebSocket to the DevPanel Server that reconnects forever. */
@Injectable()
export class WsTransport implements BackendTransport {
  private socket?: WebSocket;
  private listener?: TransportListener;
  private delay = RECONNECT_MIN_MS;

  connect(listener: TransportListener): void {
    this.listener = listener;
    this.open();
  }

  send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private open(): void {
    const listener = this.listener!;
    const key = accessKeyFromHash(window.location.hash);
    if (!key) {
      // Without a key every attempt is rejected; the page must be opened through the launcher link.
      listener.close('No Access Key in the page URL (expected #key=...)');
      return;
    }
    const socket = new WebSocket(webSocketUrl(window.location, key));
    this.socket = socket;
    socket.onopen = () => {
      this.delay = RECONNECT_MIN_MS;
      listener.open();
    };
    socket.onmessage = (event) => listener.message(JSON.parse(String(event.data)) as ServerMessage);
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      listener.close(`WebSocket closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''})`);
      setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 2, RECONNECT_MAX_MS);
    };
  }
}
