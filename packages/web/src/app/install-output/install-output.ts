import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { BackendService, type InstallTab } from '../backend/backend.service';
import { STRINGS } from '../ui-strings';
import { TERMINAL_VIEW_FACTORY } from '../terminal/terminal-view';

/**
 * Body of one `pnpm install` tab in the terminal tab strip: a read-only xterm fed from
 * `InstallTab.output` (raw pty output, kept in the browser only), plus the install result.
 */
@Component({
  selector: 'dp-install-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="install-output" [attr.data-install-repo-id]="tab().repoId" [class]="'install-output state-' + tab().state">
      <div class="install-log" #host></div>
      <div class="install-status" role="status">{{ status() }}</div>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .install-output { display: flex; flex-direction: column; flex: 1; min-height: 0; padding-top: 6px; }
    .install-log { flex: 1; min-height: 0; background: #0b0f17; border-radius: 4px; padding: 4px; overflow: hidden; }
    .install-status { padding: 6px 2px; font-size: 13px; }
    .state-succeeded .install-status { color: #16a34a; }
    .state-failed .install-status { color: #dc2626; }
  `,
})
export class InstallOutput {
  readonly tab = input.required<InstallTab>();
  /** Whether this tab is the one shown (only a visible terminal can be fitted). */
  readonly active = input(false);
  protected readonly backend = inject(BackendService);

  private readonly view = inject(TERMINAL_VIEW_FACTORY)();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  /** Output already written to the terminal. */
  private written = '';

  protected readonly status = computed(() => {
    const tab = this.tab();
    if (tab.state === 'running') return STRINGS.install.status.running;
    if (tab.state === 'succeeded') return STRINGS.install.status.succeeded;
    return STRINGS.install.status.failed(tab.exitCode ?? -1);
  });

  constructor() {
    // Append what is new; if the kept tail was trimmed at the front, redraw it all.
    effect(() => {
      const output = this.tab().output;
      if (output.startsWith(this.written)) {
        this.view.write(output.slice(this.written.length));
      } else {
        this.view.reset();
        this.view.write(output);
      }
      this.written = output;
    });

    effect(() => {
      if (this.active()) setTimeout(() => this.view.fit());
    });

    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      const host = this.host().nativeElement;
      this.view.open(host);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => this.view.fit());
        observer.observe(host);
      }
    });

    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      this.view.dispose();
    });
  }
}
