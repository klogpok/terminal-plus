import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { ServiceView } from '@devpanel/shared';
import { STRINGS } from '../strings';

/**
 * A Service's port held by someone else: who holds it, in plain Russian, and the one button that
 * frees it ("Stop it and start ours" for our Service; "Kill it and start ours" for a foreign
 * process, which first asks for confirmation). After a Stop, the button only frees the port.
 * Renders nothing when the Service has no conflict.
 */
@Component({
  selector: 'dp-port-conflict',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="port-conflict" role="alert">
        <div class="conflict-message">{{ v.message }}</div>
        @if (confirming()) {
          <div class="conflict-confirm">
            <span>{{ v.confirm }}</span>
            <span class="conflict-actions">
              <button type="button" class="danger" (click)="confirmed()">{{ strings.confirmYes }}</button>
              <button type="button" (click)="confirming.set(false)">{{ strings.confirmNo }}</button>
            </span>
          </div>
        } @else {
          <button type="button" [class.danger]="v.needsConfirm" (click)="clicked(v.needsConfirm)">{{ v.button }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; flex-basis: 100%; min-width: 0; }
    .port-conflict { border: 1px solid var(--error-border); background: var(--error-bg); border-radius: 6px; padding: 6px 8px; margin: 2px 0 4px 18px; font-size: 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .conflict-confirm { display: flex; flex-direction: column; gap: 6px; }
    .conflict-actions { display: flex; gap: 6px; }
    button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 2px 8px; }
    button:hover { border-color: var(--accent); }
    button.danger { border-color: var(--error-border); }
  `,
})
export class PortConflictBlock {
  readonly service = input.required<ServiceView>();
  /** The user chose to free the port (confirmed, when a foreign process is to be killed). */
  readonly resolve = output<void>();
  protected readonly strings = STRINGS.portConflict;
  protected readonly confirming = signal(false);

  constructor() {
    // A new or changed conflict starts unconfirmed.
    effect(() => {
      this.service().portConflict;
      this.confirming.set(false);
    });
  }

  protected readonly view = computed(() => {
    const { name, portConflict } = this.service();
    if (!portConflict) return undefined;
    const { port, owner, reason } = portConflict;
    return {
      message: reason === 'stop' ? this.strings.stillTaken(name, port, owner) : this.strings.taken(port, owner),
      button: this.strings.resolve[reason][owner.kind],
      // Only a foreign process asks first; an Orphan is DevPanel's own leftover (one click).
      needsConfirm: owner.kind === 'process',
      confirm: owner.kind === 'process' ? this.strings.confirmKill(owner.processName, owner.pid) : '',
    };
  });

  protected clicked(needsConfirm: boolean): void {
    if (needsConfirm) this.confirming.set(true);
    else this.resolve.emit();
  }

  protected confirmed(): void {
    this.confirming.set(false);
    this.resolve.emit();
  }
}
