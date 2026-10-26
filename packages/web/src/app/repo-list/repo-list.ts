import { CdkDrag, CdkDragPlaceholder, CdkDragPreview, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { RepoView, ServiceStatus, ServiceView } from '@devpanel/shared';
import { BackendService } from '../backend/backend.service';
import { AddRepo } from '../add-repo/add-repo';
import { AddService } from '../add-service/add-service';
import { CollapsedRepos } from './collapsed-repos.service';
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

/** Left panel: Repos with their Services, status dots, and ▶ ■ ⟳; a collapsed Repo shows only its dots. */
@Component({
  selector: 'dp-repo-list',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragPreview,
    CdkDragPlaceholder,
    ErrorMessage,
    ConfigSuggestions,
    PortConflictBlock,
    ServiceExit,
    AddRepo,
    AddService,
    RemoveService,
    RepoHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './repo-list.html',
  styleUrl: './repo-list.css',
})
export class RepoList {
  protected readonly backend = inject(BackendService);
  protected readonly strings = STRINGS;
  protected readonly tabs = inject(TerminalTabs);
  protected readonly collapsedRepos = inject(CollapsedRepos);
  /** Every Repo is collapsed: the panel title offers "Expand all" instead of "Collapse all". */
  protected readonly allCollapsed = computed(() => this.backend.repos().every((r) => this.collapsedRepos.isCollapsed(r.id)));
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

  /** Why a collapsed Repo needs attention (❗), one tooltip line per reason; empty: nothing to see. */
  protected attention(repo: RepoView): string[] {
    const text = this.strings.repos.attention;
    return [
      ...(repo.folderMissing ? [text.folderMissing] : []),
      ...(repo.configError ? [text.configError] : []),
      ...repo.services.flatMap((s) => [
        ...(s.status === 'crashed' ? [text.crashed(s.name)] : []),
        ...(s.status === 'unhealthy' ? [text.unhealthy(s.name)] : []),
        ...(s.portConflict ? [text.portConflict(s.name, s.portConflict.port)] : []),
        ...(s.buildError ? [text.buildError(s.name)] : []),
      ]),
    ];
  }

  /** The status dot: its Status, or the Build Error look on top of it. */
  protected dotClass(service: ServiceView): string {
    return `status-dot status-${service.status}${service.buildError ? ' status-build-error' : ''}`;
  }

  /** What the status dot says: its Status, or the Build Error in its place. */
  protected dotLabel(service: ServiceView): string {
    return service.buildError ? this.strings.repos.buildError : this.strings.status[service.status];
  }

  /** The ❗ tooltip: one line per reason. */
  protected attentionTitle(reasons: string[]): string {
    return reasons.join('\n');
  }

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

  /** A card was dragged by its handle to a new place in the list. */
  protected drop(event: CdkDragDrop<unknown>): void {
    const repo = this.backend.repos()[event.previousIndex];
    if (repo) this.backend.moveRepo(repo.id, event.currentIndex);
  }

  protected configErrorMessage(repo: RepoView): string {
    // With Services still listed, the last valid config keeps working.
    if (repo.services.length > 0) return this.strings.config.invalidKeepsPrevious(repo.name);
    return describeError({ code: 'configInvalid', params: { repoName: repo.name }, details: repo.configError ?? '' });
  }
}
