import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
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
  imports: [CdkConnectedOverlay],
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
    <!-- Opens below the button, or above it when more of it fits there; it never grows past the
         window's edge, and its list scrolls. Escape is handled below, to give focus back. -->
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      cdkConnectedOverlayFlexibleDimensions
      [cdkConnectedOverlayViewportMargin]="8"
      [cdkConnectedOverlayDisableClose]="true"
      (overlayOutsideClick)="close(false)"
    >
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
        <input
          #filter
          type="search"
          class="filter"
          [placeholder]="strings.repos.switcherFilter"
          [attr.aria-label]="strings.repos.switcherFilter"
          [value]="query()"
          (input)="query.set(filter.value)"
          (keydown.enter)="chooseFirst()"
        />
        @if (visible(); as options) {
          <div class="options">
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
            } @empty {
              <div class="none">{{ strings.repos.switcherNoMatch(query().trim()) }}</div>
            }
          </div>
          @if (!query().trim() && options.length === 1) {
            <div class="none">{{ strings.repos.switcherNone }}</div>
          }
        } @else {
          <div class="none" role="status">{{ strings.repos.switcherLoading }}</div>
        }
        <div class="hint">{{ strings.repos.switcherHint }}</div>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
    .repo-branch { display: inline-flex; align-items: center; gap: 4px; min-width: 0; height: 22px; padding: 0 6px; border: 1px solid transparent; border-radius: 4px; background: none; color: var(--muted); cursor: pointer; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .repo-branch:hover, .repo-branch[aria-expanded=true] { border-color: var(--border); color: var(--fg); }
    .repo-branch.on-worktree { border-color: var(--accent); color: var(--accent); }
    .worktree-mark { flex: none; padding: 0 6px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 600; line-height: 16px; text-transform: uppercase; letter-spacing: 0.03em; }
    .switcher { display: flex; flex-direction: column; width: 280px; max-width: calc(100vw - 32px); padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
    .caption, .hint, .none { padding: 6px 8px; color: var(--muted); font-size: 12px; }
    .hint { border-top: 1px solid var(--border); margin-top: 4px; }
    .filter { flex: none; margin: 0 4px 4px; height: 26px; padding: 0 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); font-size: 12px; }
    .filter:focus { outline: none; border-color: var(--accent); }
    .options { display: flex; flex-direction: column; flex: 0 1 auto; min-height: 0; max-height: 420px; overflow: auto; }
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
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly open = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];
  /** The folders read when the switcher opened; undefined while reading. */
  protected readonly options = signal<FolderOption[] | undefined>(undefined);
  /** The filter typed in the switcher: folders whose title or path contains it, ignoring case. */
  protected readonly query = signal('');
  protected readonly visible = computed(() => {
    const options = this.options();
    const query = this.query().trim().toLowerCase();
    if (!options || !query) return options;
    return options.filter((o) => o.title.toLowerCase().includes(query) || o.path.toLowerCase().includes(query));
  });
  /** The branch the Repo runs on: its Worktree's, else its folder's. */
  protected readonly branch = computed(() => this.repo().worktree?.branch ?? this.repo().branch);

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.options.set(undefined);
    this.query.set('');
    this.open.set(true);
    // The switcher renders on the next change detection; focus the filter then.
    afterNextRender(() => this.menu()?.nativeElement.querySelector<HTMLElement>('.filter')?.focus(), {
      injector: this.injector,
    });
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

  /** Enter in the filter: choose the first folder left, other than the one it runs from. */
  protected chooseFirst(): void {
    const option = this.visible()?.find((o) => !o.current);
    if (option && !this.backend.switching()) this.choose(option);
  }

  protected moveFocus(step: number): void {
    const items = [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('.filter, [role=menuitemradio]:not(:disabled)') ?? [])];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + step + items.length) % items.length]!.focus();
  }
}
