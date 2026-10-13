import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { UI_LANGUAGES, type UiLanguage } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { THEMES, ThemeService, type Theme } from '../theme';
import { STRINGS, loadedUiLanguage } from '../ui-strings';

/**
 * The gear button in the header and the Settings panel it opens, holding every setting in one
 * place. The panel closes on Escape, a click outside, or the gear again.
 */
@Component({
  selector: 'dp-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  host: {
    '(document:click)': 'closeOnClickOutside($event)',
    '(document:keydown.escape)': 'closeOnEscape()',
  },
})
export class Settings {
  private readonly backend = inject(BackendService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly gear = viewChild.required<ElementRef<HTMLButtonElement>>('gear');
  protected readonly strings = STRINGS;
  protected readonly open = signal(false);
  /** The UI Languages offered, and the one this page is shown in. */
  protected readonly uiLanguages = UI_LANGUAGES;
  protected readonly activeUiLanguage = loadedUiLanguage();
  /** The Themes offered; the icon stands for each, its name is the tooltip. */
  protected readonly themes = THEMES;
  protected readonly themeIcons: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };
  protected readonly theme = inject(ThemeService);

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /** Asks the Server to switch every tab to `language`; the tabs reload on `uiLanguageChanged`. */
  protected chooseUiLanguage(language: UiLanguage): void {
    if (language !== this.activeUiLanguage) this.backend.setUiLanguage(language);
  }

  protected closeOnClickOutside(event: MouseEvent): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement)) this.open.set(false);
  }

  /** Focus inside the panel would vanish with it, so it goes back to the gear. */
  protected closeOnEscape(): void {
    if (!this.open()) return;
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.open.set(false);
    if (hadFocus) this.gear().nativeElement.focus();
  }
}
