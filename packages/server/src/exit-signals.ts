/**
 * Process events that mean "Exit DevPanel": Ctrl+C (SIGINT), SIGTERM, closing the console window
 * (SIGHUP on Windows; Windows then terminates the process after about 10 s, so Exit must be quick)
 * and `beforeExit` (the event loop ran dry).
 */
export const EXIT_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'beforeExit'] as const;

export type ExitSignal = (typeof EXIT_SIGNALS)[number];

/** Calls `exit` on the first of `EXIT_SIGNALS` that `target` (normally `process`) emits; later ones are ignored. */
export function onExitSignals(
  target: { on(event: ExitSignal, listener: () => void): unknown },
  exit: (signal: ExitSignal) => void,
): void {
  let exiting = false;
  for (const signal of EXIT_SIGNALS) {
    target.on(signal, () => {
      if (exiting) return;
      exiting = true;
      exit(signal);
    });
  }
}
