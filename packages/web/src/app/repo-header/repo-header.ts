import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { RepoView, ServiceStatus, SessionKind } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { CollapsedRepos } from '../repo-list/collapsed-repos.service';
import { STRINGS } from '../ui-strings';
import { TerminalTabs, sessionTabKey } from '../terminal/terminal-tabs.service';
import { FolderSwitcher } from './folder-switcher';

/** Statuses in which a Service has a live process that removing the Repo would stop. */
const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy', 'stopping']);
/** Statuses from which a Service can be started. */
const STARTABLE: ReadonlySet<ServiceStatus> = new Set(['stopped', 'crashed', 'exited']);

/**
 * Top of a Repo card: the ⋮⋮ drag handle (of the card's `cdkDrag` in the Repo list), ▾/▸ (and the
 * name) to collapse the card, name, git
 * branch (the folder switcher), "Open folder", "Remove" with a confirmation listing what runs, and for a missing folder the "Folder not found" notice with "Choose the new location".
 */
@Component({
  selector: 'dp-repo-header',
  imports: [CdkDragHandle, FolderSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="repo-head">
      <span
        class="drag-handle"
        cdkDragHandle
        role="img"
        [title]="strings.repos.dragHandle"
        [attr.aria-label]="strings.repos.dragHandleLabel(repo().name)"
      >
        <svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
          <circle cx="1.5" cy="2" r="1.5" /><circle cx="6.5" cy="2" r="1.5" />
          <circle cx="1.5" cy="7" r="1.5" /><circle cx="6.5" cy="7" r="1.5" />
          <circle cx="1.5" cy="12" r="1.5" /><circle cx="6.5" cy="12" r="1.5" />
        </svg>
      </span>
      <button
        type="button"
        class="repo-toggle"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-label]="toggleLabel()"
        [title]="toggleLabel()"
        (click)="toggle()"
      >{{ collapsed() ? '▸' : '▾' }}</button>
      <span class="repo-name" [title]="repo().name" (click)="toggle()">{{ repo().name }}</span>
      <span class="repo-actions">
        @if (!repo().folderMissing) {
          <button type="button" [title]="strings.repos.openClaudeLabel(repo().name)" [attr.aria-label]="strings.repos.openClaudeLabel(repo().name)" (click)="openSession('claude')">{{ strings.repos.openClaude }}</button>
          <button type="button" [title]="strings.repos.openTerminalLabel(repo().name)" [attr.aria-label]="strings.repos.openTerminalLabel(repo().name)" (click)="openSession('shell')">{{ strings.repos.openTerminal }}</button>
          <button type="button" [title]="strings.repos.openFolder" [attr.aria-label]="strings.repos.openFolder" (click)="backend.openFolder(repo().id)">📂</button>
        }
        <button
          type="button"
          [title]="strings.repos.remove"
          [attr.aria-label]="strings.repos.removeRepo(repo().name)"
          (click)="confirming.set(true)"
        >✕</button>
      </span>
    </div>
    @if (repo().branch || repo().worktree) {
      <div class="branch-row">
        <dp-folder-switcher class="folder-switcher" [repo]="repo()" />
      </div>
    }
    @if (repo().services.length && !collapsed()) {
      <div class="run-actions">
        <button
          type="button"
          [disabled]="!anyStartable()"
          [title]="strings.actions.repoAction(strings.actions.startAll, repo().name)"
          [attr.aria-label]="strings.actions.repoAction(strings.actions.startAll, repo().name)"
          (click)="backend.startAll(repo().id)"
        ><span class="icon" aria-hidden="true">▶</span>{{ strings.actions.startAll }}</button>
        <button
          type="button"
          [disabled]="!anyStoppable()"
          [title]="strings.actions.repoAction(strings.actions.stopAll, repo().name)"
          [attr.aria-label]="strings.actions.repoAction(strings.actions.stopAll, repo().name)"
          (click)="backend.stopAll(repo().id)"
        ><span class="icon" aria-hidden="true">■</span>{{ strings.actions.stopAll }}</button>
      </div>
    }
    @if (repo().folderMissing) {
      <div class="missing">
        <strong>{{ strings.repos.folderMissing }}</strong>
        <span class="muted">{{ strings.repos.folderMissingHint }}</span>
        <button type="button" (click)="backend.relocateRepo(repo().id)">{{ strings.repos.relocate }}</button>
      </div>
    }
    @if (confirming()) {
      <div class="remove-confirm" role="alertdialog">
        <div>{{ strings.repos.removeQuestion(repo().name) }}</div>
        <div>{{ running().length ? strings.repos.removeStops(running()) : strings.repos.removeNothingRuns }}</div>
        <div class="muted">{{ strings.repos.removeKeepsFolder }}</div>
        <span class="form-actions">
          <button type="button" class="danger" (click)="remove()">{{ strings.repos.remove }}</button>
          <button type="button" (click)="confirming.set(false)">{{ strings.repos.cancel }}</button>
        </span>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .repo-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .drag-handle { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 22px; margin-left: -4px; border-radius: 4px; color: var(--muted); cursor: grab; user-select: none; }
    .drag-handle svg { fill: currentColor; }
    .drag-handle:hover { color: var(--fg); background: var(--bg); }
    .drag-handle:active { cursor: grabbing; }
    /* Snug between the handle and the name (negative margins cancel most of the row gap): the name keeps its room. */
    .repo-toggle { flex: none; width: 12px; border: none; background: none; color: var(--muted); padding: 0; margin: 0 -6px; font-size: 12px; }
    .repo-toggle:not(:disabled):hover { color: var(--fg); }
    .repo-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    /* Its own line under the name: the header row has no room left for long branch names. */
    .branch-row { display: flex; min-width: 0; margin: 2px 0 0 14px; }
    .folder-switcher { min-width: 0; max-width: 100%; }
    .repo-actions { margin-left: auto; display: flex; gap: 6px; flex: none; }
    button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 2px 6px; }
    button:not(:disabled):hover { border-color: var(--accent); }
    button:disabled { opacity: 0.35; cursor: default; }
    /* One-line icon buttons: glyphs (▶ ■ 📂 ✕ ▾) centered vertically. */
    .repo-head button, .run-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; line-height: 1; height: 22px; }
    .run-actions { margin-top: 4px; display: flex; gap: 4px; }
    .missing, .remove-confirm { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; align-items: flex-start; }
    .remove-confirm { padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
    .form-actions { display: flex; gap: 6px; }
    .danger { border-color: #ef4444; }
    .muted { color: var(--muted); }
  `,
})
export class RepoHeader {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  readonly repo = input.required<RepoView>();
  protected readonly confirming = signal(false);
  private readonly tabs = inject(TerminalTabs);
  private readonly collapsedRepos = inject(CollapsedRepos);
  protected readonly collapsed = computed(() => this.collapsedRepos.isCollapsed(this.repo().id));
  protected readonly toggleLabel = computed(() =>
    this.collapsed() ? STRINGS.repos.expand(this.repo().name) : STRINGS.repos.collapse(this.repo().name),
  );

  protected toggle(): void {
    this.collapsedRepos.toggle(this.repo().id);
  }
  /** Names of the Services and running Sessions that removing the Repo will stop. */
  protected readonly running = computed(() => [
    ...this.repo().services.filter((s) => LIVE.has(s.status)).map((s) => s.name),
    ...this.backend
      .sessions()
      .filter((s) => s.repoId === this.repo().id && s.state === 'running')
      .map((s) => STRINGS.sessions.label(s.kind, s.number)),
  ]);

  /** Opens a Claude Code or shell Session in this Repo and shows its tab. */
  protected async openSession(kind: SessionKind): Promise<void> {
    const session = await this.backend.openSession(this.repo().id, kind);
    if (session) this.tabs.selectKey(sessionTabKey(session.id));
  }

  /** "Start all" is enabled while some Service can be started (and the folder exists). */
  protected readonly anyStartable = computed(
    () => !this.repo().folderMissing && this.repo().services.some((s) => STARTABLE.has(s.status) && !s.removedFromConfig),
  );
  /** "Stop all" is enabled while some Service has a live process. */
  protected readonly anyStoppable = computed(() => this.repo().services.some((s) => LIVE.has(s.status)));

  protected remove(): void {
    this.confirming.set(false);
    this.backend.removeRepo(this.repo().id);
  }
}
