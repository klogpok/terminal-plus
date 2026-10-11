import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { RepoView, ServiceStatus, SessionKind } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../strings';
import { TerminalTabs, sessionTabKey } from '../terminal/terminal-tabs.service';

/** Statuses in which a Service has a live process that removing the Repo would stop. */
const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy', 'stopping']);
/** Statuses from which a Service can be started. */
const STARTABLE: ReadonlySet<ServiceStatus> = new Set(['stopped', 'crashed', 'exited']);

/**
 * Top of a Repo card: name, git branch, "Open folder", "Remove" with a confirmation listing what
 * runs, and for a missing folder the "Folder not found" notice with "Choose the new location".
 */
@Component({
  selector: 'dp-repo-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="repo-head">
      <span class="repo-name">{{ repo().name }}</span>
      @if (repo().branch; as branch) {
        <span class="repo-branch" [title]="strings.repos.branchTitle">⎇ {{ branch }}</span>
      }
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
    @if (repo().services.length) {
      <div class="run-actions">
        <button
          type="button"
          [disabled]="!anyStartable()"
          [title]="strings.actions.repoAction(strings.actions.startAll, repo().name)"
          [attr.aria-label]="strings.actions.repoAction(strings.actions.startAll, repo().name)"
          (click)="backend.startAll(repo().id)"
        >▶ {{ strings.actions.startAll }}</button>
        <button
          type="button"
          [disabled]="!anyStoppable()"
          [title]="strings.actions.repoAction(strings.actions.stopAll, repo().name)"
          [attr.aria-label]="strings.actions.repoAction(strings.actions.stopAll, repo().name)"
          (click)="backend.stopAll(repo().id)"
        >■ {{ strings.actions.stopAll }}</button>
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
    .repo-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .repo-branch { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .repo-actions { margin-left: auto; display: flex; gap: 2px; flex: none; }
    button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 2px 6px; }
    button:not(:disabled):hover { border-color: var(--accent); }
    button:disabled { opacity: 0.35; cursor: default; }
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
