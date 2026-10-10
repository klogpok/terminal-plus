import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { RepoView, ServiceStatus } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { ErrorMessage } from '../error-message/error-message';
import { STRINGS, describeError } from '../strings';

/** Statuses in which the Service has a live process. */
const ACTIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);
const STARTABLE: ReadonlySet<ServiceStatus> = new Set(['stopped', 'crashed', 'exited']);

/** Fallback stripe colors for Repos without a stored color (ticket 08 assigns real ones). */
const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16'];

/** Left panel: Repos with their Services, status dots, and ▶ ■ ⟳. */
@Component({
  selector: 'dp-repo-list',
  imports: [ErrorMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './repo-list.html',
  styleUrl: './repo-list.css',
})
export class RepoList {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;

  protected canStart(status: ServiceStatus): boolean {
    return STARTABLE.has(status);
  }

  protected canStop(status: ServiceStatus): boolean {
    return ACTIVE.has(status);
  }

  protected repoColor(repo: RepoView): string {
    if (repo.color) return repo.color;
    let hash = 0;
    for (const ch of repo.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[hash % PALETTE.length]!;
  }

  protected configErrorMessage(repo: RepoView): string {
    return describeError({ code: 'configInvalid', params: { repoName: repo.name }, details: repo.configError ?? '' });
  }
}
