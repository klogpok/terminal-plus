import { DestroyRef, Injectable, inject } from '@angular/core';
import { BackendService } from '../backend/backend.service';
import { OpenTabOnStartSetting } from '../open-tab-on-start';
import { TerminalTabs, openTabKeys, shownTabKey } from './terminal-tabs.service';

/**
 * While the open-tab-on-start setting is on, a Service that goes `starting` gets its terminal tab,
 * behind the shown one. The app injects it at start, so it follows status changes whatever is on
 * screen.
 */
@Injectable({ providedIn: 'root' })
export class StartingServiceTabOpener {
  private readonly backend = inject(BackendService);
  private readonly setting = inject(OpenTabOnStartSetting);
  private readonly tabs = inject(TerminalTabs);

  constructor() {
    const stop = this.backend.on('statusChanged', ({ repoId, serviceId, status }) => {
      if (status !== 'starting' || !this.setting.enabled()) return;
      this.tabs.addBehind({ repoId, serviceId }, this.shownKey());
    });
    inject(DestroyRef).onDestroy(stop);
  }

  private shownKey(): string | null {
    const keys = openTabKeys(
      this.tabs.order(),
      this.tabs.tabs(),
      this.backend.repos(),
      this.backend.sessions(),
      this.backend.installTabs(),
    );
    return shownTabKey(keys, this.tabs.active());
  }
}
