import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ServiceView } from '@devpanel/shared';
import { STRINGS } from '../strings';

/**
 * How a Service ended by itself: `crashed` (exit code, styled as an error) or `exited` ("Finished by
 * itself", neutral), the last output lines, and "Start again". Renders nothing for other Statuses.
 */
@Component({
  selector: 'dp-service-exit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (details(); as d) {
      <div class="service-exit" [class.exit-crashed]="d.crashed" [attr.role]="d.crashed ? 'alert' : null">
        <div class="exit-head">
          <span class="exit-title">{{ d.title }}</span>
          <button type="button" class="start-again" (click)="startAgain.emit()">{{ strings.startAgain }}</button>
        </div>
        @if (d.output) {
          <div class="exit-caption">{{ strings.lastLines }}</div>
          <pre>{{ d.output }}</pre>
        } @else {
          <div class="exit-caption">{{ strings.noOutput }}</div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; flex-basis: 100%; min-width: 0; }
    .service-exit { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin: 2px 0 4px 18px; font-size: 12px; }
    .exit-crashed { border-color: var(--error-border); background: var(--error-bg); }
    .exit-head { display: flex; align-items: center; gap: 8px; }
    .exit-title { flex: 1; font-weight: 600; }
    .start-again { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 2px 8px; }
    .start-again:hover { border-color: var(--accent); }
    .exit-caption { color: var(--muted); margin-top: 4px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 4px 0 0; max-height: 180px; overflow: auto; font-size: 11px; }
  `,
})
export class ServiceExit {
  readonly service = input.required<ServiceView>();
  readonly startAgain = output<void>();
  protected readonly strings = STRINGS.serviceExit;

  protected readonly details = computed(() => {
    const { status, lastExit } = this.service();
    if (status !== 'crashed' && status !== 'exited') return undefined;
    const crashed = status === 'crashed';
    const exitCode = lastExit?.exitCode;
    return {
      crashed,
      title: crashed && exitCode !== undefined ? this.strings.crashed(exitCode) : crashed ? STRINGS.status.crashed : this.strings.exited,
      output: (lastExit?.lastLines ?? []).join('\n'),
    };
  });
}
