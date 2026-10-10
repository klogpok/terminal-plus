import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { RepoView, ServiceRef, ServiceView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { repoColor } from '../repo-color';
import { STRINGS } from '../strings';
import { ServiceTerminal } from './service-terminal';
import { TerminalTabs, tabKey } from './terminal-tabs.service';

interface OpenTab {
  key: string;
  ref: ServiceRef;
  repo: RepoView;
  service: ServiceView;
  color: string;
}

/**
 * Right area: one tab per open Service terminal, colored like its Repo. Every open terminal stays
 * mounted (hidden when not shown) so it keeps streaming.
 */
@Component({
  selector: 'dp-terminal-tabs',
  imports: [ServiceTerminal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './terminal-tab-strip.html',
  styleUrl: './terminal-tab-strip.css',
})
export class TerminalTabStrip {
  protected readonly strings = STRINGS;
  protected readonly tabs = inject(TerminalTabs);
  private readonly backend = inject(BackendService);

  /** Open tabs whose Service exists in the current state (others are hidden, not forgotten). */
  protected readonly openTabs = computed<OpenTab[]>(() => {
    const repos = this.backend.repos();
    const result: OpenTab[] = [];
    for (const ref of this.tabs.tabs()) {
      const repo = repos.find((r) => r.id === ref.repoId);
      const service = repo?.services.find((s) => s.id === ref.serviceId);
      if (repo && service) result.push({ key: tabKey(ref), ref, repo, service, color: repoColor(repo) });
    }
    return result;
  });

  /** The shown tab: the selected one, or the first open one. */
  protected readonly activeKey = computed(() => {
    const tabs = this.openTabs();
    const active = this.tabs.active();
    return tabs.some((t) => t.key === active) ? active : (tabs[0]?.key ?? null);
  });
}
