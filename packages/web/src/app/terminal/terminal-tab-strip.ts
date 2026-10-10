import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import type { ServiceRef } from '@devpanel/shared';
import { BackendService, type InstallTab } from '../backend/backend.service';
import { InstallOutput } from '../install-output/install-output';
import { repoColor } from '../repo-color';
import { STRINGS } from '../strings';
import { ServiceTerminal } from './service-terminal';
import { TerminalTabs, installTabKey, tabKey } from './terminal-tabs.service';

type OpenTab =
  | { kind: 'service'; key: string; title: string; label: string; color: string; ref: ServiceRef }
  | { kind: 'install'; key: string; title: string; label: string; color: string; install: InstallTab };

/**
 * Right area: one tab per open Service terminal (and per `pnpm install` run), colored like its
 * Repo. Every open terminal stays mounted (hidden when not shown) so it keeps streaming.
 */
@Component({
  selector: 'dp-terminal-tabs',
  imports: [ServiceTerminal, InstallOutput],
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
      if (!repo || !service) continue;
      const key = tabKey(ref);
      result.push({ kind: 'service', key, title: `${repo.name} · ${service.name}`, label: service.name, color: repoColor(repo), ref });
    }
    for (const install of this.backend.installTabs()) {
      const repo = repos.find((r) => r.id === install.repoId);
      const label = STRINGS.install.title(repo?.name ?? install.repoId);
      const color = repo ? repoColor(repo) : 'var(--muted)';
      result.push({ kind: 'install', key: installTabKey(install.repoId), title: label, label, color, install });
    }
    return result;
  });

  /** The shown tab: the selected one, or the first open one. */
  protected readonly activeKey = computed(() => {
    const tabs = this.openTabs();
    const active = this.tabs.active();
    return tabs.some((t) => t.key === active) ? active : (tabs[0]?.key ?? null);
  });

  constructor() {
    // A newly started install (from this or another browser tab) comes to the front.
    let known = new Set<string>();
    effect(() => {
      const repoIds = new Set(this.backend.installTabs().map((t) => t.repoId));
      for (const repoId of repoIds) {
        if (!known.has(repoId)) untracked(() => this.tabs.selectKey(installTabKey(repoId)));
      }
      known = repoIds;
    });
  }

  protected close(tab: OpenTab): void {
    if (tab.kind === 'service') this.tabs.close(tab.ref);
    else this.backend.closeInstallTab(tab.install.repoId);
  }
}
