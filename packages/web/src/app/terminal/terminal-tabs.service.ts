import { Injectable, signal } from '@angular/core';
import type { RepoView, ServiceRef } from '@devpanel/shared';

const STORAGE_KEY = 'devpanel.terminalTabs';

interface StoredTabs {
  tabs: ServiceRef[];
  active: string | null;
  /** Keys of the tabs in strip order, as the user arranged them. */
  order: string[];
}

/** Stable key of a tab. */
export function tabKey(ref: ServiceRef): string {
  return `${ref.repoId}/${ref.serviceId}`;
}

/** Key of a Repo's `pnpm install` tab (those tabs live in `BackendService.installTabs`). */
export function installTabKey(repoId: string): string {
  return `install:${repoId}`;
}

/** Key of a Session's tab (those tabs live in `BackendService.sessions`). */
export function sessionTabKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Keys of the tabs on screen, in strip order (see `arrangeTabKeys`): the open Service tabs whose
 * Service exists in the current state, the Sessions and the `pnpm install` runs.
 */
export function openTabKeys(
  order: readonly string[],
  refs: readonly ServiceRef[],
  repos: readonly RepoView[],
  sessions: readonly { id: string }[],
  installs: readonly { repoId: string }[],
): string[] {
  const services = refs.filter((ref) =>
    repos.some((r) => r.id === ref.repoId && r.services.some((s) => s.id === ref.serviceId)),
  );
  return arrangeTabKeys(order, [
    ...services.map(tabKey),
    ...sessions.map((s) => sessionTabKey(s.id)),
    ...installs.map((i) => installTabKey(i.repoId)),
  ]);
}

/** `keys` in strip order: those in `order` as placed there, then the others as given. */
export function arrangeTabKeys<K extends string>(order: readonly string[], keys: readonly K[]): K[] {
  const rank = new Map(order.map((key, i) => [key, i]));
  const rankOf = (key: string) => rank.get(key) ?? order.length;
  // Array sort is stable: keys not in `order` (equal rank) keep their relative order.
  return [...keys].sort((a, b) => rankOf(a) - rankOf(b));
}

/** The shown tab among `openKeys`: the selected one, or the first. */
export function shownTabKey(openKeys: readonly string[], active: string | null): string | null {
  return active !== null && openKeys.includes(active) ? active : (openKeys[0] ?? null);
}

/**
 * Which Service terminal tabs are open in this browser tab, which one is shown, and the strip order
 * of all tabs (Service, Session and install). Remembered in
 * localStorage so a page reload reopens them (a per-viewer convenience; the output itself lives on
 * the Server).
 */
@Injectable({ providedIn: 'root' })
export class TerminalTabs {
  private readonly stored = load();
  private readonly tabsState = signal<ServiceRef[]>(this.stored.tabs);
  private readonly activeState = signal<string | null>(this.stored.active);
  private readonly orderState = signal<string[]>(this.stored.order);

  readonly tabs = this.tabsState.asReadonly();
  /** Key (`tabKey`) of the shown tab. */
  readonly active = this.activeState.asReadonly();
  /** Tab keys in strip order; a tab not listed yet goes at the end (see `remember`). */
  readonly order = this.orderState.asReadonly();

  /** Opens the Service's tab (or shows it if already open). */
  open(ref: ServiceRef): void {
    this.add(ref);
    this.selectKey(tabKey(ref));
  }

  /**
   * Adds the Service's tab behind `shown` (the tab on screen, or null for none), which stays on
   * screen; with none shown, the added tab is shown. An open tab is left as it is, and so is the
   * remembered choice: the new tab goes at the end of the strip, so it never takes the place of
   * `shown`.
   */
  addBehind(ref: ServiceRef, shown: string | null): void {
    if (this.add(ref) && shown === null) this.selectKey(tabKey(ref));
  }

  /** Adds the Service's tab without showing it; false when it was already open. */
  private add(ref: ServiceRef): boolean {
    const key = tabKey(ref);
    if (this.tabsState().some((t) => tabKey(t) === key)) return false;
    this.tabsState.update((tabs) => [...tabs, { repoId: ref.repoId, serviceId: ref.serviceId }]);
    this.save();
    return true;
  }

  /** Shows the tab with this key (`tabKey` or `installTabKey`). */
  selectKey(key: string): void {
    this.activeState.set(key);
    this.save();
  }

  /**
   * Puts the tabs not placed yet at the end of the strip order and forgets the places of Session
   * and install tabs that are gone. `openKeys` are the tabs on screen, in strip order; call it only
   * with the Server's state loaded, or the Sessions would look gone.
   */
  remember(openKeys: readonly string[]): void {
    const order = this.orderState();
    const open = new Set(openKeys);
    // A Service tab hidden while its Service is missing keeps its place.
    const serviceKeys = new Set(this.tabsState().map(tabKey));
    const kept = order.filter((key) => open.has(key) || serviceKeys.has(key));
    const placed = new Set(kept);
    const next = [...kept, ...openKeys.filter((key) => !placed.has(key))];
    if (next.length === order.length && next.every((key, i) => key === order[i])) return;
    this.orderState.set(next);
    this.save();
  }

  /** Puts the tab `key` in the place of the tab `target`, shifting the tabs in between. */
  move(key: string, target: string): void {
    const order = this.orderState();
    const from = order.indexOf(key);
    const to = order.indexOf(target);
    if (from === -1 || to === -1 || from === to) return;
    const next = order.filter((k) => k !== key);
    next.splice(to, 0, key);
    this.orderState.set(next);
    this.save();
  }

  close(ref: ServiceRef): void {
    const key = tabKey(ref);
    const tabs = this.tabsState();
    const index = tabs.findIndex((t) => tabKey(t) === key);
    if (index === -1) return;
    const rest = tabs.filter((_, i) => i !== index);
    this.tabsState.set(rest);
    this.orderState.update((order) => order.filter((k) => k !== key));
    if (this.activeState() === key) {
      const next = rest[Math.min(index, rest.length - 1)];
      this.activeState.set(next ? tabKey(next) : null);
    }
    this.save();
  }

  private save(): void {
    try {
      const value: StoredTabs = { tabs: this.tabsState(), active: this.activeState(), order: this.orderState() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* storage unavailable: tabs just are not remembered */
    }
  }
}

function load(): StoredTabs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], active: null, order: [] };
    const parsed = JSON.parse(raw) as Partial<StoredTabs>;
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter(
          (t): t is ServiceRef => typeof t?.repoId === 'string' && typeof t?.serviceId === 'string',
        )
      : [];
    const order = Array.isArray(parsed.order) ? parsed.order.filter((k): k is string => typeof k === 'string') : [];
    return { tabs, active: typeof parsed.active === 'string' ? parsed.active : null, order };
  } catch {
    return { tabs: [], active: null, order: [] };
  }
}
