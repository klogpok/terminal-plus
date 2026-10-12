import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { BackendService } from '../backend/backend.service';

const STORAGE_KEY = 'devpanel.collapsedRepos';

/**
 * Which Repo cards this viewer has collapsed. Remembered in localStorage (a per-viewer
 * convenience); unavailable storage means nothing is remembered. A Repo not in the set, such as a
 * newly added one, is expanded.
 */
@Injectable({ providedIn: 'root' })
export class CollapsedRepos {
  private readonly backend = inject(BackendService);
  private readonly ids = signal<ReadonlySet<string>>(load());

  constructor() {
    this.backend.on('repoChanged', ({ repoId, repo }) => {
      if (!repo && this.ids().has(repoId)) this.set(new Set([...this.ids()].filter((id) => id !== repoId)));
    });
    // Once the Workspace is known (no Repos yet means the snapshot has not arrived), forget Repos
    // removed while this page was closed or from another window.
    effect(() => {
      const known = new Set(this.backend.repos().map((r) => r.id));
      const ids = untracked(this.ids);
      if (known.size > 0 && [...ids].some((id) => !known.has(id))) untracked(() => this.set(new Set(ids)));
    });
  }

  isCollapsed(repoId: string): boolean {
    return this.ids().has(repoId);
  }

  toggle(repoId: string): void {
    const next = new Set(this.ids());
    if (!next.delete(repoId)) next.add(repoId);
    this.set(next);
  }

  /** "Collapse all" / "Expand all" over the Repos of the Workspace. */
  setAll(collapsed: boolean): void {
    this.set(new Set(collapsed ? this.backend.repos().map((r) => r.id) : []));
  }

  private set(ids: Set<string>): void {
    // Ids of Repos no longer in the Workspace are dropped on every change.
    const known = new Set(this.backend.repos().map((r) => r.id));
    const kept = new Set([...ids].filter((id) => known.has(id)));
    this.ids.set(kept);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...kept]));
    } catch {
      /* storage unavailable: collapsed Repos just are not remembered */
    }
  }
}

function load(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}
