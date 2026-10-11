import { STRINGS, useUiStrings, type UiLanguage } from './strings';

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
