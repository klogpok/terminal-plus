import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ServiceRef, ServiceSetView, ServiceStatus } from '@devpanel/shared';
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
 * The Service Set dialog, for a new Set or one being edited: a name and every Service of every Repo
 * with a checkbox, grouped by Repo; an edited Set can also be deleted (after confirming). The
 * Server checks the values; its refusals are shown next to the field at fault.
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
      <div class="title" id="service-set-dialog-title">
        {{ serviceSet() ? strings.serviceSets.editTitle : strings.serviceSets.newTitle }}
      </div>
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
        @if (missing().length) {
          <fieldset class="not-found" data-not-found>
            <legend>{{ strings.serviceSets.notFoundTitle }}</legend>
            <div class="muted">{{ strings.serviceSets.notFoundHint }}</div>
            @for (entry of missing(); track entry.key) {
              <label class="check">
                <input
                  type="checkbox"
                  [attr.aria-label]="strings.serviceSets.notFoundLabel(entry.repoName, entry.serviceName)"
                  [checked]="selected().has(entry.key)"
                  (change)="toggle(entry.key)"
                />
                {{ strings.serviceSets.serviceLabel(entry.repoName, entry.serviceName) }}
              </label>
            }
          </fieldset>
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
      @if (confirmingDelete() && serviceSet(); as set) {
        <div class="delete-confirm" role="alert">
          <span>{{ strings.serviceSets.deleteConfirm(set.name) }}</span>
          <span class="form-actions">
            <button type="button" class="danger" [disabled]="busy()" (click)="delete(set)">{{ strings.serviceSets.deleteYes }}</button>
            <button type="button" (click)="confirmingDelete.set(false)">{{ strings.serviceSets.deleteNo }}</button>
          </span>
        </div>
      } @else {
        <span class="form-actions">
          <button type="submit" [disabled]="busy()">{{ strings.serviceSets.save }}</button>
          <button type="button" (click)="closed.emit()">{{ strings.serviceSets.cancel }}</button>
          @if (serviceSet()) {
            <button type="button" class="danger delete" (click)="confirmingDelete.set(true)">{{ strings.serviceSets.delete }}</button>
          }
        </span>
      }
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
    fieldset.not-found { border-left-color: var(--error-border); }
    .muted { color: var(--muted); }
    .field-error { color: var(--error-border); font-size: 12px; }
    .form-actions { display: flex; gap: 6px; }
    .form-actions button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; padding: 3px 10px; }
    .form-actions button[type=submit] { border-color: var(--accent); }
    .form-actions button:disabled { opacity: 0.4; cursor: default; }
    .form-actions .delete { margin-left: auto; }
    .form-actions button.danger { border-color: var(--error-border); }
    .delete-confirm { display: flex; flex-direction: column; gap: 6px; }
  `,
})
export class ServiceSetDialog {
  /** The Set being edited; undefined for a new Set. */
  readonly serviceSet = input<ServiceSetView>();
  readonly closed = output();
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly name = linkedSignal(() => this.serviceSet()?.name ?? '');
  protected readonly busy = signal(false);
  protected readonly rejection = signal<Rejection | undefined>(undefined);
  protected readonly confirmingDelete = signal(false);

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

  /**
   * Entries of the edited Set that are not in the list above (not found right now), named as the
   * Set remembers them. Listed separately; they stay in the Set when saved unless unchecked.
   */
  protected readonly missing = computed(() => {
    const listed = new Set(this.repos().flatMap((repo) => repo.services.map((s) => s.key)));
    return (this.serviceSet()?.services ?? [])
      .map((e) => ({ ref: e.ref, key: keyOf(e.ref), repoName: e.repoName, serviceName: e.serviceName }))
      .filter((e) => !listed.has(e.key));
  });

  /**
   * Checked Services (keys of their refs): an edited Set starts with its own entries, a new one with
   * the running Services. Reset only when the edited Set changes, not when a status does.
   */
  protected readonly selected = linkedSignal<ReadonlySet<string>>(() => {
    const set = this.serviceSet();
    if (set) return new Set(set.services.map((e) => keyOf(e.ref)));
    return untracked(
      () =>
        new Set(
          this.backend
            .repos()
            .flatMap((repo) =>
              repo.services.filter((s) => RUNNING.has(s.status)).map((s) => keyOf({ repoId: repo.id, serviceId: s.id })),
            ),
        ),
    );
  });

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
    // In list order, then the edited Set's entries that are not found; Services gone from the list
    // meanwhile are dropped from a new Set.
    const services = [...this.repos().flatMap((repo) => repo.services), ...this.missing()]
      .filter((s) => this.selected().has(s.key))
      .map((s) => s.ref);
    const set = this.serviceSet();
    await this.attempt(() =>
      set ? this.backend.updateServiceSet(set.id, this.name(), services) : this.backend.createServiceSet(this.name(), services),
    );
  }

  protected async delete(set: ServiceSetView): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.rejection.set(undefined);
    this.confirmingDelete.set(false);
    await this.attempt(() => this.backend.deleteServiceSet(set.id));
  }

  /** Runs `change`, then closes; a refusal keeps the dialog open and is shown. */
  private async attempt(change: () => Promise<unknown>): Promise<void> {
    try {
      await change();
      this.closed.emit();
    } catch (e) {
      const error = e as UiErrorInfo;
      this.rejection.set({ place: placeOf(error), message: describeError(error), details: error.details });
    } finally {
      this.busy.set(false);
    }
  }
}
