import type {
  ClientMessage,
  CommandMessage,
  CommandResult,
  CommandType,
  ErrorInfo,
  EventType,
  Events,
  Snapshot,
} from '@devpanel/shared';
import type { BackendTransport, TransportListener } from './backend-transport';

/** Lets promise callbacks triggered by a reply run (`await` it before asserting). */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Test double for `BackendTransport`: records sent commands and lets a test play the Server
 * (open/close the connection, reply to commands, emit events).
 */
export class FakeTransport implements BackendTransport {
  readonly sent: ClientMessage[] = [];
  private listener?: TransportListener;

  connect(listener: TransportListener): void {
    this.listener = listener;
  }

  send(message: ClientMessage): void {
    this.sent.push(message);
  }

  open(): void {
    this.required().open();
  }

  close(details = 'connection closed'): void {
    this.required().close(details);
  }

  /** Commands of one type sent so far (oldest first). */
  commands<K extends CommandType>(type: K): Extract<CommandMessage, { type: K }>[] {
    return this.sent.filter((m): m is Extract<CommandMessage, { type: K }> => m.type === type);
  }

  /** The most recent command of one type; throws if none was sent. */
  lastCommand<K extends CommandType>(type: K): Extract<CommandMessage, { type: K }> {
    const found = this.commands(type).at(-1);
    if (!found) throw new Error(`No "${type}" command was sent; sent: ${JSON.stringify(this.sent)}`);
    return found;
  }

  reply<K extends CommandType>(command: Extract<CommandMessage, { type: K }>, result: CommandResult<K>): Promise<void> {
    this.required().message({ kind: 'reply', id: command.id, ok: true, result });
    return settle();
  }

  fail(command: CommandMessage, error: ErrorInfo): Promise<void> {
    this.required().message({ kind: 'reply', id: command.id, ok: false, error });
    return settle();
  }

  /** Answers the latest `getSnapshot` command. */
  replySnapshot(snapshot: Snapshot): Promise<void> {
    return this.reply(this.lastCommand('getSnapshot'), snapshot);
  }

  /** Opens the connection and answers the snapshot request the client sends on open. */
  connectWith(snapshot: Snapshot): Promise<void> {
    this.open();
    return this.replySnapshot(snapshot);
  }

  emit<K extends EventType>(type: K, payload: Events[K]): void {
    this.required().message({ kind: 'event', type, payload } as never);
  }

  private required(): TransportListener {
    if (!this.listener) throw new Error('BackendService has not connected the transport');
    return this.listener;
  }
}
