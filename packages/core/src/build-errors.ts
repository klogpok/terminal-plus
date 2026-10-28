/**
 * Build Error of one Service run: watch tools (nx, webpack, Angular CLI, `tsc --watch`) stay alive
 * when a build fails, so the only signal is the summary line they print after every build.
 * Each completed output line is checked: a failure line sets the mark, a success line clears it,
 * other lines change nothing; the last matching line wins. Only changes are reported.
 */
import { toPlainLine } from './output-tail.js';

export interface BuildErrorCriteria {
  /** Added to the built-in failure lines. */
  errorPattern?: string;
  /** Added to the built-in success lines. */
  readyPattern?: string;
}

export interface BuildErrorOptions {
  criteria: BuildErrorCriteria;
  onChange(buildError: boolean): void;
}

export interface BuildErrorWatch {
  /** Feeds Service output (raw pty data). */
  feed(data: string): void;
  /** Stops reporting. Idempotent. */
  dispose(): void;
}

/** Not anchored: tools prefix timestamps, badges and symbols. Sources: see the build-errors spec. */
const FAILURE_LINES = [
  // nx @nx/js:node
  /Build failed, waiting for changes to restart/,
  /Process exited with code \d+, waiting for changes to restart/,
  // webpack 5
  /compiled with \d+ errors?/,
  // Angular application builder (esbuild)
  /Application bundle generation failed\./,
  // Angular legacy webpack builder, CRA
  /Failed to compile\./,
  // tsc --watch, nest start --watch, vite-plugin-checker
  /Found [1-9]\d* errors?\. Watching for file changes\./,
];

const SUCCESS_LINES = [
  // webpack 5, Angular legacy webpack builder, CRA
  /[Cc]ompiled successfully/,
  /^(?!.*error).*compiled with \d+ warnings?/,
  // Angular application builder (esbuild)
  /Application bundle generation complete\./,
  // tsc --watch, nest start --watch, vite-plugin-checker
  /Found 0 errors\. Watching for file changes\./,
];

/** An unfinished line longer than this (a progress bar redrawn with `\r`) keeps only its end. */
const MAX_PENDING = 8_192;

export function watchBuildErrors(options: BuildErrorOptions): BuildErrorWatch {
  const { errorPattern, readyPattern } = options.criteria;
  const failures = errorPattern !== undefined ? [...FAILURE_LINES, new RegExp(errorPattern)] : FAILURE_LINES;
  const successes = readyPattern !== undefined ? [...SUCCESS_LINES, new RegExp(readyPattern)] : SUCCESS_LINES;
  let buildError = false;
  let pending = '';
  let done = false;

  const check = (raw: string) => {
    const line = toPlainLine(raw);
    const next = failures.some((p) => p.test(line)) ? true : successes.some((p) => p.test(line)) ? false : buildError;
    if (next === buildError) return;
    buildError = next;
    options.onChange(next);
  };

  return {
    feed(data) {
      if (done) return;
      const lines = (pending + data).split('\n');
      pending = lines.pop()!.slice(-MAX_PENDING);
      for (const line of lines) {
        check(line);
        if (done) return;
      }
    },
    dispose() {
      done = true;
      pending = '';
    },
  };
}
