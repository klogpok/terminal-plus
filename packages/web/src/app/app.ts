import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { ServiceStatus } from '@devpanel/shared';
import { BackendService } from './backend/backend.service';
import { ErrorMessage } from './error-message/error-message';
import { InstallOutput } from './install-output/install-output';
import { RepoList } from './repo-list/repo-list';
import { STRINGS } from './strings';

const LIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);

@Component({
  selector: 'dp-root',
  imports: [RepoList, ErrorMessage, InstallOutput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  /** "Stop all in all Repos" is enabled while any Service has a live process. */
  protected readonly anyStoppable = computed(() =>
    this.backend.repos().some((repo) => repo.services.some((s) => LIVE.has(s.status))),
  );
}
