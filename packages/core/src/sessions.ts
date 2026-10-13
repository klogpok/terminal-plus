/**
 * Claude Code and shell Sessions: one pty per Session in a Repo folder, numbered per Repo and kind,
 * kept listed (as finished) after their process exits by itself until they are closed.
 */
import { randomUUID } from 'node:crypto';
import {
  DevPanelError,
  type SessionChangedEvent,
  type SessionClosedEvent,
  type SessionKind,
  type SessionOutputEvent,
  type SessionView,
} from '@devpanel/shared';
import type { ProcessRecorder } from './pid-file.js';
import { spawnService, type ServiceProcess } from './process.js';
import { Terminal } from './terminal.js';

export interface SessionEvents {
  sessionChanged: [SessionChangedEvent];
  sessionClosed: [SessionClosedEvent];
  sessionOutput: [SessionOutputEvent];
}

/** Where `Sessions` announces changes (the `core` event emitter). */
export interface SessionEmitter {
  emit<K extends keyof SessionEvents>(event: K, ...args: SessionEvents[K]): boolean;
}

/** The Repo a Session is opened in. */
export interface SessionRepo {
  id: string;
  name: string;
  path: string;
}

/** An open Session (running, or finished by itself and still shown in its tab). */
class Session extends Terminal {
  exitCode?: number;
  /** Set once `close` (or Repo removal / shutdown) began ending it. */
  closing?: Promise<void>;

  constructor(
    readonly id: string,
    public repoId: string,
    readonly kind: SessionKind,
    readonly number: number,
  ) {
    super();
  }

  view(): SessionView {
    return {
      id: this.id,
      repoId: this.repoId,
      kind: this.kind,
      number: this.number,
      state: this.process ? 'running' : 'finished',
      ...(this.exitCode !== undefined && { exitCode: this.exitCode }),
    };
  }
}

export class Sessions {
  /** Open Sessions by id, in opening order. */
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly events: SessionEmitter,
    private readonly recorder: ProcessRecorder,
  ) {}

  /** Spawns `command` in the Repo folder as a new Session of `kind`. */
  open(repo: SessionRepo, kind: SessionKind, command: string): SessionView {
    const taken = new Set(this.ofRepo(repo.id).filter((s) => s.kind === kind).map((s) => s.number));
    let number = 1;
    while (taken.has(number)) number++;
    let proc: ServiceProcess;
    try {
      proc = spawnService({ command, cwd: repo.path });
    } catch (err) {
      throw new DevPanelError(
        'sessionSpawnFailed',
        { repoName: repo.name },
        `Failed to spawn "${command}" in ${repo.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const session = new Session(randomUUID(), repo.id, kind, number);
    session.process = proc;
    this.sessions.set(session.id, session);
    const runId = this.recorder.track(proc, {
      repoId: repo.id,
      repoName: repo.name,
      owner: { kind: 'session', sessionKind: kind },
    });
    proc.onData((data) => {
      session.output.append(data);
      this.events.emit('sessionOutput', { sessionId: session.id, data });
    });
    void proc.exited.then((exitCode) => {
      this.recorder.forget(runId);
      session.process = undefined;
      session.exitCode = exitCode;
      // Ended by `close`: it is forgotten there; otherwise it stays listed as finished.
      if (session.closing || this.sessions.get(session.id) !== session) return;
      this.events.emit('sessionChanged', { session: session.view() });
    });
    const view = session.view();
    this.events.emit('sessionChanged', { session: view });
    return view;
  }

  /**
   * Ends a Session: kills its whole process tree if it still runs, then forgets it and emits
   * `sessionClosed`. Closing an unknown (already closed) Session does nothing.
   */
  close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return Promise.resolve();
    session.closing ??= (async () => {
      // No graceful period: closing the tab is the user's explicit "end it" (confirmed in the UI).
      await session.process?.stop(0);
      this.sessions.delete(session.id);
      this.events.emit('sessionClosed', { sessionId: session.id, repoId: session.repoId });
    })();
    return session.closing;
  }

  /** Ends every Session of a Repo (all of them when `repoId` is omitted). */
  async closeAll(repoId?: string): Promise<void> {
    const targets = repoId === undefined ? [...this.sessions.values()] : this.ofRepo(repoId);
    await Promise.all(targets.map((s) => this.close(s.id)));
  }

  /** Buffered output (raw, with ANSI sequences), for a newly opened tab. */
  output(sessionId: string): string {
    return this.get(sessionId).output.text();
  }

  write(sessionId: string, data: string): void {
    this.get(sessionId).write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.get(sessionId).resize(cols, rows);
  }

  /** Open Sessions (running and finished), in opening order. */
  list(): SessionView[] {
    return [...this.sessions.values()].map((s) => s.view());
  }

  /** Does a Session of the Repo still run a process? */
  hasRunning(repoId: string): boolean {
    return this.ofRepo(repoId).some((s) => s.process);
  }

  /** The Repo got a new id (relocated): its Sessions follow it. */
  moveRepo(oldId: string, newId: string): void {
    if (oldId === newId) return;
    for (const session of this.ofRepo(oldId)) {
      session.repoId = newId;
      this.events.emit('sessionChanged', { session: session.view() });
    }
  }

  private ofRepo(repoId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.repoId === repoId);
  }

  private get(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new DevPanelError('sessionNotFound', {}, `Unknown Session "${sessionId}"`);
    return session;
  }
}
