import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { RepoView, ServiceStatus, ServiceView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { AddRepo } from '../add-repo/add-repo';
import { AddService } from '../add-service/add-service';
import { ConfigSuggestions } from '../config-suggestions/config-suggestions';
import { ErrorMessage } from '../error-message/error-message';
import { PortConflictBlock } from '../port-conflict/port-conflict';
import { RemoveService, removalNeedsConfirmation } from '../remove-service/remove-service';
import { RepoHeader } from '../repo-header/repo-header';
import { repoColor } from '../repo-color';
import { ServiceExit } from '../service-exit/service-exit';
import { STRINGS, describeError } from '../ui-strings';
import { TerminalTabs } from '../terminal/terminal-tabs.service';

/** Statuses in which the Service has a live process. */
const ACTIVE: ReadonlySet<ServiceStatus> = new Set(['starting', 'running', 'unhealthy']);
const STARTABLE: ReadonlySet<ServiceStatus> = new Set(['stopped', 'crashed', 'exited']);

/** Left panel: Repos with their Services, status dots, and ▶ ■ ⟳. */
@Component({
  selector: 'dp-repo-list',
  imports: [ErrorMessage, ConfigSuggestions, PortConflictBlock, ServiceExit, AddRepo, AddService, RemoveService, RepoHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './repo-list.html',
  styleUrl: './repo-list.css',
})
export class RepoList {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  protected readonly tabs = inject(TerminalTabs);
  /** The Service whose "Remove" confirmation is open, as `repoId/serviceId`. */
  protected readonly confirmingRemoval = signal<string | undefined>(undefined);

  protected canStart(status: ServiceStatus): boolean {
    return STARTABLE.has(status);
  }

  protected canStop(service: ServiceView): boolean {
    // A start waiting for its dependencies is still `stopped`; ■ cancels it.
    return ACTIVE.has(service.status) || service.waitingFor !== undefined;
  }

  protected canRestart(status: ServiceStatus): boolean {
    return ACTIVE.has(status);
  }

  protected readonly repoColor = repoColor;

  /** Without a Repo Config the user edits the Local Config: "+ Add Service" and "Remove". */
  protected editsLocalConfig(repo: RepoView): boolean {
    return repo.configSource !== 'repo';
  }

  protected removalKey(repo: RepoView, service: ServiceView): string {
    return `${repo.id}/${service.id}`;
  }

  protected askRemove(repo: RepoView, service: ServiceView): void {
    if (removalNeedsConfirmation(repo, service)) this.confirmingRemoval.set(this.removalKey(repo, service));
    else this.backend.removeLocalService(repo.id, service.id);
  }

  protected configErrorMessage(repo: RepoView): string {
    // With Services still listed, the last valid config keeps working.
    if (repo.services.length > 0) return this.strings.config.invalidKeepsPrevious(repo.name);
    return describeError({ code: 'configInvalid', params: { repoName: repo.name }, details: repo.configError ?? '' });
  }
}
