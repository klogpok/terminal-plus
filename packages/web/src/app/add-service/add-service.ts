import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { NewService, NewServiceField, RepoView, SuggestedService } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { ErrorMessage } from '../error-message/error-message';
import { STRINGS, describeError, type UiErrorInfo } from '../ui-strings';

/** A rejected "Add": the message next to `field`, or above the buttons when no field is to blame. */
interface Rejection {
  field?: NewServiceField;
  message: string;
  details: string;
}

/**
 * "+ Add Service" for a Repo without a Repo Config: an inline form that adds one Service to the
 * Local Config (creating it when the Repo has none yet). The command comes from a detected script
 * not yet in the Local Config, or is typed in.
 */
@Component({
  selector: 'dp-add-service',
  imports: [ErrorMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!open()) {
      <button type="button" class="add-service-button" (click)="open.set(true)">+ {{ strings.editConfig.add }}</button>
    } @else {
      <form class="add-service" (submit)="$event.preventDefault(); submit()">
        <div class="title">{{ strings.editConfig.formTitle }}</div>
        @if (scripts().length) {
          <label>
            <span>{{ strings.editConfig.pickLabel }}</span>
            <select [attr.aria-label]="strings.editConfig.pickLabel" (change)="pick($any($event.target).value)">
              <option value="">{{ strings.editConfig.pickOwn }}</option>
              @for (script of scripts(); track script.id) {
                <option [value]="script.id">{{ strings.config.suggestion(script.name, script.command) }}</option>
              }
            </select>
          </label>
        }
        <label>
          <span>{{ strings.editConfig.nameLabel }}</span>
          <input type="text" [attr.aria-label]="strings.editConfig.nameLabel" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>
        @if (errorFor('name'); as message) {
          <div class="field-error" role="alert" data-field-error="name">{{ message }}</div>
        }
        <label>
          <span>{{ strings.editConfig.commandLabel }}</span>
          <input type="text" [attr.aria-label]="strings.editConfig.commandLabel" [value]="command()" (input)="command.set($any($event.target).value)" />
        </label>
        @if (errorFor('command'); as message) {
          <div class="field-error" role="alert" data-field-error="command">{{ message }}</div>
        }
        <details [open]="moreOpen()">
          <summary>{{ strings.editConfig.more }}</summary>
          <label>
            <span>{{ strings.editConfig.portLabel }}</span>
            <input type="number" min="1" max="65535" [attr.aria-label]="strings.editConfig.portLabel" [value]="port()" (input)="port.set($any($event.target).value)" />
          </label>
          @if (errorFor('port'); as message) {
            <div class="field-error" role="alert" data-field-error="port">{{ message }}</div>
          }
          <label>
            <span>{{ strings.editConfig.urlLabel }}</span>
            <input type="text" [attr.aria-label]="strings.editConfig.urlLabel" placeholder="http://localhost:3000" [value]="url()" (input)="url.set($any($event.target).value)" />
          </label>
          @if (errorFor('url'); as message) {
            <div class="field-error" role="alert" data-field-error="url">{{ message }}</div>
          }
          <label>
            <span>{{ strings.editConfig.readyPatternLabel }}</span>
            <input type="text" [attr.aria-label]="strings.editConfig.readyPatternLabel" [value]="readyPattern()" (input)="readyPattern.set($any($event.target).value)" />
          </label>
          @if (errorFor('readyPattern'); as message) {
            <div class="field-error" role="alert" data-field-error="readyPattern">{{ message }}</div>
          }
          @if (repo().services.length) {
            <fieldset>
              <legend>{{ strings.editConfig.dependsOnLabel }}</legend>
              @for (service of repo().services; track service.id) {
                <label class="check">
                  <input type="checkbox" [value]="service.id" [checked]="dependsOn().has(service.id)" (change)="toggleDependency(service.id)" />
                  {{ service.name }}
                </label>
              }
            </fieldset>
            @if (errorFor('dependsOn'); as message) {
              <div class="field-error" role="alert" data-field-error="dependsOn">{{ message }}</div>
            }
          }
        </details>
        @if (rejection(); as r) {
          @if (!r.field) {
            <dp-error-message [message]="r.message" [details]="r.details" />
          }
        }
        <span class="form-actions">
          <button type="submit" [disabled]="busy() || !name().trim() || !command().trim()">{{ strings.editConfig.submit }}</button>
          <button type="button" (click)="close()">{{ strings.editConfig.cancel }}</button>
        </span>
      </form>
    }
  `,
  styles: `
    :host { display: block; }
    .add-service-button { padding: 3px 10px; border: 1px dashed var(--border); border-radius: 4px; background: transparent; color: var(--fg); cursor: pointer; font-size: 13px; }
    .add-service-button:hover { border-color: var(--accent); }
    .add-service { display: flex; flex-direction: column; gap: 6px; font-size: 13px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
    .title { font-weight: 600; }
    label { display: flex; flex-direction: column; gap: 2px; }
    label.check { flex-direction: row; gap: 6px; align-items: baseline; }
    input[type=text], input[type=number], select { padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); min-width: 0; }
    details { display: flex; flex-direction: column; gap: 6px; }
    details > label, details > fieldset { margin-top: 6px; }
    summary { cursor: pointer; color: var(--muted); }
    fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    legend { padding: 0; margin-bottom: 2px; }
    .field-error { color: var(--error-border); font-size: 12px; }
    .form-actions { display: flex; gap: 6px; }
    .form-actions button { border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; padding: 3px 10px; }
    .form-actions button[type=submit] { border-color: var(--accent); }
    .form-actions button:disabled { opacity: 0.4; cursor: default; }
  `,
})
export class AddService {
  readonly repo = input.required<RepoView>();
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly name = signal('');
  protected readonly command = signal('');
  protected readonly port = signal('');
  protected readonly url = signal('');
  protected readonly readyPattern = signal('');
  protected readonly dependsOn = signal<ReadonlySet<string>>(new Set());
  protected readonly rejection = signal<Rejection | undefined>(undefined);
  /** The "More" section opens by itself when one of its fields was rejected. */
  protected readonly moreOpen = computed(() => {
    const field = this.rejection()?.field;
    return field === 'port' || field === 'url' || field === 'readyPattern' || field === 'dependsOn';
  });

  /** Detected scripts whose command is not used by a Service of the Repo yet. */
  protected readonly scripts = computed<SuggestedService[]>(() => {
    const used = new Set(this.repo().services.filter((s) => !s.removedFromConfig).map((s) => s.command));
    return (this.repo().suggestions ?? []).filter((s) => !used.has(s.command));
  });

  protected errorFor(field: NewServiceField): string | undefined {
    const rejection = this.rejection();
    return rejection?.field === field ? rejection.message : undefined;
  }

  protected pick(id: string): void {
    const script = this.scripts().find((s) => s.id === id);
    this.name.set(script?.name ?? '');
    this.command.set(script?.command ?? '');
  }

  protected toggleDependency(id: string): void {
    this.dependsOn.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.rejection.set(undefined);
    try {
      await this.backend.addLocalService(this.repo().id, this.service());
      this.close();
    } catch (e) {
      const error = e as UiErrorInfo;
      const field = error.code === 'serviceInvalid' ? error.params.field : undefined;
      this.rejection.set({ ...(field && { field }), message: describeError(error), details: error.details });
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.open.set(false);
    for (const field of [this.name, this.command, this.port, this.url, this.readyPattern]) field.set('');
    this.dependsOn.set(new Set());
    this.rejection.set(undefined);
  }

  /** The form values; empty optional fields are left out. */
  private service(): NewService {
    const port = this.port().trim();
    const url = this.url().trim();
    const readyPattern = this.readyPattern();
    // Services removed meanwhile are dropped, so a stale tick does not block the add.
    const dependsOn = this.repo()
      .services.map((s) => s.id)
      .filter((id) => this.dependsOn().has(id));
    return {
      name: this.name(),
      command: this.command(),
      ...(port && { port: Number(port) }),
      ...(url && { url }),
      ...(readyPattern && { readyPattern }),
      ...(dependsOn.length && { dependsOn }),
    };
  }
}
