import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { STRINGS } from '../ui-strings';

/**
 * The single error pattern: a plain-language message, technical details folded under "Details",
 * and an optional close button (shown when someone listens to `dismiss`).
 */
@Component({
  selector: 'dp-error-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error" role="alert">
      <div class="error-head">
        <span class="error-message">{{ message() }}</span>
        @if (dismissible()) {
          <button type="button" class="error-close" [attr.aria-label]="strings.actions.dismiss" [title]="strings.actions.dismiss" (click)="dismiss.emit()">×</button>
        }
      </div>
      @if (details()) {
        <details>
          <summary>{{ strings.error.details }}</summary>
          <pre>{{ details() }}</pre>
        </details>
      }
    </div>
  `,
  styles: `
    .error { border: 1px solid var(--error-border); background: var(--error-bg); color: var(--fg); border-radius: 6px; padding: 8px 10px; }
    .error-head { display: flex; gap: 8px; align-items: flex-start; }
    .error-message { flex: 1; }
    .error-close { border: none; background: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; }
    summary { cursor: pointer; color: var(--muted); margin-top: 4px; font-size: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; margin: 4px 0 0; }
  `,
})
export class ErrorMessage {
  readonly message = input.required<string>();
  readonly details = input<string>('');
  readonly dismissible = input(false);
  readonly dismiss = output<void>();
  protected readonly strings = STRINGS;
}
