import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ServiceRef, ServiceStatus } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { ErrorMessage } from '../error-message/error-message';
import { repoColor } from '../repo-color';
import { STRINGS, describeError, type UiErrorInfo } from '../ui-strings';

/** Pre-checked in a new Service Set: Services that run right now (also while starting or not responding). */
const RUNNING: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);

/** Where a refusal is shown: next to the name, next to the Services, or above the buttons. */
type RejectionPlace = 'name' | 'services' | 'form';

interface Rejection {
  place: RejectionPlace;
  message: string;
  details: string;
}

function keyOf(ref: ServiceRef): string {
  return JSON.stringify([ref.repoId, ref.serviceId]);
}

function placeOf(error: UiErrorInfo): RejectionPlace {
  switch (error.code) {
    case 'serviceSetNameEmpty':
    case 'serviceSetNameTaken':
      return 'name';
    case 'serviceSetEmpty':
      return 'services';
    default:
      return 'form';
  }
}

/**
 * The Service Set dialog (new Set): a name and every Service of every Repo with a checkbox, grouped
 * by Repo. The Server checks the values; its refusals are shown next to the field at fault.
 */
@Component({
  selector: 'dp-service-set-dialog',
  imports: [ErrorMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <form
      class="service-set-dialog"
      role="dialog"
      aria-labelledby="service-set-dialog-title"
      (submit)="$event.preventDefault(); submit()"
      (keydown.escape)="closed.emit()"
    >
      <div class="title" id="service-set-dialog-title">{{ strings.serviceSets.newTitle }}</div>
      <label>
        <span>{{ strings.serviceSets.nameLabel }}</span>
        <input
          #nameInput
          type="text"
          maxlength="100"
          [attr.aria-label]="strings.serviceSets.nameLabel"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
        />
      </label>
      @if (errorAt('name'); as message) {
        <div class="field-error" role="alert" data-field-error="name">{{ message }}</div>
      }
      <div class="services" [attr.aria-label]="strings.serviceSets.servicesLabel" role="group">
        @for (repo of repos(); track repo.id) {
          <fieldset [style.border-left-color]="repo.color">
            <legend>{{ repo.name }}</legend>
            @for (service of repo.services; track service.ref.serviceId) {
              <label class="check">
                <input
                  type="checkbox"
                  [attr.aria-label]="strings.serviceSets.serviceLabel(repo.name, service.name)"
                  [checked]="selected().has(service.key)"
                  (change)="toggle(service.key)"
                />
                {{ service.name }}
              </label>
            }
          </fieldset>
        } @empty {
          <div class="muted">{{ strings.serviceSets.noServices }}</div>
        }
      </div>
      @if (errorAt('services'); as message) {
        <div class="field-error" role="alert" data-field-error="services">{{ message }}</div>
      }
      @if (rejection(); as r) {
        @if (r.place === 'form') {
          <dp-error-message [message]="r.message" [details]="r.details" />
        }
      }
      <span class="form-actions">
        <button type="submit" [disabled]="busy()">{{ strings.serviceSets.save }}</button>
        <button type="button" (click)="closed.emit()">{{ strings.serviceSets.cancel }}</button>
      </span>
    </form>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; }
    .backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.35); }
    .service-set-dialog { position: relative; display: flex; flex-direction: column; gap: 8px; width: min(440px, 100%); max-height: calc(100vh - 96px); overflow: auto; padding: 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--fg); font-size: 13px; }
    .title { font-weight: 600; font-size: 14px; }
    label { display: flex; flex-direction: column; gap: 2px; }
    label.check { flex-direction: row; gap: 6px; align-items: baseline; }
    input[type=text] { padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); min-width: 0; }
    .services { display: flex; flex-direction: column; gap: 8px; }
    fieldset { border: 0; border-left: 3px solid var(--border); margin: 0; padding: 0 0 0 8px; display: flex; flex-direction: column; gap: 2px; }
    legend { padding: 0; margin-bottom: 2px; font-weight: 600; }
    .muted { color: var(--muted); }
    .field-error { color: var(--error-border); font-size: 12px; }
    .form-actions { display: flex; gap: 6px; }
    .form-actions button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; padding: 3px 10px; }
    .form-actions button[type=submit] { border-color: var(--accent); }
    .form-actions button:disabled { opacity: 0.4; cursor: default; }
  `,
})
export class ServiceSetDialog {
  readonly closed = output();
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly rejection = signal<Rejection | undefined>(undefined);

  /** Every Service of every Repo, in list order, grouped by Repo. */
  protected readonly repos = computed(() =>
    this.backend
      .repos()
      .filter((repo) => repo.services.some((s) => !s.removedFromConfig))
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        color: repoColor(repo),
        services: repo.services
          .filter((s) => !s.removedFromConfig)
          .map((s) => {
            const ref = { repoId: repo.id, serviceId: s.id };
            return { ref, key: keyOf(ref), name: s.name };
          }),
      })),
  );

  /** Checked Services (keys of their refs); a new Set starts with the running ones. */
  protected readonly selected = signal<ReadonlySet<string>>(
    new Set(
      this.backend
        .repos()
        .flatMap((repo) => repo.services.filter((s) => RUNNING.has(s.status)).map((s) => keyOf({ repoId: repo.id, serviceId: s.id }))),
    ),
  );

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
  }

  protected errorAt(place: RejectionPlace): string | undefined {
    const rejection = this.rejection();
    return rejection?.place === place ? rejection.message : undefined;
  }

  protected toggle(key: string): void {
    this.selected.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.rejection.set(undefined);
    // In list order; Services gone from the list meanwhile are dropped.
    const services = this.repos()
      .flatMap((repo) => repo.services)
      .filter((s) => this.selected().has(s.key))
      .map((s) => s.ref);
    try {
      await this.backend.createServiceSet(this.name(), services);
      this.closed.emit();
    } catch (e) {
      const error = e as UiErrorInfo;
      this.rejection.set({ place: placeOf(error), message: describeError(error), details: error.details });
    } finally {
      this.busy.set(false);
    }
  }
}
