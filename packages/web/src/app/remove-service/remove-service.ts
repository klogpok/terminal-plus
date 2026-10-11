import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { RepoView, ServiceStatus, ServiceView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../ui-strings';

/** Statuses in which removing the Service stops a live process first. */
const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy', 'stopping']);

function isRunning(service: ServiceView): boolean {
  return LIVE.has(service.status) || service.waitingFor !== undefined;
}

/** Names of the Services of the Repo that depend on `service`. */
function dependentsOf(repo: RepoView, service: ServiceView): string[] {
  return repo.services.filter((s) => s.dependsOn.includes(service.id)).map((s) => s.name);
}

/** "Remove" asks first when the Service runs (it is stopped) or others depend on it. */
export function removalNeedsConfirmation(repo: RepoView, service: ServiceView): boolean {
  return isRunning(service) || dependentsOf(repo, service).length > 0;
}

/** The confirmation of "Remove" for a Service of a Local Config. */
@Component({
  selector: 'dp-remove-service',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="remove-confirm" role="alertdialog">
      <div>{{ running() ? strings.editConfig.removeRunning : strings.editConfig.removeQuestion(service().name) }}</div>
      @if (dependents().length) {
        <div>{{ strings.editConfig.removeDependents(dependents()) }}</div>
      }
      <span class="form-actions">
        <button type="button" class="danger" (click)="remove()">{{ strings.editConfig.removeConfirm }}</button>
        <button type="button" (click)="closed.emit()">{{ strings.editConfig.cancel }}</button>
      </span>
    </div>
  `,
  styles: `
    :host { display: block; flex-basis: 100%; }
    .remove-confirm { margin: 4px 0; padding: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; align-items: flex-start; border: 1px solid var(--border); border-radius: 6px; white-space: normal; }
    .form-actions { display: flex; gap: 6px; }
    button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 2px 8px; }
    .danger { border-color: #ef4444; }
  `,
})
export class RemoveService {
  readonly repo = input.required<RepoView>();
  readonly service = input.required<ServiceView>();
  readonly closed = output<void>();
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;

  protected readonly running = computed(() => isRunning(this.service()));
  protected readonly dependents = computed(() => dependentsOf(this.repo(), this.service()));

  protected remove(): void {
    this.backend.removeLocalService(this.repo().id, this.service().id);
    this.closed.emit();
  }
}
