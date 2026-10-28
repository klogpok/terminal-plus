import { describe, expect, it } from 'vitest';
import { watchBuildErrors, type BuildErrorCriteria } from '../src/build-errors.js';

/** Feeds each chunk to a fresh watch and returns the reported changes, in order. */
function changes(chunks: string[], criteria: BuildErrorCriteria = {}): boolean[] {
  const reported: boolean[] = [];
  const watch = watchBuildErrors({ criteria, onChange: (buildError) => reported.push(buildError) });
  for (const chunk of chunks) watch.feed(chunk);
  return reported;
}

/** The mark after these output lines (each ended with CRLF, as ConPTY does). */
function markAfter(lines: string[], criteria: BuildErrorCriteria = {}): boolean {
  return changes([lines.map((line) => `${line}\r\n`).join('')], criteria).at(-1) ?? false;
}

describe('built-in failure lines set the mark', () => {
  it.each([
    ['nx, build failed', '>  NX   Build failed, waiting for changes to restart...'],
    ['nx, app exited', 'NX Process exited with code 1, waiting for changes to restart...'],
    ['webpack, one error', 'webpack 5.97.1 compiled with 1 error in 1532 ms'],
    ['webpack, errors and warnings', 'webpack 5.97.1 compiled with 1 error and 2 warnings in 1532 ms'],
    ['Angular application builder', 'Application bundle generation failed. [2.164 seconds]'],
    ['Angular legacy webpack, CRA', 'Failed to compile.'],
    ['tsc --watch, one error', '[10:41:07 AM] Found 1 error. Watching for file changes.'],
    ['tsc --watch, many errors', '[10:41:07 AM] Found 12 errors. Watching for file changes.'],
    ['vite-plugin-checker', '[TypeScript] Found 2 errors. Watching for file changes.'],
  ])('%s', (_tool, line) => {
    expect(markAfter([line])).toBe(true);
  });
});

describe('built-in success lines clear the mark', () => {
  it.each([
    ['webpack', 'webpack 5.97.1 compiled successfully in 812 ms'],
    ['webpack, warnings only', 'webpack 5.97.1 compiled with 2 warnings in 812 ms'],
    ['webpack, one warning', 'webpack 5.97.1 compiled with 1 warning in 812 ms'],
    ['Angular application builder', 'Application bundle generation complete. [1.204 seconds]'],
    ['Angular legacy webpack, CRA', 'Compiled successfully!'],
    ['tsc --watch', '[10:42:31 AM] Found 0 errors. Watching for file changes.'],
  ])('%s', (_tool, line) => {
    expect(markAfter(['Failed to compile.', line])).toBe(false);
    expect(changes([`Failed to compile.\r\n${line}\r\n`])).toEqual([true, false]);
  });
});

describe('output as it comes from the pty', () => {
  it('ANSI color codes do not hide a line', () => {
    const line = '\u001b[1m\u001b[31mwebpack 5.97.1 compiled with \u001b[1m\u001b[31m1 error\u001b[39m\u001b[22m in 90 ms\u001b[39m';
    expect(markAfter([line])).toBe(true);
    expect(markAfter([line, '\u001b[32m[\u001b[90m10:42:31 AM\u001b[0m] Found 0 errors. Watching for file changes.'])).toBe(false);
  });

  it('Windows symbol variants of Angular and esbuild are recognized', () => {
    expect(markAfter(['X [ERROR] TS2322: Type \'number\' is not assignable', 'Application bundle generation failed.'])).toBe(true);
    expect(markAfter(['× Failed to compile.'])).toBe(true);
    expect(markAfter(['× Failed to compile.', '√ Compiled successfully.'])).toBe(false);
  });

  it('a line split across chunks counts once it is complete', () => {
    expect(changes(['webpack compiled wi', 'th 1 err'])).toEqual([]);
    expect(changes(['webpack compiled wi', 'th 1 err', 'or in 90 ms\r', '\n'])).toEqual([true]);
  });

  it('an ANSI sequence split across chunks does not hide a line', () => {
    expect(changes(['\u001b[3', '1mFailed to compile.\u001b[3', '9m\r\n'])).toEqual([true]);
  });

  it('lines that end with LF only are recognized too', () => {
    expect(changes(['Failed to compile.\nCompiled successfully\n'])).toEqual([true, false]);
  });

  it('a line overwritten after a bare CR counts by what is left on screen', () => {
    expect(changes(['Failed to compile.\rcompiling...\r\n'])).toEqual([]);
  });
});

describe('the last matching line wins', () => {
  it('failure, success, failure', () => {
    expect(markAfter(['Failed to compile.', 'Compiled successfully', 'Failed to compile.'])).toBe(true);
    expect(markAfter(['Failed to compile.', 'Failed to compile.', 'Compiled successfully'])).toBe(false);
  });

  it('reports only changes', () => {
    expect(
      changes([
        'Compiled successfully\r\n',
        'Failed to compile.\r\n',
        'Failed to compile.\r\n',
        'Found 3 errors. Watching for file changes.\r\n',
        'Compiled successfully\r\n',
        'Compiled successfully\r\n',
      ]),
    ).toEqual([true, false]);
  });

  it('neutral lines change nothing', () => {
    expect(
      changes([
        'Failed to compile.\r\n',
        'ERROR in ./src/main.ts 3:0\r\n',
        '[nodemon] restarting due to changes...\r\n',
        'Listening on http://localhost:3000\r\n',
      ]),
    ).toEqual([true]);
    expect(changes(['File change detected. Starting incremental compilation...\r\n', 'error TS2322\r\n'])).toEqual([]);
  });
});

describe('patterns from the config', () => {
  it('errorPattern adds a failure line, keeping the built-in ones', () => {
    const criteria = { errorPattern: 'BUILD (BROKEN|FAILED)' };
    expect(markAfter(['[gulp] BUILD BROKEN'], criteria)).toBe(true);
    expect(markAfter(['Failed to compile.'], criteria)).toBe(true);
  });

  it('readyPattern adds a success line', () => {
    const criteria = { errorPattern: 'BUILD BROKEN', readyPattern: '^ready on \\d+' };
    expect(markAfter(['BUILD BROKEN', 'ready on 3000'], criteria)).toBe(false);
    expect(markAfter(['BUILD BROKEN', 'not ready on 3000'], criteria)).toBe(true);
  });

  it('readyPattern matches a line that starts with ANSI codes', () => {
    expect(markAfter(['Failed to compile.', '\u001b[32mready on 3000\u001b[0m'], { readyPattern: '^ready' })).toBe(false);
  });
});

describe('what does not set the mark', () => {
  it.each([
    ['Vite internal error', '10:41:07 AM [vite] Internal server error: Transform failed with 1 error:'],
    ['Vite pre-transform error', '10:41:07 AM [vite] Pre-transform error: Failed to resolve import "./x"'],
    ['webpack warnings only', 'webpack 5.97.1 compiled with 2 warnings in 812 ms'],
    ['tsc with no errors', 'Found 0 errors. Watching for file changes.'],
    ['esbuild error detail alone', '✘ [ERROR] Could not resolve "./x"'],
  ])('%s', (_case, line) => {
    expect(changes([`${line}\r\n`])).toEqual([]);
  });
});

describe('dispose', () => {
  it('stops reporting', () => {
    const reported: boolean[] = [];
    const watch = watchBuildErrors({ criteria: {}, onChange: (buildError) => reported.push(buildError) });
    watch.feed('Failed to compile.\r\n');
    watch.dispose();
    watch.feed('Compiled successfully\r\n');
    expect(reported).toEqual([true]);
  });
});
