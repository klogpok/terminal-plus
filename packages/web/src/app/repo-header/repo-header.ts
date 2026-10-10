import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { RepoView, ServiceStatus } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../strings';

/** Statuses in which a Service has a live process that removing the Repo would stop. */
const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy', 'stopping']);

/**
 * Top of a Repo card: name, git branch, "Открыть папку", "Удалить" with a confirmation listing what
 * runs, and for a missing folder the "Папка не найдена" notice with "Указать новое расположение".
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
    button:hover { border-color: var(--accent); }
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
  /** Names of the Services that removing the Repo will stop. Ticket 09 adds Sessions here. */
  protected readonly running = computed(() => this.repo().services.filter((s) => LIVE.has(s.status)).map((s) => s.name));

  protected remove(): void {
    this.confirming.set(false);
    this.backend.removeRepo(this.repo().id);
  }
}
