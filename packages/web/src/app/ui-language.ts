import { InjectionToken } from '@angular/core';
import type { UiLanguage } from '@devpanel/shared';
import { STRINGS, useUiStrings } from './strings';

/**
 * Per-viewer cache of the last UI Language, so the page opens in it without a flash of the other
 * language. A missing or unknown value, or unavailable storage, means English.
 */
const UI_LANGUAGE_KEY = 'devpanel.uiLanguage';

function cachedUiLanguage(): UiLanguage {
  try {
    return localStorage.getItem(UI_LANGUAGE_KEY) === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Stores `language` as this viewer's cached UI Language. Returns false when it could not be stored
 * (storage unavailable), so the caller does not reload into the same language forever.
 */
export function cacheUiLanguage(language: UiLanguage): boolean {
  try {
    localStorage.setItem(UI_LANGUAGE_KEY, language);
  } catch {
    return false;
  }
  return cachedUiLanguage() === language;
}

/** Reloads the page; tests provide a fake to observe it. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => () => location.reload(),
});

/**
 * Picks the UI string set at page load, before Angular starts, and makes `<html lang>` and the page
 * title follow it. Components keep reading `STRINGS`.
 */
export function loadUiLanguage(): UiLanguage {
  const language = cachedUiLanguage();
  useUiStrings(language);
  document.documentElement.lang = language;
  document.title = STRINGS.appTitle;
  return language;
}
