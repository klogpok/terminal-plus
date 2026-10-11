/**
 * Every user-facing UI string lives in a UI string set: English in `strings.en.ts` (the default)
 * and Russian in `strings.ts`. Both have the type `UiStrings`, so a key missing from either fails to
 * compile. Components read `STRINGS` from here only, never a set directly; never put user-facing
 * text in templates or code. The set is chosen once at page load, before Angular starts (see
 * `ui-language.ts`). Text shown outside the web UI (launcher console, desktop tray and dialogs, the
 * restart separator in Service output) lives in `HOST_STRINGS` (packages/shared/src/strings.ts).
 *
 * Error messages are keyed by `UiErrorCode` (`ui-errors.ts`); a new code fails to compile until its
 * message is added to both sets.
 */
import type { UiLanguage } from '@devpanel/shared';
import { EN_STRINGS, type UiStrings } from './strings.en';
import { RU_STRINGS } from './strings';
import type { UiErrorInfo } from './ui-errors';

export type { UiStrings } from './strings.en';
export type { UiErrorInfo } from './ui-errors';

const STRING_SETS: Record<UiLanguage, UiStrings> = { en: EN_STRINGS, ru: RU_STRINGS };

/** The loaded UI string set. English until `selectUiStrings` picks another at page load. */
export let STRINGS: UiStrings = EN_STRINGS;
let loadedLanguage: UiLanguage = 'en';

/** Selects the string set of a UI Language; called once at page load, before Angular starts. */
export function selectUiStrings(language: UiLanguage): void {
  STRINGS = STRING_SETS[language];
  loadedLanguage = language;
}

/** The UI Language of the loaded string set. */
export function loadedUiLanguage(): UiLanguage {
  return loadedLanguage;
}

/** The plain-language message for an error, in the loaded set. */
export function describeError(error: UiErrorInfo): string {
  const message = STRINGS.errors[error.code] as (params: unknown) => string;
  return message(error.params);
}
