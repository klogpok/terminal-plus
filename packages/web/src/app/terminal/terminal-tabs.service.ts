import { Injectable, signal } from '@angular/core';
import type { ServiceRef } from '@devpanel/shared';

const STORAGE_KEY = 'devpanel.terminalTabs';

interface StoredTabs {
  tabs: ServiceRef[];
  active: string | null;
}

/** Stable key of a tab. */
export function tabKey(ref: ServiceRef): string {
  return `${ref.repoId}/${ref.serviceId}`;
}

/** Key of a Repo's `pnpm install` tab (those tabs live in `BackendService.installTabs`). */
export function installTabKey(repoId: string): string {
  return `install:${repoId}`;
}

/**
 * Which Service terminal tabs are open in this browser tab, and which one is shown. Remembered in
 * localStorage so a page reload reopens them (a per-viewer convenience; the output itself lives on
 * the Server).
 */
@Injectable({ providedIn: 'root' })
export class TerminalTabs {
  private readonly stored = load();
  private readonly tabsState = signal<ServiceRef[]>(this.stored.tabs);
  private readonly activeState = signal<string | null>(this.stored.active);

  readonly tabs = this.tabsState.asReadonly();
  /** Key (`tabKey`) of the shown tab. */
  readonly active = this.activeState.asReadonly();

  /** Opens the Service's tab (or shows it if already open). */
  open(ref: ServiceRef): void {
    const key = tabKey(ref);
    if (!this.tabsState().some((t) => tabKey(t) === key)) {
      this.tabsState.update((tabs) => [...tabs, { repoId: ref.repoId, serviceId: ref.serviceId }]);
    }
    this.activeState.set(key);
    this.save();
  }

  /** Shows the tab with this key (`tabKey` or `installTabKey`). */
  selectKey(key: string): void {
    this.activeState.set(key);
    this.save();
  }

  close(ref: ServiceRef): void {
    const key = tabKey(ref);
    const tabs = this.tabsState();
    const index = tabs.findIndex((t) => tabKey(t) === key);
    if (index === -1) return;
    const rest = tabs.filter((_, i) => i !== index);
    this.tabsState.set(rest);
    if (this.activeState() === key) {
      const next = rest[Math.min(index, rest.length - 1)];
      this.activeState.set(next ? tabKey(next) : null);
    }
    this.save();
  }

  private save(): void {
    try {
      const value: StoredTabs = { tabs: this.tabsState(), active: this.activeState() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* storage unavailable: tabs just are not remembered */
    }
  }
}

function load(): StoredTabs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], active: null };
    const parsed = JSON.parse(raw) as Partial<StoredTabs>;
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter(
          (t): t is ServiceRef => typeof t?.repoId === 'string' && typeof t?.serviceId === 'string',
        )
      : [];
    return { tabs, active: typeof parsed.active === 'string' ? parsed.active : null };
  } catch {
    return { tabs: [], active: null };
  }
}
