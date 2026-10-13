import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Per-browser choice to open a Service's terminal tab when it starts, remembered in localStorage
 * like the Theme. A missing or unknown value, or unavailable storage, means off.
 */
const OPEN_TAB_ON_START_KEY = 'devpanel.openTabOnStart';

function storedChoice(): boolean {
  try {
    return localStorage.getItem(OPEN_TAB_ON_START_KEY) === 'true';
  } catch {
    return false;
  }
}

/** The setting of this page; a change made in another tab of the same browser follows here at once. */
@Injectable({ providedIn: 'root' })
export class OpenTabOnStart {
  private readonly current = signal(storedChoice());
  readonly enabled = this.current.asReadonly();

  constructor() {
    const follow = (event: StorageEvent): void => {
      if (event.key !== OPEN_TAB_ON_START_KEY && event.key !== null) return;
      this.current.set(storedChoice());
    };
    window.addEventListener('storage', follow);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', follow));
  }

  choose(enabled: boolean): void {
    this.current.set(enabled);
    try {
      localStorage.setItem(OPEN_TAB_ON_START_KEY, String(enabled));
    } catch {
      /* storage unavailable: the choice applies to this page only */
    }
  }
}
