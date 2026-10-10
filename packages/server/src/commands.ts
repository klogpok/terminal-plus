/**
 * Command handlers: one entry per command in `Commands` (packages/shared). The mapped type makes a
 * missing handler a compile error. Each handler validates its payload with zod (the client is not
 * trusted) and calls `core`.
 */
import { z } from 'zod';
import type { DevPanelCore } from '@devpanel/core';
import {
  DevPanelError,
  toErrorInfo,
  type CommandPayload,
  type CommandResult,
  type CommandType,
  type ReplyMessage,
} from '@devpanel/shared';

interface CommandHandler<K extends CommandType> {
  payload: z.ZodType<CommandPayload<K>>;
  run(core: DevPanelCore, payload: CommandPayload<K>): Promise<CommandResult<K>> | CommandResult<K>;
}

type CommandHandlers = { [K in CommandType]: CommandHandler<K> };

const serviceRef = z.object({ repoId: z.string().min(1), serviceId: z.string().min(1) });
const empty = z.object({}).transform(() => ({}) as Record<string, never>);

export const COMMAND_HANDLERS: CommandHandlers = {
  getSnapshot: { payload: empty, run: (core) => core.snapshot() },
  startService: {
    payload: serviceRef,
    run: async (core, p) => (await core.startService(p.repoId, p.serviceId), null),
  },
  stopService: {
    payload: serviceRef,
    run: async (core, p) => (await core.stopService(p.repoId, p.serviceId), null),
  },
  restartService: {
    payload: serviceRef,
    run: async (core, p) => (await core.restartService(p.repoId, p.serviceId), null),
  },
  startAll: {
    payload: z.object({ repoId: z.string().min(1) }),
    run: async (core, p) => (await core.startAll(p.repoId), null),
  },
  stopAll: {
    payload: z.object({ repoId: z.string().min(1) }),
    run: async (core, p) => (await core.stopAll(p.repoId), null),
  },
  stopAllRepos: { payload: empty, run: async (core) => (await core.stopAllRepos(), null) },
  installDependencies: {
    payload: z.object({ repoId: z.string().min(1) }),
    run: (core, p) => core.installDependencies(p.repoId),
  },
  saveLocalConfig: {
    payload: z.object({
      repoId: z.string().min(1),
      services: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).optional(),
          command: z.string().min(1),
          cwd: z.string().min(1).optional(),
        }),
      ),
    }),
    run: async (core, p) => (await core.saveLocalConfig(p.repoId, p.services), null),
  },
  deleteLocalConfig: {
    payload: z.object({ repoId: z.string().min(1) }),
    run: async (core, p) => (await core.deleteLocalConfig(p.repoId), null),
  },
};

const envelope = z.object({
  kind: z.literal('command'),
  id: z.number().int(),
  type: z.string(),
  payload: z.unknown(),
});

function badCommand(details: string): DevPanelError<'badCommand'> {
  return new DevPanelError('badCommand', {}, details);
}

/** Parses one raw client message, runs the command, and builds the reply. Never throws. */
export async function dispatchCommand(core: DevPanelCore, raw: string): Promise<ReplyMessage> {
  let id = 0;
  try {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw badCommand('Message is not valid JSON');
    }
    const message = envelope.safeParse(json);
    if (!message.success) throw badCommand(`Malformed command message: ${message.error.message}`);
    id = message.data.id;
    const { type } = message.data;
    if (!Object.hasOwn(COMMAND_HANDLERS, type)) throw badCommand(`Unknown command "${type}"`);
    const handler = COMMAND_HANDLERS[type as CommandType] as CommandHandler<CommandType>;
    const payload = handler.payload.safeParse(message.data.payload);
    if (!payload.success) throw badCommand(`Invalid payload for "${type}": ${payload.error.message}`);
    const result = await handler.run(core, payload.data);
    return { kind: 'reply', id, ok: true, result };
  } catch (error) {
    return { kind: 'reply', id, ok: false, error: toErrorInfo(error) };
  }
}
