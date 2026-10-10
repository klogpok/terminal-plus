/**
 * Claude Code and shell Sessions through the `core` interface. A real shell (`openTerminal`) is the
 * Session fixture; `claude` is never spawned (the `where claude` probe and the command are injected).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError, type SessionView } from '@devpanel/shared';
import type { DevPanelCore } from '../src/index.js';
import { Harness, fixtureCommand, isAlive, stripAnsi } from './harness.js';

async function waitUntil(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Waits until a Session's accumulated live output (ANSI stripped) matches `pattern`. */
function waitForSessionOutput(core: DevPanelCore, sessionId: string, pattern: RegExp, timeoutMs = 15_000) {
  return new Promise<RegExpMatchArray>((resolve, reject) => {
    let buffer = '';
    const onOutput = (e: { sessionId: string; data: string }) => {
      if (e.sessionId !== sessionId) return;
      buffer += stripAnsi(e.data);
      const match = buffer.match(pattern);
      if (match) {
        cleanup();
        resolve(match);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern} in session output:\n${buffer}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      core.off('sessionOutput', onOutput);
    };
    core.on('sessionOutput', onOutput);
  });
}

/** Runs the grandchild fixture inside a shell Session; returns [child, grandchild] PIDs. */
async function spawnGrandchildIn(core: DevPanelCore, sessionId: string): Promise<number[]> {
  const pids = waitForSessionOutput(core, sessionId, /CHILD_PID=(\d+) GRANDCHILD_PID=(\d+)/);
  core.writeToSession(sessionId, `${fixtureCommand('spawn-grandchild.mjs')}\r`);
  const [, child, grandchild] = await pids;
  return [Number(child), Number(grandchild)];
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

describe('shell Sessions', () => {
  it('openTerminal starts an interactive shell in the Repo folder', async () => {
    const repoPath = h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    const session = await core.openTerminal(repo.id);

    expect(session).toMatchObject({ repoId: repo.id, kind: 'shell', number: 1, state: 'running' });
    const cwd = waitForSessionOutput(core, session.id, /CWD=\[([^%\]]+)\]/); // not the echoed "%CD%" input
    core.writeToSession(session.id, 'echo CWD=[%CD%]\r');
    expect((await cwd)[1]!.toLowerCase()).toBe(repoPath.toLowerCase());
  });

  it('allows several Sessions per Repo, numbered per kind, all listed in the snapshot', async () => {
    h.addRepo({ name: 'billing' });
    h.addRepo({ name: 'docs' });
    const core = await h.createCore();
    const [billing, docs] = core.listRepos();
    const opened: SessionView[] = [];
    core.on('sessionChanged', (e) => opened.push(e.session));

    const first = await core.openTerminal(billing!.id);
    const second = await core.openTerminal(billing!.id);
    const other = await core.openTerminal(docs!.id);

    expect([first.number, second.number, other.number]).toEqual([1, 2, 1]);
    expect(new Set([first.id, second.id, other.id]).size).toBe(3);
    expect(opened.map((s) => s.id)).toEqual([first.id, second.id, other.id]);
    expect(core.snapshot().sessions).toEqual([first, second, other]);
  });

  it('buffers the output for a tab opened later (replay equals the live stream)', async () => {
    h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const session = await core.openTerminal(repo.id);
    const live: string[] = [];
    core.on('sessionOutput', (e) => e.sessionId === session.id && live.push(e.data));
    const before = core.getSessionOutput(session.id);

    const marker = waitForSessionOutput(core, session.id, /MARK_42/);
    core.writeToSession(session.id, 'echo MARK_^42\r'); // the echoed input reads "MARK_^42"
    await marker;

    expect(core.getSessionOutput(session.id)).toBe(before + live.join(''));
    expect(stripAnsi(core.getSessionOutput(session.id))).toContain('MARK_42');
    expect(() => core.resizeSession(session.id, 100, 40)).not.toThrow();
  });

  it('closeSession kills the whole process tree and forgets the Session', async () => {
    h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const session = await core.openTerminal(repo.id);
    const pids = await spawnGrandchildIn(core, session.id);
    const closed: unknown[] = [];
    core.on('sessionClosed', (e) => closed.push(e));

    await core.closeSession(session.id);

    await waitUntil(() => pids.every((pid) => !isAlive(pid)));
    expect(closed).toEqual([{ sessionId: session.id, repoId: repo.id }]);
    expect(core.snapshot().sessions).toEqual([]);
    expect(() => core.getSessionOutput(session.id)).toThrow(DevPanelError);
  });

  it('a Session that exits by itself stays listed as finished until it is closed', async () => {
    h.addRepo({ name: 'billing' });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const session = await core.openTerminal(repo.id);
    const finished = new Promise<SessionView>((resolve) =>
      core.on('sessionChanged', (e) => e.session.id === session.id && e.session.state === 'finished' && resolve(e.session)),
    );

    core.writeToSession(session.id, 'exit 3\r');

    expect(await finished).toMatchObject({ id: session.id, state: 'finished', exitCode: 3 });
    expect(core.snapshot().sessions).toEqual([{ ...session, state: 'finished', exitCode: 3 }]);
    expect(core.getSessionOutput(session.id)).not.toBe('');
    // A new Session of the same kind does not reuse the finished one's number while it is listed.
    expect((await core.openTerminal(repo.id)).number).toBe(2);

    await core.closeSession(session.id);
    expect(core.snapshot().sessions.map((s) => s.id)).not.toContain(session.id);
  });
});

