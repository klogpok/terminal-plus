import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { ServiceRef, SessionView } from '@devpanel/shared';
import { BackendService, type InstallTab } from '../backend/backend.service';
import { InstallOutput } from '../install-output/install-output';
import { repoColor } from '../repo-color';
import { STRINGS } from '../ui-strings';
import { ServiceTerminal, type TerminalRef } from './service-terminal';
import { TerminalTabs, installTabKey, sessionTabKey, shownTabKey, tabKey } from './terminal-tabs.service';

interface TabBase {
  key: string;
  title: string;
  /** Name of the tab's Repo, shown before the label; empty when the label already names it. */
  repo: string;
  label: string;
  color: string;
}

type OpenTab =
  | (TabBase & { kind: 'service'; ref: ServiceRef })
  | (TabBase & { kind: 'session'; session: SessionView; ref: TerminalRef; ended: string })
  | (TabBase & { kind: 'install'; install: InstallTab });

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
  private readonly injector = inject(Injector);
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  /** Open tabs whose Service exists in the current state (others are hidden, not forgotten). */
  protected readonly openTabs = computed<OpenTab[]>(() => {
    const repos = this.backend.repos();
    const result: OpenTab[] = [];
    for (const ref of this.tabs.tabs()) {
      const repo = repos.find((r) => r.id === ref.repoId);
      const service = repo?.services.find((s) => s.id === ref.serviceId);
      if (!repo || !service) continue;
      const key = tabKey(ref);
      result.push({ kind: 'service', key, title: `${repo.name} · ${service.name}`, repo: repo.name, label: service.name, color: repoColor(repo), ref });
    }
    for (const session of this.backend.sessions()) {
      const repo = repos.find((r) => r.id === session.repoId);
      const label = STRINGS.sessions.label(session.kind, session.number);
      const finished = session.state === 'finished';
      result.push({
        kind: 'session',
        key: sessionTabKey(session.id),
        title: `${repo?.name ?? ''} · ${label}${finished ? ` ${STRINGS.sessions.finishedMark}` : ''}`,
        repo: repo?.name ?? '',
        label,
        color: repo ? repoColor(repo) : 'var(--muted)',
        session,
        ref: { sessionId: session.id },
        ended: finished ? STRINGS.sessions.finished(session.exitCode) : '',
      });
    }
    for (const install of this.backend.installTabs()) {
      const repo = repos.find((r) => r.id === install.repoId);
      const label = STRINGS.install.title(repo?.name ?? install.repoId);
      const color = repo ? repoColor(repo) : 'var(--muted)';
      result.push({ kind: 'install', key: installTabKey(install.repoId), title: label, repo: '', label, color, install });
    }
    return result;
  });

  /** The shown tab: the selected one, or the first open one. */
  protected readonly activeKey = computed(() =>
    shownTabKey(
      this.openTabs().map((t) => t.key),
      this.tabs.active(),
    ),
  );

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

  /** Key of the running Session tab whose close awaits confirmation. */
  protected readonly confirmingKey = signal<string | null>(null);
  /** That tab, while its Session still runs (a Session that ended meanwhile needs no confirmation). */
  protected readonly confirming = computed(() => {
    const key = this.confirmingKey();
    const tab = this.openTabs().find((t) => t.key === key);
    return tab?.kind === 'session' && tab.session.state === 'running' ? tab : undefined;
  });

  protected close(tab: OpenTab): void {
    if (tab.kind === 'service') this.tabs.close(tab.ref);
    else if (tab.kind === 'install') this.backend.closeInstallTab(tab.install.repoId);
    else if (tab.session.state === 'running') this.askToClose(tab.key);
    else this.backend.closeSession(tab.session.id);
  }

  /** Turns the tab into the close confirmation, with focus on the safe answer. */
  private askToClose(key: string): void {
    this.confirmingKey.set(key);
    afterNextRender(() => this.cancelButton()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Puts the tab back, with focus on it. */
  protected cancelClose(): void {
    const key = this.confirmingKey();
    this.confirmingKey.set(null);
    if (key) afterNextRender(() => document.getElementById(`tab-${key}`)?.focus(), { injector: this.injector });
  }

  /** Ends the Session whose close was confirmed. */
  protected confirmClose(): void {
    const tab = this.confirming();
    this.confirmingKey.set(null);
    if (tab) this.backend.closeSession(tab.session.id);
  }
}
