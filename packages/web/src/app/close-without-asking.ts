import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** localStorage key of the close-without-asking choice; holds `'true'` or `'false'`. */
const CLOSE_WITHOUT_ASKING_KEY = 'devpanel.closeWithoutAsking';

function storedChoice(): boolean {
  try {
    return localStorage.getItem(CLOSE_WITHOUT_ASKING_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Per-browser choice to end a running Session at once when its tab is closed, instead of asking
 * first; remembered in localStorage like the Theme. A missing or unknown value, or unavailable
 * storage, means off (ask). A change made in another tab of the same browser follows here at once.
 */
@Injectable({ providedIn: 'root' })
export class CloseWithoutAskingSetting {
  private readonly current = signal(storedChoice());
  readonly enabled = this.current.asReadonly();

  constructor() {
    const follow = (event: StorageEvent): void => {
      if (event.key !== CLOSE_WITHOUT_ASKING_KEY && event.key !== null) return;
      this.current.set(storedChoice());
    };
    window.addEventListener('storage', follow);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', follow));
  }

  choose(enabled: boolean): void {
    this.current.set(enabled);
    try {
      localStorage.setItem(CLOSE_WITHOUT_ASKING_KEY, String(enabled));
    } catch {
      /* storage unavailable: the choice applies to this page only */
    }
  }
}
