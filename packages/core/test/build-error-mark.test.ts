import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuildErrorChangedEvent } from '@devpanel/shared';
import type { DevPanelCore, ServiceView } from '../src/index.js';
import { Harness, TEST_TIMINGS, fixtureCommand, waitForStatus } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

/**
 * Starts the single Service `api` of a fresh Repo (and waits for `output`, if given); returns the
 * core, the Repo id and the Build Error marks it reports.
 */
async function startApi(
  service: Record<string, unknown>,
  output?: RegExp,
): Promise<{ core: DevPanelCore; repoId: string; marks: boolean[] }> {
  h.addRepo({ name: 'billing', config: { services: [{ id: 'api', ...service }] } });
  const core = await h.createCore(TEST_TIMINGS);
  const repoId = core.listRepos()[0]!.id;
  const marks: boolean[] = [];
  core.on('buildErrorChanged', (e) => marks.push(e.buildError));
  const printed = output && h.waitForOutput(core, repoId, 'api', output);
  await core.startService(repoId, 'api');
  await printed;
  return { core, repoId, marks };
}

/** Starts `echo-stdin.mjs` as `api` and waits until it reads input. */
function startEcho(service: Record<string, unknown> = {}) {
  return startApi({ command: fixtureCommand('echo-stdin.mjs'), ...service }, /ECHO_READY/);
}

/** Waits for the next `buildErrorChanged` of the Service with this value. */
function nextMark(core: DevPanelCore, buildError: boolean): Promise<void> {
  return new Promise((resolve) => {
    const onChange = (e: BuildErrorChangedEvent) => {
      if (e.buildError !== buildError) return;
      core.off('buildErrorChanged', onChange);
      resolve();
    };
    core.on('buildErrorChanged', onChange);
  });
}

/** The Service prints `line` (echo-stdin.mjs echoes what is typed); waits until the mark becomes `mark`. */
async function printExpecting(core: DevPanelCore, repoId: string, line: string, mark: boolean): Promise<void> {
  const changed = nextMark(core, mark);
  core.writeToPty(repoId, 'api', `${line}\r`);
  await changed;
}

function api(core: DevPanelCore): ServiceView {
  return core.snapshot().repos[0]!.services[0]!;
}

describe('Build Error mark', () => {
  it('is set by a failure line and cleared by a success line, in the Snapshot too', async () => {
    const { core, repoId, marks } = await startEcho();
    await waitForStatus(core, repoId, 'api', 'running');
    expect(api(core).buildError).toBeUndefined();

    await printExpecting(core, repoId, 'webpack compiled with 1 error in 90 ms', true);
    expect(api(core).buildError).toBe(true);
    expect(api(core).status).toBe('running');

    await printExpecting(core, repoId, 'webpack compiled successfully in 80 ms', false);
    expect(api(core).buildError).toBeUndefined();
    expect(marks).toEqual([true, false]);
  });

  it('appears while starting and changes neither the Status nor Readiness', async () => {
    const { core, repoId } = await startEcho({ readyPattern: 'APP_IS_UP' });
    await printExpecting(core, repoId, 'Failed to compile.', true);
    expect(api(core).status).toBe('starting');

    // Readiness still comes from readyPattern, which also takes the mark off.
    const cleared = nextMark(core, false);
    core.writeToPty(repoId, 'api', 'APP_IS_UP\r');
    await waitForStatus(core, repoId, 'api', 'running');
    await cleared;
    expect(api(core).buildError).toBeUndefined();
  });

  it('errorPattern from the config sets it', async () => {
    const { core, repoId } = await startEcho({ errorPattern: 'GULP_BROKEN' });
    await printExpecting(core, repoId, 'GULP_BROKEN', true);
    expect(api(core).buildError).toBe(true);
  });

  it('is removed by Stop', async () => {
    const { core, repoId, marks } = await startEcho();
    await printExpecting(core, repoId, 'Failed to compile.', true);

    await core.stopService(repoId, 'api');

    expect(api(core).status).toBe('stopped');
    expect(api(core).buildError).toBeUndefined();
    expect(marks).toEqual([true, false]);
  });

  it('is removed by Restart, and the new run starts without it', async () => {
    const { core, repoId, marks } = await startEcho();
    await printExpecting(core, repoId, 'Failed to compile.', true);

    const ready = h.waitForOutput(core, repoId, 'api', /ECHO_READY/);
    await core.restartService(repoId, 'api');
    await ready;

    expect(api(core).buildError).toBeUndefined();
    expect(marks).toEqual([true, false]);
    await printExpecting(core, repoId, 'Failed to compile.', true);
  });

  it('is removed when the run ends by itself', async () => {
    const { core, marks } = await startApi({
      command: `echo Failed to compile.&& ${fixtureCommand('exit-after.mjs', 1500, 1)}`,
    });
    await new Promise((resolve) => core.once('exit', resolve));

    expect(api(core).status).toBe('crashed');
    expect(api(core).buildError).toBeUndefined();
    expect(marks).toEqual([true, false]);
  });
});
