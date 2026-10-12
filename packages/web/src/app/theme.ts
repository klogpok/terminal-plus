import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The Theme choices: `system` follows the operating system's light or dark setting. */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Per-viewer Theme, remembered in localStorage (a per-viewer convenience, unlike the UI Language).
 * A missing or unknown value, or unavailable storage, means `system`.
 */
const THEME_KEY = 'devpanel.theme';

function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}

function storedTheme(): Theme {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return isTheme(theme) ? theme : 'system';
  } catch {
    return 'system';
  }
}

/** `<html data-theme>` overrides the colour tokens; without it styles.css follows the system. */
function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

/** Applies the stored Theme at page load, before Angular starts, so the page never flashes the other one. */
export function loadTheme(): Theme {
  const theme = storedTheme();
  applyTheme(theme);
  return theme;
}

/** The Theme of this page; a choice made in another tab of the same browser follows here at once. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly current = signal(storedTheme());
  readonly theme = this.current.asReadonly();

  constructor() {
    const follow = (event: StorageEvent): void => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      this.current.set(storedTheme());
      applyTheme(this.current());
    };
    window.addEventListener('storage', follow);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', follow));
  }

  choose(theme: Theme): void {
    this.current.set(theme);
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: the Theme applies to this page only */
    }
  }
}
