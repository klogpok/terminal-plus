/**
 * The DevPanel Server: Fastify + WebSocket over `core`. Owns no logic of its own: it checks the
 * Origin and the Access Key, dispatches commands to `core`, and broadcasts `core` events to every
 * connected client (all clients are equal peers, ADR-0001).
 */
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { CoreEvents, DevPanelCore } from '@devpanel/core';
import { WS_PATH, type EventMessage, type EventType, type Events, type ServerMessage } from '@devpanel/shared';
import { isAccessKeyValid } from './access-key.js';
import { dispatchCommand } from './commands.js';

/** `core` events broadcast to clients. Each name must exist in both `Events` and `CoreEvents`. */
export const FORWARDED_EVENTS = [
  'statusChanged',
  'exit',
  'configChanged',
  'installOutput',
  'installChanged',
  'portConflictChanged',
] as const satisfies readonly (EventType & keyof CoreEvents)[];

// Compile-time check: what `core` emits for a forwarded event fits the `shared` event payload.
type ForwardedEvent = (typeof FORWARDED_EVENTS)[number];
type CheckForwarded = { [K in ForwardedEvent]: CoreEvents[K][0] extends Events[K] ? true : never };
const forwardedEventsMatch: CheckForwarded = {
  statusChanged: true,
  exit: true,
  configChanged: true,
  installOutput: true,
  installChanged: true,
  portConflictChanged: true,
};
void forwardedEventsMatch;

export interface ServerOptions {
  core: DevPanelCore;
  accessKey: string;
  /** Built web UI to serve at `/`; skipped when missing. */
  webRoot?: string;
  /** Origins allowed in addition to http://127.0.0.1:<port> and http://localhost:<port> (e.g. `ng serve`). */
  extraOrigins?: string[];
  logger?: boolean;
}

export function createServer(options: ServerOptions): FastifyInstance {
  const { core, accessKey } = options;
  const app = Fastify({ logger: options.logger ?? false });
  const clients = new Set<WebSocket>();

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  for (const type of FORWARDED_EVENTS) {
    core.on(type, (payload: Events[typeof type]) => {
      const message = { kind: 'event', type, payload } as EventMessage;
      for (const socket of clients) send(socket, message);
    });
  }

  const allowedOrigin = (origin: string): boolean => {
    const { port } = app.server.address() as AddressInfo;
    const own = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    return [...own, ...(options.extraOrigins ?? [])].includes(origin);
  };

  app.register(fastifyWebsocket);
  app.register(async (scope) => {
    // Runs before the WebSocket upgrade: a rejected request never becomes a connection.
    scope.addHook('preValidation', async (request, reply) => {
      const origin = request.headers.origin;
      // Browsers always send Origin; a non-browser client without one still needs the Access Key.
      if (origin !== undefined && !allowedOrigin(origin)) {
        return reply.code(403).send({ error: 'Forbidden origin' });
      }
      const { key } = request.query as { key?: unknown };
      if (!isAccessKeyValid(key, accessKey)) {
        return reply.code(401).send({ error: 'Missing or wrong Access Key' });
      }
    });

    scope.get(WS_PATH, { websocket: true }, (socket) => {
      clients.add(socket);
      socket.on('close', () => clients.delete(socket));
      socket.on('message', (data) => {
        void dispatchCommand(core, String(data)).then((reply) => send(socket, reply));
      });
    });
  });

  if (options.webRoot && existsSync(options.webRoot)) {
    app.register(fastifyStatic, { root: options.webRoot });
  }

  return app;
}
