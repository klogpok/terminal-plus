import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { EXIT_SIGNALS, onExitSignals, type ExitSignal } from '../src/index.js';

describe('exit signals', () => {
  it('SIGINT, SIGTERM, console close (SIGHUP) and beforeExit all trigger Exit', () => {
    expect([...EXIT_SIGNALS].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM', 'beforeExit']);
    for (const signal of EXIT_SIGNALS) {
      const target = new EventEmitter();
      const exits: ExitSignal[] = [];
      onExitSignals(target, (s) => exits.push(s));
      target.emit(signal);
      expect(exits).toEqual([signal]);
    }
  });

  it('runs Exit once even when several signals arrive (e.g. Ctrl+C then closing the window)', () => {
    const target = new EventEmitter();
    const exits: ExitSignal[] = [];
    onExitSignals(target, (s) => exits.push(s));
    target.emit('SIGINT');
    target.emit('SIGHUP');
    target.emit('beforeExit');
    expect(exits).toEqual(['SIGINT']);
  });
});
