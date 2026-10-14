import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import type { ServiceSetView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { STRINGS } from '../ui-strings';
import { ServiceSetDialog } from './service-set-dialog';

/**
 * The "Service Sets" menu in the header: one entry per Service Set (a click starts it) with an edit
 * action next to it, and "New Service Set…"; edit and New open the Service Set dialog. Keyboard:
 * arrows move between entries, Escape closes.
 */
@Component({
  selector: 'dp-service-sets-menu',
  imports: [ServiceSetDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="service-sets-trigger"
      aria-haspopup="menu"
      [attr.aria-expanded]="menuOpen()"
      [attr.aria-label]="strings.serviceSets.menu"
      (click)="toggleMenu()"
    >{{ strings.serviceSets.menu }} <span aria-hidden="true">▾</span></button>
    @if (menuOpen()) {
      <div
        #menu
        class="service-sets-menu"
        role="menu"
        [attr.aria-label]="strings.serviceSets.menu"
        (keydown.escape)="closeMenu(true)"
        (keydown.arrowdown)="$event.preventDefault(); moveFocus(1)"
        (keydown.arrowup)="$event.preventDefault(); moveFocus(-1)"
      >
        @for (set of backend.serviceSets(); track set.id) {
          <div class="row" role="none">
            <button
              type="button"
              role="menuitem"
              class="service-set"
              [attr.data-service-set-id]="set.id"
              (click)="start(set.id)"
            >{{ set.name }}</button>
            <button
              type="button"
              role="menuitem"
              class="edit"
              [attr.aria-label]="strings.serviceSets.edit(set.name)"
              [title]="strings.serviceSets.edit(set.name)"
              (click)="openEditDialog(set)"
            ><span aria-hidden="true">✎</span></button>
          </div>
        } @empty {
          <div class="none" role="none">{{ strings.serviceSets.none }}</div>
        }
        <div class="separator" role="separator"></div>
        <button type="button" role="menuitem" class="create" (click)="openNewDialog()">{{ strings.serviceSets.create }}</button>
      </div>
    }
    @if (dialogOpen()) {
      <dp-service-set-dialog [serviceSet]="editing()" (closed)="closeDialog()" />
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .service-sets-trigger { display: inline-flex; align-items: center; gap: 4px; line-height: 1; height: 26px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 12px; padding: 0 10px; }
    .service-sets-trigger:hover, .service-sets-trigger[aria-expanded=true] { border-color: var(--accent); }
    .service-sets-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; display: flex; flex-direction: column; min-width: 200px; max-width: min(320px, calc(100vw - 32px)); padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
    .service-sets-menu button { text-align: left; border: 0; border-radius: 4px; background: transparent; color: var(--fg); cursor: pointer; font-size: 13px; padding: 6px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .service-sets-menu button:hover, .service-sets-menu button:focus-visible { background: var(--bg); outline: none; box-shadow: inset 0 0 0 1px var(--accent); }
    .none { color: var(--muted); font-size: 12px; padding: 6px 10px; }
    .row { display: flex; align-items: stretch; gap: 2px; }
    .row .service-set { flex: 1; min-width: 0; }
    .service-sets-menu .row .edit { flex: none; padding: 6px 8px; color: var(--muted); }
    .service-sets-menu .row .edit:hover, .service-sets-menu .row .edit:focus-visible { color: var(--fg); }
    .separator { height: 1px; margin: 4px 0; background: var(--border); }
  `,
})
export class ServiceSetsMenu {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly menuOpen = signal(false);
  protected readonly dialogOpen = signal(false);
  /** The Set the dialog edits; undefined for a new Set. */
  protected readonly editing = signal<ServiceSetView | undefined>(undefined);

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(false);
      return;
    }
    this.menuOpen.set(true);
    // The menu renders on the next change detection; focus its first entry then.
    afterNextRender(() => this.menuItems()[0]?.focus(), { injector: this.injector });
  }

  protected closeMenu(restoreFocus: boolean): void {
    this.menuOpen.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  protected moveFocus(step: number): void {
    const items = this.menuItems();
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + step + items.length) % items.length]!.focus();
  }

  protected start(id: string): void {
    this.closeMenu(true);
    this.backend.startServiceSet(id);
  }

  protected openNewDialog(): void {
    this.editing.set(undefined);
    this.menuOpen.set(false);
    this.dialogOpen.set(true);
  }

  protected openEditDialog(set: ServiceSetView): void {
    this.editing.set(set);
    this.menuOpen.set(false);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
    this.trigger().nativeElement.focus();
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  private menuItems(): HTMLElement[] {
    return [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
  }
}
