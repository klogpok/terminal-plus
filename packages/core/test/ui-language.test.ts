import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevPanelError } from '@devpanel/shared';
import { UI_LANGUAGE_FILE, readUiLanguage } from '../src/index.js';
import { Harness } from './harness.js';

let h: Harness;
beforeEach(() => {
  h = new Harness();
});
afterEach(async () => {
  await h.dispose();
});

describe('UI Language', () => {
  it('is English in a fresh app data folder', async () => {
    const core = await h.createCore();

    expect(core.snapshot().uiLanguage).toBe('en');
    expect(core.uiLanguage).toBe('en');
  });

  it('setUiLanguage stores it, announces it, and a new core on the same folder reports it', async () => {
    const core = await h.createCore();
    const events: unknown[] = [];
    core.on('uiLanguageChanged', (e) => events.push(e));

    await core.setUiLanguage('ru');

    expect(events).toEqual([{ language: 'ru' }]);
    expect(core.snapshot().uiLanguage).toBe('ru');
    expect(core.uiLanguage).toBe('ru');
    const restarted = await h.createCore();
    expect(restarted.snapshot().uiLanguage).toBe('ru');
  });

  it('setting the current UI Language again emits nothing', async () => {
    const core = await h.createCore();
    await core.setUiLanguage('ru');
    const events: unknown[] = [];
    core.on('uiLanguageChanged', (e) => events.push(e));

    await core.setUiLanguage('ru');

    expect(events).toEqual([]);
  });

  it('a garbled stored file means English', async () => {
    writeFileSync(path.join(h.appDataDir, UI_LANGUAGE_FILE), '{ not json');
    const core = await h.createCore();

    expect(core.snapshot().uiLanguage).toBe('en');
  });

  it('fails with uiLanguageNotSaved when the file cannot be written, and keeps the old value', async () => {
    // A folder where the file should be makes the write fail.
    mkdirSync(path.join(h.appDataDir, UI_LANGUAGE_FILE));
    const core = await h.createCore();
    const events: unknown[] = [];
    core.on('uiLanguageChanged', (e) => events.push(e));

    const error = await core.setUiLanguage('ru').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(DevPanelError);
    expect((error as DevPanelError).code).toBe('uiLanguageNotSaved');
    expect(events).toEqual([]);
    expect(core.snapshot().uiLanguage).toBe('en');
  });
});

describe('readUiLanguage (no core needed)', () => {
  it('reads what setUiLanguage stored', async () => {
    const core = await h.createCore();
    await core.setUiLanguage('ru');

    expect(await readUiLanguage(h.appDataDir)).toBe('ru');
  });

  it('is English for a missing, garbled or unknown file', async () => {
    expect(await readUiLanguage(h.appDataDir)).toBe('en');
    writeFileSync(path.join(h.appDataDir, UI_LANGUAGE_FILE), 'garbage');
    expect(await readUiLanguage(h.appDataDir)).toBe('en');
    writeFileSync(path.join(h.appDataDir, UI_LANGUAGE_FILE), JSON.stringify({ language: 'de' }));
    expect(await readUiLanguage(h.appDataDir)).toBe('en');
  });
});
