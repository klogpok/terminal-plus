/**
 * Port conflicts of Services: checked before a start and after a Stop, classified by owner (one
 * of our Services, an Orphan, or a foreign process), and resolved by freeing the port.
 */
import { setTimeout as delay } from 'node:timers/promises';
import {
  DevPanelError,
  type Orphan,
  type PortConflict,
  type PortConflictChangedEvent,
  type PortOwner,
} from '@devpanel/shared';
import { matches, type PidRecord } from './pid-file.js';
import { ancestry, findPortListeners, listProcesses, type ProcessInfo } from './ports.js';
import { killTree } from './process.js';
import type { RepoState, ServiceState } from './state.js';

/** How often port occupancy is re-checked while waiting for a port to become free. */
const PORT_POLL_MS = 200;
/** After a Stop, how long the port may take to be released before its owner is reported. */
const PORT_RELEASE_AFTER_STOP_MS = 1_000;

/** What port conflict handling needs from `core`. */
export interface PortConflictHost {
  repos(): Iterable<RepoState>;
  /** Orphans not killed yet, with their PID file records. */
  orphans(): readonly { orphan: Orphan; records: PidRecord[] }[];
  stopService(repoId: string, serviceId: string): Promise<void>;
  killOrphans(ids: string[]): Promise<void>;
  emit(event: 'portConflictChanged', payload: PortConflictChangedEvent): boolean;
}

/** Technical (English) description of a port owner for error details. */
function describeOwner(owner: PortOwner): string {
  switch (owner.kind) {
    case 'service':
      return `Service "${owner.serviceName}" of Repo "${owner.repoName}"`;
    case 'process':
      return owner.processName;
    case 'orphan':
      return `Orphan of ${describeProcessOwner(owner.orphan)} (left over from the previous run)`;
  }
}

/** Technical (English) description of what an Orphan belonged to. */
function describeProcessOwner({ owner, repoName }: Orphan): string {
  return owner.kind === 'service'
    ? `Service "${owner.serviceName}" of Repo "${repoName}"`
    : `${owner.sessionKind} Session of Repo "${repoName}"`;
}

export class PortConflicts {
  constructor(
    private readonly host: PortConflictHost,
    private readonly portFreeTimeoutMs: number,
  ) {}

  /**
   * Before a start: when the Service's port is held (on any address), records the conflict and
   * fails with `portTaken` instead of spawning.
   */
  async ensureFree(repo: RepoState, service: ServiceState): Promise<void> {
    const { port } = service.definition;
    if (port === undefined) return;
    const owner = await this.findOwner(port);
    if (!owner) {
      this.set(repo, service, undefined);
      return;
    }
    this.set(repo, service, { port, owner, reason: 'start' });
    throw new DevPanelError(
      'portTaken',
      { repoName: repo.name, serviceName: service.name, port, owner },
      `Port ${port} is listened on by PID ${owner.pid} (${describeOwner(owner)}); "${service.name}" was not started`,
    );
  }

  /** After a Stop: confirms the Service's port was released; otherwise records who still holds it. */
  async checkReleased(repo: RepoState, service: ServiceState): Promise<void> {
    const { port } = service.definition;
    if (port === undefined) return;
    try {
      if (await this.waitFree(port, PORT_RELEASE_AFTER_STOP_MS)) {
        this.set(repo, service, undefined);
        return;
      }
      const owner = await this.findOwner(port);
      this.set(repo, service, owner && { port, owner, reason: 'stop' });
    } catch {
      // netstat failed: the next start checks the port again.
    }
  }

  /**
   * Frees the Service's port: stops the DevPanel Service that holds it, or kills the foreign process
   * (with its tree). Waits until the port is free and clears the conflict. Returns whether the
   * Service should be started now (not when the conflict came from a Stop). The owner is looked up
   * afresh, so a stale conflict never kills the wrong process.
   */
  async resolve(repo: RepoState, service: ServiceState): Promise<boolean> {
    const startAfter = service.portConflict?.reason !== 'stop';
    const { port } = service.definition;
    if (port !== undefined) {
      const owner = await this.findOwner(port);
      if (owner) await this.freeFrom(owner);
      if (!(await this.waitFree(port, this.portFreeTimeoutMs))) {
        throw new DevPanelError(
          'portNotFreed',
          { repoName: repo.name, serviceName: service.name, port },
          `Port ${port} was still listened on ${this.portFreeTimeoutMs} ms after freeing it from ${owner ? describeOwner(owner) : 'nobody'}`,
        );
      }
    }
    this.set(repo, service, undefined);
    return startAfter;
  }

  /** Stops our Service or kills the foreign process holding a port. */
  private async freeFrom(owner: PortOwner): Promise<void> {
    switch (owner.kind) {
      case 'service':
        await this.host.stopService(owner.repoId, owner.serviceId);
        return;
      case 'process':
        // Never kill the DevPanel Server itself.
        if (owner.pid === process.pid) return;
        await killTree(owner.pid);
        return;
      case 'orphan':
        // Verifies PID and creation time again before killing.
        await this.host.killOrphans([owner.orphan.id]);
        return;
    }
  }

  /** Polls until nothing listens on `port`; false if it is still taken after `timeoutMs`. */
  private async waitFree(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((await findPortListeners(port)).length === 0) return true;
      if (Date.now() >= deadline) return false;
      await delay(PORT_POLL_MS);
    }
  }

  /**
   * Who listens on `port`, or undefined when it is free. A listener whose process descends from one
   * of our live Services is that Service; one that is (or descends from) an Orphan is that Orphan;
   * anything else is a foreign process.
   */
  private async findOwner(port: number): Promise<PortOwner | undefined> {
    const listeners = await findPortListeners(port);
    if (listeners.length === 0) return undefined;
    let processes: Map<number, ProcessInfo>;
    try {
      processes = await listProcesses();
    } catch {
      processes = new Map();
    }
    const servicesByPid = new Map<number, { repo: RepoState; service: ServiceState }>();
    for (const repo of this.host.repos()) {
      for (const service of repo.services.values()) {
        // A Service not started yet (PID 0) holds no port; PID 0 would match every ancestry.
        if (service.process?.pid) servicesByPid.set(service.process.pid, { repo, service });
      }
    }
    for (const { pid } of listeners) {
      for (const ancestor of ancestry(pid, processes)) {
        const ours = servicesByPid.get(ancestor);
        if (!ours) continue;
        return {
          kind: 'service',
          pid,
          repoId: ours.repo.id,
          repoName: ours.repo.name,
          serviceId: ours.service.definition.id,
          serviceName: ours.service.name,
        };
      }
    }
    for (const { pid } of listeners) {
      for (const ancestor of ancestry(pid, processes)) {
        const left = this.host
          .orphans()
          .find(({ records }) => records.some((r) => r.pid === ancestor && matches(r, processes)));
        if (left) return { kind: 'orphan', pid, orphan: left.orphan };
      }
    }
    const { pid } = listeners[0]!;
    return { kind: 'process', pid, processName: processes.get(pid)?.name ?? `PID ${pid}` };
  }

  private set(repo: RepoState, service: ServiceState, conflict: PortConflict | undefined): void {
    if (JSON.stringify(service.portConflict) === JSON.stringify(conflict)) return;
    service.portConflict = conflict;
    this.host.emit('portConflictChanged', {
      repoId: repo.id,
      serviceId: service.definition.id,
      ...(conflict && { portConflict: conflict }),
    });
  }
}
