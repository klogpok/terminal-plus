import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ServiceStatus } from '@devpanel/shared';
import { BackendService } from './backend/backend.service';
import { ErrorMessage } from './error-message/error-message';
import { RepoList } from './repo-list/repo-list';
import { Settings } from './settings/settings';
import { TerminalTabStrip } from './terminal/terminal-tab-strip';
import { STRINGS } from './ui-strings';

const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);
const LEFT_WIDTH_KEY = 'devpanel.leftWidth';
const MIN_LEFT_WIDTH = 200;
const MAX_LEFT_WIDTH = 800;
/** The width before the splitter existed: 320px of content plus padding. */
const DEFAULT_LEFT_WIDTH = 344;
/** Arrow-key step of the splitter, in px. */
const LEFT_WIDTH_STEP = 16;

@Component({
  selector: 'dp-root',
  imports: [RepoList, ErrorMessage, Settings, TerminalTabStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  /** The "Exit DevPanel" confirmation is open. */
  protected readonly confirmingExit = signal(false);
  /** "Stop everything in all Repos" is enabled while any Service has a live process. */
  protected readonly anyStoppable = computed(() =>
    this.backend.repos().some((repo) => repo.services.some((s) => LIVE.has(s.status))),
  );

  protected readonly minLeftWidth = MIN_LEFT_WIDTH;
  protected readonly maxLeftWidth = MAX_LEFT_WIDTH;
  protected readonly defaultLeftWidth = DEFAULT_LEFT_WIDTH;
  /** Width of the Repo list, in px. Remembered in localStorage (a per-viewer convenience). */
  protected readonly leftWidth = signal(loadLeftWidth());
  /** Pointer x and width when the splitter drag started; null while not dragging. */
  private dragStart: { x: number; width: number } | null = null;

  protected exit(): void {
    this.confirmingExit.set(false);
    this.backend.exitDevPanel();
  }

  protected setLeftWidth(width: number): void {
    this.leftWidth.set(clampLeftWidth(width));
    try {
      localStorage.setItem(LEFT_WIDTH_KEY, String(this.leftWidth()));
    } catch {
      /* storage unavailable: the width just is not remembered */
    }
  }

  protected startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = { x: event.clientX, width: this.leftWidth() };
    event.preventDefault();
  }

  protected resize(event: PointerEvent): void {
    if (!this.dragStart) return;
    this.leftWidth.set(clampLeftWidth(this.dragStart.width + event.clientX - this.dragStart.x));
  }

  protected endResize(event: PointerEvent): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    this.setLeftWidth(this.leftWidth());
  }

  protected resizeByKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const delta = event.key === 'ArrowLeft' ? -LEFT_WIDTH_STEP : LEFT_WIDTH_STEP;
    this.setLeftWidth(this.leftWidth() + delta);
    event.preventDefault();
  }
}

function clampLeftWidth(width: number): number {
  return Math.round(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, width)));
}

function loadLeftWidth(): number {
  try {
    const stored = Number(localStorage.getItem(LEFT_WIDTH_KEY));
    return stored ? clampLeftWidth(stored) : DEFAULT_LEFT_WIDTH;
  } catch {
    return DEFAULT_LEFT_WIDTH;
  }
}
