import { execFile } from 'node:child_process';
import * as pty from 'node-pty';

export interface SpawnOptions {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/** A Service process running in a pty. */
export interface ServiceProcess {
  readonly pid: number;
  /** Resolves with the exit code once the process has exited. */
  readonly exited: Promise<number>;
  onData(listener: (data: string) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ctrl+C, wait up to `gracefulMs`, then kill the whole tree. Resolves after exit. */
  stop(gracefulMs: number): Promise<void>;
}

const CTRL_C = '\x03';
/**
 * After Ctrl+C, cmd.exe running a batch file (pnpm.cmd, npm.cmd shims) asks
 * "Terminate batch job (Y/N)?" (localized) and waits; we answer it so the graceful stop is not stalled.
 */
const BATCH_PROMPT = /(\(Y\/N\)|\[Y\(да\)\/N\(нет\)\])\?\s*$/i;
const ANSI = /\u001b\][^\u0007]*\u0007|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;
/** How long to wait for the pty exit event after the tree was killed. */
const EXIT_AFTER_KILL_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `taskkill /T /F` on a PID: kills the process and all its descendants. Never rejects. */
export function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, () => resolve());
  });
}

/** Spawns `command` through `cmd.exe /d /s /c` in a pty, with `FORCE_COLOR=1`. */
export function spawnService(options: SpawnOptions): ServiceProcess {
  const shell = process.env.ComSpec ?? 'cmd.exe';
  // On Windows node-pty takes the arguments as a raw command line; /s strips the outer quotes.
  const commandLine = `/d /s /c "${options.command}"`;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  Object.assign(env, options.env, { FORCE_COLOR: '1' });

  const term = pty.spawn(shell, commandLine, {
    name: 'xterm-256color',
    cols: options.cols ?? 120,
    rows: options.rows ?? 30,
    cwd: options.cwd,
    env,
  });

  let hasExited = false;
  let stopRequested = false;
  let tail = '';
  term.onData((data) => {
    if (!stopRequested) return;
    tail = (tail + data.replace(ANSI, '')).slice(-200);
    if (BATCH_PROMPT.test(tail)) {
      tail = '';
      term.write('Y\r');
    }
  });

  const exited = new Promise<number>((resolve) => {
    term.onExit(({ exitCode }) => {
      hasExited = true;
      resolve(exitCode);
    });
  });

  return {
    pid: term.pid,
    exited,
    onData(listener) {
      term.onData(listener);
    },
    write(data) {
      if (!hasExited) term.write(data);
    },
    resize(cols, rows) {
      if (!hasExited) term.resize(cols, rows);
    },
    async stop(gracefulMs) {
      if (!hasExited) {
        stopRequested = true;
        term.write(CTRL_C);
        await Promise.race([exited, delay(gracefulMs)]);
      }
      if (!hasExited) {
        await killTree(term.pid);
        await Promise.race([exited, delay(EXIT_AFTER_KILL_MS)]);
      }
      if (!hasExited) {
        // Last resort: close the pseudo console, which terminates every attached process.
        try {
          term.kill();
        } catch {
          /* already gone */
        }
        await exited;
      }
    },
  };
}
