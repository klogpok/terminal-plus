import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import type { RepoView, SuggestedService } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../strings';

/**
 * For a Repo without any config: the auto-detected Services with checkboxes and "Save config",
 * which stores the ticked ones as the Repo's Local Config.
 */
@Component({
  selector: 'dp-config-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (suggestions().length === 0) {
      <p class="muted">{{ strings.config.nothingDetected }}</p>
    } @else {
      <p class="muted">{{ strings.config.suggestionsIntro }}</p>
      <ul class="suggestions">
        @for (suggestion of suggestions(); track suggestion.id) {
          <li>
            <label>
              <input type="checkbox" [checked]="selected().has(suggestion.id)" (change)="toggle(suggestion.id)" />
              {{ strings.config.suggestion(suggestion.name, suggestion.command) }}
            </label>
          </li>
        }
      </ul>
      <button type="button" class="save" [disabled]="selected().size === 0" (click)="save()">{{ strings.config.save }}</button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .muted { color: var(--muted); font-size: 13px; margin: 0; }
    .suggestions { list-style: none; margin: 0; padding: 0; font-size: 13px; }
    .suggestions li { padding: 2px 0; }
    label { display: flex; gap: 6px; align-items: baseline; cursor: pointer; word-break: break-word; }
    .save { align-self: flex-start; border: 1px solid var(--accent); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; padding: 3px 10px; }
    .save:disabled { opacity: 0.4; cursor: default; }
  `,
})
export class ConfigSuggestions {
  readonly repo = input.required<RepoView>();
  private readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;

  protected readonly suggestions = computed<SuggestedService[]>(() => this.repo().suggestions ?? []);
  /** Ticked suggestion ids; reset to the preselected ones whenever the suggestions change. */
  protected readonly selected = linkedSignal(
    () => new Set(this.suggestions().filter((s) => s.preselected).map((s) => s.id)),
  );

  protected toggle(id: string): void {
    this.selected.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected save(): void {
    const services = this.suggestions()
      .filter((s) => this.selected().has(s.id))
      .map(({ id, name, command, cwd }) => ({ id, name, command, ...(cwd !== undefined && { cwd }) }));
    this.backend.saveLocalConfig(this.repo().id, services);
  }
}
