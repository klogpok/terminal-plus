import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { RepoView, ServiceStatus } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { AddRepo } from '../add-repo/add-repo';
import { ConfigSuggestions } from '../config-suggestions/config-suggestions';
import { ErrorMessage } from '../error-message/error-message';
import { RepoHeader } from '../repo-header/repo-header';
import { repoColor } from '../repo-color';
import { ServiceExit } from '../service-exit/service-exit';
import { STRINGS, describeError } from '../strings';
import { TerminalTabs } from '../terminal/terminal-tabs.service';

/** Statuses in which the Service has a live process. */
const ACTIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);
const STARTABLE: ReadonlySet<ServiceStatus> = new Set(['stopped', 'crashed', 'exited']);

/** Left panel: Repos with their Services, status dots, and ▶ ■ ⟳. */
@Component({
  selector: 'dp-repo-list',
  imports: [ErrorMessage, ConfigSuggestions, ServiceExit, AddRepo, RepoHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './repo-list.html',
  styleUrl: './repo-list.css',
})
export class RepoList {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  protected readonly tabs = inject(TerminalTabs);

  protected canStart(status: ServiceStatus): boolean {
    return STARTABLE.has(status);
  }

  protected canStop(status: ServiceStatus): boolean {
    return ACTIVE.has(status);
  }

  protected readonly repoColor = repoColor;

  protected configErrorMessage(repo: RepoView): string {
    // With Services still listed, the last valid config keeps working.
    if (repo.services.length > 0) return this.strings.config.invalidKeepsPrevious(repo.name);
    return describeError({ code: 'configInvalid', params: { repoName: repo.name }, details: repo.configError ?? '' });
  }
}
