/**
 * The Service terminal through the `core` interface: input to the pty, resize, and the output
 * buffer that a newly opened tab replays.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Harness, fixtureCommand, stripAnsi } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

describe('Service output buffer', () => {
  it('keeps the output (with colors) for a tab opened later, also after the Service exited', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('exit-after.mjs', 300, 0) }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    expect(core.getServiceOutput(repo.id, 'api')).toBe('');

    const exited = new Promise((resolve) => core.once('exit', resolve));
    const live: string[] = [];
    core.on('log', (e) => live.push(e.data));
    await core.startService(repo.id, 'api');
    await exited;

    const output = core.getServiceOutput(repo.id, 'api');
    expect(output).toBe(live.join(''));
    expect(output).toContain('\u001b['); // ANSI sequences are kept
  });

  it('keeps only about the last 10,000 lines', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('print-lines.mjs', 12_000) }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const done = h.waitForOutput(core, repo.id, 'api', /DONE/, 30_000);
    await core.startService(repo.id, 'api');
    await done;

    const lines = stripAnsi(core.getServiceOutput(repo.id, 'api')).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(9_900);
    expect(lines.length).toBeLessThanOrEqual(10_001);
    const text = lines.join('\n');
    expect(text).toContain('LINE 12000');
    expect(text).not.toMatch(/LINE 1\r?\n/);
  });

  it('appends a timestamped restart separator instead of clearing on restart', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('ready-after.mjs', 0, 'HELLO') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const first = h.waitForOutput(core, repo.id, 'api', /HELLO/);
    await core.startService(repo.id, 'api');
    await first;

    // Live tabs see the separator too.
    const second = h.waitForOutput(core, repo.id, 'api', /── restart \d\d:\d\d ──[\s\S]*HELLO/);
    await core.restartService(repo.id, 'api');
    await second;

    const output = stripAnsi(core.getServiceOutput(repo.id, 'api'));
    expect(output).toMatch(/HELLO[\s\S]*── restart \d\d:\d\d ──[\s\S]*HELLO/);
  });

  it('writes the restart separator in the UI Language current at that restart; earlier ones stay', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('ready-after.mjs', 0, 'HELLO') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const first = h.waitForOutput(core, repo.id, 'api', /HELLO/);
    await core.startService(repo.id, 'api');
    await first;
    const english = h.waitForOutput(core, repo.id, 'api', /── restart \d\d:\d\d ──[\s\S]*HELLO/);
    await core.restartService(repo.id, 'api');
    await english;

    await core.setUiLanguage('ru');
    const russian = h.waitForOutput(core, repo.id, 'api', /── перезапуск \d\d:\d\d ──[\s\S]*HELLO/);
    await core.restartService(repo.id, 'api');
    await russian;

    const output = stripAnsi(core.getServiceOutput(repo.id, 'api'));
    expect(output).toMatch(/HELLO[\s\S]*── restart \d\d:\d\d ──[\s\S]*HELLO[\s\S]*── перезапуск \d\d:\d\d ──[\s\S]*HELLO/);
  });
});

describe('resizePty', () => {
  it('resizes the Service pty; the most recent resize wins', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('print-size.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const started = h.waitForOutput(core, repo.id, 'api', /SIZE=\d+x\d+/);
    await core.startService(repo.id, 'api');
    await started;

    // Two clients resize one after another.
    const resized = h.waitForOutput(core, repo.id, 'api', /SIZE=90x25/);
    core.resizePty(repo.id, 'api', 100, 40);
    await new Promise((resolve) => setTimeout(resolve, 300));
    core.resizePty(repo.id, 'api', 90, 25);
    await resized;
  });

  it('starts the next run of the Service with the last size', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('print-size.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    core.resizePty(repo.id, 'api', 88, 22);
    const started = h.waitForOutput(core, repo.id, 'api', /SIZE=(\d+x\d+)/);
    await core.startService(repo.id, 'api');

    expect((await started)[1]).toBe('88x22');
  });
});

describe('writeToPty', () => {
  it('delivers keyboard input to the Service', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('echo-stdin.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;
    const ready = h.waitForOutput(core, repo.id, 'api', /ECHO_READY/);
    await core.startService(repo.id, 'api');
    await ready;

    const echoed = h.waitForOutput(core, repo.id, 'api', /ECHO:hello/);
    core.writeToPty(repo.id, 'api', 'hello\r');

    await echoed;
  });

  it('ignores input for a Service that is not running', async () => {
    h.addRepo({ name: 'billing', config: { services: [{ id: 'api', command: fixtureCommand('echo-stdin.mjs') }] } });
    const core = await h.createCore();
    const repo = core.listRepos()[0]!;

    expect(() => core.writeToPty(repo.id, 'api', 'hello\r')).not.toThrow();
  });
});
