import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import type { RepoView, RepoWorktrees } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { repoColor } from '../repo-color';
import { STRINGS } from '../ui-strings';
import type { UiErrorInfo } from '../ui-errors';

/** A branch of the Branches panel and the Repos that have it. */
interface BranchRow {
  branch: string;
  repos: { repoId: string; label: string; color: string }[];
}

/**
 * One row per branch that has a Worktree in some Repo, with those Repos and, after them, the Repos
 * whose own folder is on it. The checked branch first, the rest by name.
 */
function branchRows(found: RepoWorktrees[], repos: RepoView[], checked: string | undefined): BranchRow[] {
  const rows = new Map<string, BranchRow>();
  const join = (branch: string, repo: RepoView, label: string) => {
    const row = rows.get(branch);
    if (row && !row.repos.some((r) => r.repoId === repo.id)) row.repos.push({ repoId: repo.id, label, color: repoColor(repo) });
  };
  for (const entry of found) {
    const repo = repos.find((r) => r.id === entry.repoId);
    if (!repo) continue;
    for (const { branch } of entry.worktrees) {
      if (!rows.has(branch)) rows.set(branch, { branch, repos: [] });
      join(branch, repo, repo.name);
    }
  }
  for (const entry of found) {
    const repo = repos.find((r) => r.id === entry.repoId);
    if (repo && entry.branch) join(entry.branch, repo, STRINGS.branches.ownFolder(repo.name));
  }
  const rank = (row: BranchRow) => (row.branch === checked ? 0 : 1);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.branch.localeCompare(b.branch));
}

/**
 * The "Branches" panel in the header (Branch Check): the branches that have Worktrees, grouped
 * across Repos, each with "Check"; while a Branch Check is in progress, "Checking ⎇ <branch>" with
 * "Back to main" next to the button. The Worktrees are read each time the panel opens.
 */
@Component({
  selector: 'dp-branches-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="branches-trigger"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="strings.branches.menu"
      (click)="toggle()"
    ><span aria-hidden="true">⎇</span> {{ strings.branches.menu }} <span aria-hidden="true">▾</span></button>
    @if (backend.branchCheck(); as branch) {
      <span class="checking" data-branch-check>
        {{ strings.branches.checking }}
        <span class="branch" [title]="branch">⎇ {{ branch }}</span>
        <button
          type="button"
          class="back"
          [title]="strings.branches.backToMainTitle"
          [disabled]="backend.switching()"
          (click)="backToMain()"
        >{{ strings.branches.backToMain }}</button>
      </span>
    }
    @if (backend.switching()) {
      <span class="switching" role="status">{{ strings.branches.switching }}</span>
    }
    @if (open()) {
      <div #panel class="branches-panel" role="dialog" [attr.aria-label]="strings.branches.menu" (keydown.escape)="close(true)">
        <div class="head">
          <strong>{{ strings.branches.menu }}</strong>
          <span class="muted">{{ strings.branches.hint }}</span>
        </div>
        @if (rows(); as rows) {
          <div class="rows">
            @for (row of rows; track row.branch) {
              <div class="row" [class.active]="row.branch === backend.branchCheck()" [attr.data-branch]="row.branch">
                <div class="info">
                  <span class="branch" [title]="row.branch">⎇ {{ row.branch }}</span>
                  <span class="chips">
                    @for (repo of row.repos; track repo.repoId) {
                      <span class="chip"><span class="dot" aria-hidden="true" [style.background]="repo.color"></span>{{ repo.label }}</span>
                    }
                  </span>
                </div>
                @if (row.branch === backend.branchCheck()) {
                  <button
                    type="button"
                    class="back"
                    [title]="strings.branches.backToMainTitle"
                    [disabled]="backend.switching()"
                    (click)="backToMain()"
                  >{{ strings.branches.backToMain }}</button>
                } @else {
                  <button
                    type="button"
                    class="check"
                    [attr.aria-label]="strings.branches.checkLabel(row.branch)"
                    [disabled]="backend.switching()"
                    (click)="check(row.branch)"
                  >{{ strings.branches.check }}</button>
                }
              </div>
            } @empty {
              <div class="none">{{ strings.branches.none }}</div>
            }
          </div>
          <div class="foot muted">{{ strings.branches.footer }}</div>
        } @else {
          <div class="none" role="status">{{ strings.branches.loading }}</div>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
    button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; }
    button:not(:disabled):hover { border-color: var(--accent); }
    button:disabled { opacity: 0.5; cursor: default; }
    .branches-trigger { display: inline-flex; align-items: center; gap: 4px; line-height: 1; height: 26px; padding: 0 10px; flex: none; }
    .branches-trigger[aria-expanded=true] { border-color: var(--accent); }
    .checking { display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 26px; padding: 0 2px 0 10px; border: 1px solid var(--accent); border-radius: 13px; color: var(--accent); font-size: 12px; }
    .checking .branch { font-family: 'Cascadia Mono', Consolas, monospace; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .checking .back { flex: none; height: 20px; padding: 0 8px; border-radius: 10px; border-color: var(--accent); color: var(--accent); background: var(--panel); }
    .switching { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .branches-panel { position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; width: 420px; max-width: calc(100vw - 32px); border: 1px solid var(--border); border-radius: 6px; background: var(--panel); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
    .head { display: flex; flex-direction: column; padding: 10px 12px 8px; border-bottom: 1px solid var(--border); }
    .rows { max-height: min(420px, 60vh); overflow: auto; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .row.active { background: var(--bg); box-shadow: inset 3px 0 0 var(--accent); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .info .branch { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border: 1px solid var(--border); border-radius: 9px; font-size: 11px; color: var(--fg); }
    .dot { width: 7px; height: 7px; border-radius: 50%; }
    .check, .back { flex: none; height: 26px; padding: 0 12px; }
    .check { border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .none { padding: 12px; color: var(--muted); font-size: 12px; }
    .foot { padding: 8px 12px 10px; font-size: 11px; }
    .muted { color: var(--muted); font-size: 12px; }
    /* On a narrow window the trigger may sit anywhere in the wrapped header: span the width instead. */
    @media (max-width: 560px) {
      .branches-panel { position: fixed; top: 48px; left: 16px; right: 16px; width: auto; max-width: none; }
    }
  `,
})
export class BranchesMenu {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly open = signal(false);
  /** The rows read when the panel opened; undefined while reading. */
  protected readonly rows = signal<BranchRow[] | undefined>(undefined);

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.rows.set(undefined);
    this.open.set(true);
    this.backend.listWorktrees().then(
      (found) => {
        if (!this.open()) return;
        this.rows.set(branchRows(found, this.backend.repos(), this.backend.branchCheck()));
        // The rows render on the next change detection; focus the first button then.
        afterNextRender(() => this.panel()?.nativeElement.querySelector<HTMLElement>('button')?.focus(), {
          injector: this.injector,
        });
      },
      (error: UiErrorInfo) => {
        this.close(false);
        this.backend.showError(error);
      },
    );
  }

  protected close(restoreFocus: boolean): void {
    this.open.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  protected check(branch: string): void {
    this.close(true);
    this.backend.startBranchCheck(branch);
  }

  protected backToMain(): void {
    if (this.open()) this.close(true);
    this.backend.endBranchCheck();
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