describe('Claude Code Sessions', () => {
  it('reports a plain error when Claude Code is not installed, and opens nothing', async () => {
    h.addRepo({ name: 'billing' });
    let probed = 0;
    const core = await h.createCore(undefined, {
      environment: { isClaudeAvailable: async () => (probed++, false) },
    });
    const repo = core.listRepos()[0]!;

    await expect(core.openClaude(repo.id)).rejects.toMatchObject({ code: 'claudeMissing' });
    expect(probed).toBe(1);
    expect(core.snapshot().sessions).toEqual([]);
  });

  it('runs the Claude command through cmd.exe in the Repo folder', async () => {
    const repoPath = h.addRepo({ name: 'billing' });
    const core = await h.createCore(undefined, {
      environment: { isClaudeAvailable: async () => true, claudeCommand: `cd && ${fixtureCommand('echo-stdin.mjs')}` },
    });
    const repo = core.listRepos()[0]!;

    const ready = new Promise<string>((resolve) => {
      let text = '';
      core.on('sessionOutput', (e) => {
        text += stripAnsi(e.data);
        if (text.includes('ECHO_READY')) resolve(text);
      });
    });
    const session = await core.openClaude(repo.id);

    expect(session).toMatchObject({ kind: 'claude', number: 1, state: 'running' });
    expect((await ready).toLowerCase()).toContain(repoPath.toLowerCase());
    const echoed = waitForSessionOutput(core, session.id, /ECHO:hi/);
    core.writeToSession(session.id, 'hi\r');
    await echoed;
  });
});

describe('Sessions and the rest of DevPanel', () => {
  it('removeRepo ends the Repo’s Sessions (whole tree) but not other Repos’ Sessions', async () => {
    h.addRepo({ name: 'billing' });
    h.addRepo({ name: 'docs' });
    const core = await h.createCore();
    const [billing, docs] = core.listRepos();
    const session = await core.openTerminal(billing!.id);
    const kept = await core.openTerminal(docs!.id);
    const pids = await spawnGrandchildIn(core, session.id);
    const closed: unknown[] = [];
    core.on('sessionClosed', (e) => closed.push(e));

    await core.removeRepo(billing!.id);

    await waitUntil(() => pids.every((pid) => !isAlive(pid)));
    expect(closed).toEqual([{ sessionId: session.id, repoId: billing!.id }]);
    expect(core.snapshot().sessions).toEqual([kept]);
  });

  it('relocateRepo is refused while a Session of the Repo runs', async () => {
    h.addRepo({ name: 'billing' });
    const elsewhere = h.makeFolder('moved');
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    await core.openTerminal(repo.id);

    await expect(core.relocateRepo(repo.id, elsewhere)).rejects.toMatchObject({ code: 'repoBusy' });
  });

  it('"Stop all" and "Stop all in all Repos" leave Sessions running; shutdown (Exit) ends them', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    h.addRepo({ name: 'docs', config: { services: [{ id: 'web', command: fixtureCommand('spawn-grandchild.mjs') }] } });
    const core = await h.createCore();
    const [billing, docs] = core.listRepos();
    await core.startService(billing!.id, 'api');
    await core.startService(docs!.id, 'web');
    const session = await core.openTerminal(billing!.id);
    const other = await core.openTerminal(docs!.id);
    const pids = await spawnGrandchildIn(core, session.id);
    const closed: unknown[] = [];
    core.on('sessionClosed', (e) => closed.push(e));

    await core.stopAll(billing!.id);
    await core.stopAllRepos();

    expect(core.listRepos().flatMap((r) => r.services.map((s) => s.status))).toEqual(['stopped', 'stopped']);
    expect(closed).toEqual([]);
    expect(core.snapshot().sessions).toEqual([session, other]);
    expect(pids.every(isAlive)).toBe(true);
    const stillTyping = waitForSessionOutput(core, other.id, /STILL_HERE/);
    core.writeToSession(other.id, 'echo STILL_^HERE\r');
    await stillTyping;

    await core.shutdown();
    await waitUntil(() => pids.every((pid) => !isAlive(pid)));
  });
});
