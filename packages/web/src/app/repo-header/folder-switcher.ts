import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { RepoView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../ui-strings';
import type { UiErrorInfo } from '../ui-errors';

/** A folder the Repo can run from: its own (`worktreePath` null) or one of its Worktrees. */
interface FolderOption {
  path: string;
  worktreePath: string | null;
  title: string;
  current: boolean;
}

const samePath = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

/**
 * The branch of a Repo in its header, as a button that opens the folder switcher: the Repo's own
 * folder and its Worktrees (read each time it opens). Choosing one restarts the running Services
 * there. A "Worktree" mark follows the button while the Repo runs from a Worktree.
 */
@Component({
  selector: 'dp-folder-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="repo-branch"
      [class.on-worktree]="repo().worktree"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="strings.repos.switcherLabel(repo().name)"
      [title]="repo().worktree ? strings.repos.worktreeTitle(repo().worktree!.path) : strings.repos.branchTitle"
      (click)="toggle()"
    >⎇ {{ branch() }} <span aria-hidden="true">▾</span></button>
    @if (repo().worktree) {
      <span class="worktree-mark" [title]="strings.repos.worktreeTitle(repo().worktree!.path)">{{ strings.repos.worktreeMark }}</span>
    }
    @if (open()) {
      <div
        #menu
        class="switcher"
        role="menu"
        [attr.aria-label]="strings.repos.runFrom(repo().name)"
        (keydown.escape)="close(true)"
        (keydown.arrowdown)="$event.preventDefault(); moveFocus(1)"
        (keydown.arrowup)="$event.preventDefault(); moveFocus(-1)"
      >
        <div class="caption">{{ strings.repos.runFrom(repo().name) }}</div>
        @if (options(); as options) {
          @for (option of options; track option.path) {
            <button
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="option.current"
              [attr.data-folder]="option.path"
              [disabled]="backend.switching()"
              (click)="choose(option)"
            >
              <span class="mark" aria-hidden="true">{{ option.current ? '✓' : '' }}</span>
              <span class="text">
                <span class="title">{{ option.title }}</span>
                <span class="path">{{ option.path }}</span>
              </span>
            </button>
          }
          @if (options.length === 1) {
            <div class="none">{{ strings.repos.switcherNone }}</div>
          }
        } @else {
          <div class="none" role="status">{{ strings.repos.switcherLoading }}</div>
        }
        <div class="hint">{{ strings.repos.switcherHint }}</div>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
    .repo-branch { display: inline-flex; align-items: center; gap: 4px; min-width: 0; height: 22px; padding: 0 6px; border: 1px solid transparent; border-radius: 4px; background: none; color: var(--muted); cursor: pointer; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .repo-branch:hover, .repo-branch[aria-expanded=true] { border-color: var(--border); color: var(--fg); }
    .repo-branch.on-worktree { border-color: var(--accent); color: var(--accent); }
    .worktree-mark { flex: none; padding: 0 6px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 600; line-height: 16px; text-transform: uppercase; letter-spacing: 0.03em; }
    .switcher { position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; display: flex; flex-direction: column; width: 280px; max-width: calc(100vw - 32px); padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
    .caption, .hint, .none { padding: 6px 8px; color: var(--muted); font-size: 12px; }
    .hint { border-top: 1px solid var(--border); margin-top: 4px; }
    .switcher button { display: flex; align-items: flex-start; gap: 6px; border: 0; border-radius: 4px; background: transparent; color: var(--fg); cursor: pointer; text-align: left; padding: 6px 8px; }
    .switcher button:not(:disabled):hover, .switcher button:focus-visible { background: var(--bg); outline: none; box-shadow: inset 0 0 0 1px var(--accent); }
    .switcher button:disabled { opacity: 0.5; cursor: default; }
    .mark { flex: none; width: 12px; color: var(--accent); font-weight: 700; }
    .text { display: flex; flex-direction: column; min-width: 0; }
    .title { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .path { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class FolderSwitcher {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  readonly repo = input.required<RepoView>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly open = signal(false);
  /** The folders read when the switcher opened; undefined while reading. */
  protected readonly options = signal<FolderOption[] | undefined>(undefined);
  /** The branch the Repo runs on: its Worktree's, else its folder's. */
  protected readonly branch = computed(() => this.repo().worktree?.branch ?? this.repo().branch);

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.options.set(undefined);
    this.open.set(true);
    this.backend.listWorktrees().then(
      (found) => {
        if (!this.open()) return;
        const repo = this.repo();
        const entry = found.find((e) => e.repoId === repo.id);
        this.options.set([
          { path: repo.path, worktreePath: null, title: STRINGS.repos.ownFolder(entry?.branch ?? repo.branch), current: !repo.worktree },
          ...(entry?.worktrees ?? []).map((w) => ({
            path: w.path,
            worktreePath: w.path,
            title: w.branch,
            current: samePath(repo.worktree?.path, w.path),
          })),
        ]);
        afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
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

  protected choose(option: FolderOption): void {
    this.close(true);
    if (!option.current) this.backend.switchRepoFolder(this.repo().id, option.worktreePath);
  }

  protected moveFocus(step: number): void {
    const items = this.items();
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + step + items.length) % items.length]!.focus();
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private items(): HTMLElement[] {
    return [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitemradio]') ?? [])];
  }
}
