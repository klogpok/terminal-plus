/**
 * The shell–sidecar protocol fixture (`fixtures/protocol.jsonl`): one sample line per message. The
 * Rust shell deserializes the same file, so both sides stay in step without a running app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseShellMessage, parseSidecarMessage } from '../src/protocol.js';

const lines = readFileSync(fileURLToPath(new URL('fixtures/protocol.jsonl', import.meta.url)), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '');

const typeOf = (line: string) => (JSON.parse(line) as { type: string }).type;

describe('protocol fixture', () => {
  it('holds one sample line for every message of the spec', () => {
    expect(lines.map(typeOf)).toEqual([
      'start',
      'trayClicked',
      'trayItemClicked',
      'windowCloseRequested',
      'quitRequested',
      'autostartChanged',
      'errorDismissed',
      'openWindow',
      'showWindow',
      'hideWindow',
      'setTray',
      'showError',
      'setAutostart',
      'setCrashTexts',
      'openUrl',
      'openFolder',
      'exit',
    ]);
  });

  it('every shell → sidecar line parses as a shell message', () => {
    for (const line of lines.slice(0, 7)) expect(parseShellMessage(line)).toEqual({ ok: true, message: JSON.parse(line) });
  });

  it('every sidecar → shell line parses as a sidecar message', () => {
    for (const line of lines.slice(7)) expect(parseSidecarMessage(line)).toEqual({ ok: true, message: JSON.parse(line) });
  });

  it('rejects malformed and unknown lines with a reason', () => {
    for (const line of ['not json', '{"type":"launchRockets"}', '{"type":"trayItemClicked"}', '42']) {
      const result = parseShellMessage(line);
      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.error).not.toBe('');
    }
  });
});
