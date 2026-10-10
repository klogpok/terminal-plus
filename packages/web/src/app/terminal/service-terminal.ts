import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ServiceRef } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../strings';
import { TERMINAL_VIEW_FACTORY, type TerminalSize } from './terminal-view';

/** How long "Скопировано" stays visible. */
const COPIED_NOTICE_MS = 1500;

/**
 * One Service's terminal: replays the Server buffer, then streams live `log` output; sends typed
 * input and its size to the Service pty; offers Clear, Copy all and search.
 */
@Component({
  selector: 'dp-service-terminal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './service-terminal.html',
  styleUrl: './service-terminal.css',
})
export class ServiceTerminal {
  readonly ref = input.required<ServiceRef>();
  /** Whether this tab is the one shown; a hidden terminal cannot be measured. */
  readonly active = input(false);

  protected readonly strings = STRINGS;
  protected readonly notice = signal('');

  private readonly backend = inject(BackendService);
  private readonly view = inject(TERMINAL_VIEW_FACTORY)();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  /** While a buffer request is in flight, live `log` events are already part of the buffer. */
  private replaying = true;
  private replayGeneration = 0;
  private lastSize?: TerminalSize;
  private noticeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const destroyRef = inject(DestroyRef);

    const offLog = this.backend.on('log', (event) => {
      const ref = this.ref();
      if (this.replaying || event.repoId !== ref.repoId || event.serviceId !== ref.serviceId) return;
      this.view.write(event.data);
    });
    this.view.onInput((data) => {
      if (this.backend.connection() !== 'open') return;
      this.backend.command('writeToPty', { ...this.ref(), data }).catch(() => {});
    });

    // Every (re)connect replays the buffer: output may have been missed while disconnected.
    effect(() => {
      if (this.backend.connection() === 'open') untracked(() => this.replay());
    });

    // Becoming visible: measure and claim the pty size (the most recent resize from any client wins).
    effect(() => {
      if (this.active() && this.backend.connection() === 'open') {
        untracked(() => setTimeout(() => this.sendSize(true)));
      }
    });

    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      const host = this.host().nativeElement;
      this.view.open(host);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => this.sendSize(false));
        observer.observe(host);
      }
    });

    destroyRef.onDestroy(() => {
      offLog();
      observer?.disconnect();
      clearTimeout(this.noticeTimer);
      this.view.dispose();
    });
  }

  protected clear(): void {
    this.view.clear();
    this.view.focus();
  }

  protected async copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.view.allText());
      this.showNotice(this.strings.terminal.copied);
    } catch {
      this.showNotice(this.strings.terminal.copyFailed);
    }
  }

  protected search(term: string, backwards = false): void {
    if (!term) {
      this.view.clearSearch();
      this.notice.set('');
      return;
    }
    const found = backwards ? this.view.findPrevious(term) : this.view.findNext(term);
    this.notice.set(found ? '' : this.strings.terminal.notFound);
  }

  protected onSearchKey(event: KeyboardEvent, term: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.search(term, event.shiftKey);
    } else if (event.key === 'Escape') {
      (event.target as HTMLInputElement).value = '';
      this.search('');
      this.view.focus();
    }
  }

  private replay(): void {
    this.replaying = true;
    const generation = ++this.replayGeneration;
    this.backend.command('getServiceOutput', this.ref()).then(
      (output) => {
        if (generation !== this.replayGeneration) return;
        this.view.reset();
        this.view.write(output);
        this.replaying = false;
      },
      // Disconnected or the Service is gone: the next (re)connect replays again.
      () => {},
    );
  }

  /** Fits the terminal and sends its size; `force` re-sends an unchanged size (tab shown again). */
  private sendSize(force: boolean): void {
    if (!this.active() || this.backend.connection() !== 'open') return;
    const size = this.view.fit();
    if (!size || size.cols < 1 || size.rows < 1) return;
    if (!force && this.lastSize?.cols === size.cols && this.lastSize.rows === size.rows) return;
    this.lastSize = size;
    this.backend.command('resizePty', { ...this.ref(), ...size }).catch(() => {});
    if (force) this.view.focus();
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), COPIED_NOTICE_MS);
  }
}
