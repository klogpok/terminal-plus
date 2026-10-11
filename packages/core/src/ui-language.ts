/**
 * The stored UI Language: one small file in the app data folder. `core` owns it; the launcher and
 * the desktop app read it before any `DevPanelCore` exists.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UiLanguage } from '@devpanel/shared';
import { readJsonFile } from './json-file.js';

/** File name of the UI Language file in the app data directory. */
export const UI_LANGUAGE_FILE = 'ui-language.json';

/** Reads the stored UI Language; a missing, unreadable or garbled file means English. */
export async function readUiLanguage(appDataDir: string): Promise<UiLanguage> {
  try {
    const json = await readJsonFile(path.join(appDataDir, UI_LANGUAGE_FILE));
    return (json as { language?: unknown } | null)?.language === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

/** Stores the UI Language (via a temp file + rename, so a crash never leaves half a file). */
export async function writeUiLanguage(appDataDir: string, language: UiLanguage): Promise<void> {
  await mkdir(appDataDir, { recursive: true });
  const file = path.join(appDataDir, UI_LANGUAGE_FILE);
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify({ language }, null, 2)}\n`, 'utf8');
  await rename(temp, file);
}
