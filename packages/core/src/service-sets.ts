/**
 * Service Sets: named lists of Services from any Repos, stored only on this machine in their own
 * file in the app data folder (never in a Repo). An entry remembers the Repo and Service names last
 * seen for it, so it can still be named while its Service is not found.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  DevPanelError,
  type ServiceRef,
  type ServiceSetEntryView,
  type ServiceSetStartReportEntry,
  type ServiceSetStartReportedEvent,
  type ServiceSetStartResult,
  type ServiceSetsChangedEvent,
  type ServiceSetView,
  type ServiceStatus,
} from '@devpanel/shared';
import { readJsonFile } from './json-file.js';

/** File name of the Service Sets file in the app data directory. */
export const SERVICE_SETS_FILE = 'service-sets.json';

const entrySchema = z.object({
  repoId: z.string().min(1),
  serviceId: z.string().min(1),
  repoName: z.string(),
  serviceName: z.string(),
});

const fileSchema = z.object({
  serviceSets: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), services: z.array(entrySchema) }))
    .default([]),
});

type StoredServiceSet = z.infer<typeof fileSchema>['serviceSets'][number];
type StoredEntry = z.infer<typeof entrySchema>;

export interface ServiceSetEvents {
  serviceSetsChanged: [ServiceSetsChangedEvent];
  serviceSetStartReported: [ServiceSetStartReportedEvent];
}

/** Current names of a Service of the Workspace. */
export interface FoundService {
  repoName: string;
  serviceName: string;
}

/** What `ServiceSets` needs from `core`. */
export interface ServiceSetHost {
  /** The Service `ref` names right now, or undefined when it is not found. */
  findService(ref: ServiceRef): FoundService | undefined;
  /** The Status of a found Service. */
  status(ref: ServiceRef): ServiceStatus;
  /** The normal Start path (dependencies, port checks, Orphans); resolves once spawned. */
  startService(ref: ServiceRef): Promise<void>;
  /** Waits until the Service leaves `starting`; resolves with its Status then. */
  settledStatus(ref: ServiceRef): Promise<ServiceStatus>;
  emit<E extends keyof ServiceSetEvents>(event: E, ...payload: ServiceSetEvents[E]): boolean;
}

/**
 * Reads the Service Sets file; a missing file means no Service Sets, an unreadable or invalid one
 * means none either but is `damaged` (kept aside on the next save).
 */
async function readServiceSets(file: string): Promise<{ sets: StoredServiceSet[]; damaged: boolean }> {
  let json: unknown;
  try {
    json = await readJsonFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { sets: [], damaged: false };
    console.warn(`Ignoring the unreadable Service Sets file ${file}: ${(err as Error).message}`);
    return { sets: [], damaged: true };
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`Ignoring the invalid Service Sets file ${file}: ${parsed.error.message}`);
    return { sets: [], damaged: true };
  }
  return { sets: parsed.data.serviceSets, damaged: false };
}

export class ServiceSets {
  private sets: StoredServiceSet[] = [];
  /** The list as last announced (loaded or sent in `serviceSetsChanged`), as JSON. */
  private announced = '[]';
  private readonly file: string;
  /** The file was unreadable or invalid at load: the next save first renames it to `.bak`. */
  private damaged = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly host: ServiceSetHost,
    private readonly appDataDir: string,
  ) {
    this.file = path.join(appDataDir, SERVICE_SETS_FILE);
  }

  /** Reads the stored Service Sets (emits nothing). */
  async load(): Promise<void> {
    ({ sets: this.sets, damaged: this.damaged } = await readServiceSets(this.file));
    this.announced = JSON.stringify(this.list());
  }

  /**
   * After a change to the Workspace or a config: stores the names of the entries found now (so a
   * Service that goes away later is named as last seen), then emits `serviceSetsChanged` when the
   * list shows something else (an entry found or not found, a Service or Repo renamed).
   */
  workspaceChanged(): void {
    if (this.sets.some((set) => this.withSeenNames(set) !== set)) {
      this.serialized(async () => {
        const sets = this.sets.map((set) => this.withSeenNames(set));
        if (sets.some((set, i) => set !== this.sets[i])) await this.save(sets);
      }).catch((err: unknown) => {
        console.warn(`Could not save the Service Sets file ${this.file}: ${(err as Error).message}`);
      });
    }
    if (JSON.stringify(this.list()) !== this.announced) this.changed();
  }

  /** After `relocateRepo`: entries of the Repo `oldId` follow it to `newId`. */
  moveRepo(oldId: string, newId: string): Promise<void> {
    return this.serialized(async () => {
      if (!this.sets.some((set) => set.services.some((e) => e.repoId === oldId))) return;
      const moved = (e: StoredEntry) => (e.repoId === oldId ? { ...e, repoId: newId } : e);
      await this.save(this.sets.map((set) => ({ ...set, services: set.services.map(moved) })));
      this.changed();
    });
  }

  /** Every Service Set, in creation order. */
  list(): ServiceSetView[] {
    return this.sets.map((set) => this.view(set));
  }

  create(options: { name: string; services: ServiceRef[] }): Promise<ServiceSetView> {
    return this.serialized(async () => {
      const name = this.requireValidName(options.name);
      const services = this.entries(options.services);
      const set: StoredServiceSet = { id: randomUUID(), name, services };
      await this.save([...this.sets, set]);
      this.changed();
      return this.view(set);
    });
  }

  update(options: { id: string; name: string; services: ServiceRef[] }): Promise<ServiceSetView> {
    return this.serialized(async () => {
      const current = this.require(options.id);
      const name = this.requireValidName(options.name, current.id);
      const services = this.entries(options.services, current.services);
      const set: StoredServiceSet = { id: current.id, name, services };
      await this.save(this.sets.map((s) => (s === current ? set : s)));
      this.changed();
      return this.view(set);
    });
  }

  delete(id: string): Promise<void> {
    return this.serialized(async () => {
      const current = this.require(id);
      await this.save(this.sets.filter((s) => s !== current));
      this.changed();
    });
  }

  private require(id: string): StoredServiceSet {
    const set = this.sets.find((s) => s.id === id);
    if (!set) throw new DevPanelError('serviceSetNotFound', {}, `No Service Set has the id "${id}"`);
    return set;
  }

  /**
   * Starts every found Service of the Set that is not `running` or `starting`, all at once, and
   * waits until each started one settles.
   */
  async start(id: string): Promise<ServiceSetStartResult> {
    const set = this.require(id);
    const outcomes = await Promise.all(set.services.map((entry) => this.startEntry(entry)));
    const notFound = set.services.filter((_, i) => outcomes[i] === 'notFound');
    const notRunning = set.services.filter((_, i) => outcomes[i] === 'notRunning');
    if (notFound.length || notRunning.length) {
      this.host.emit('serviceSetStartReported', {
        id: set.id,
        name: set.name,
        notFound: notFound.map((entry) => reportEntry(this.entryView(entry))),
        notRunning: notRunning.map((entry) => reportEntry(this.entryView(entry))),
      });
    }
    return { notFound: notFound.map(refOf), notRunning: notRunning.map(refOf) };
  }

  /** Starts one entry unless it is not found or already up; never rejects. */
  private async startEntry(entry: StoredEntry): Promise<'running' | 'notRunning' | 'notFound'> {
    const ref = refOf(entry);
    if (!this.host.findService(ref)) return 'notFound';
    const status = this.host.status(ref);
    if (status === 'running' || status === 'starting') return 'running';
    try {
      await this.host.startService(ref);
      return (await this.host.settledStatus(ref)) === 'running' ? 'running' : 'notRunning';
    } catch {
      // A refused start (or a Repo removed meanwhile): the Service shows why on its own (Status,
      // port-conflict choice); the Set only reports it.
      return 'notRunning';
    }
  }

  /** Runs changes one at a time, so each one validates against the list the previous one saved. */
  private serialized<T>(change: () => Promise<T>): Promise<T> {
    const result = this.queue.then(change);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** The trimmed name, unless it is empty or another Set (not `ownId`) has it, ignoring case. */
  private requireValidName(raw: string, ownId?: string): string {
    const name = raw.trim();
    if (!name) throw new DevPanelError('serviceSetNameEmpty', {}, 'The Service Set name is empty');
    const lower = name.toLowerCase();
    if (this.sets.some((s) => s.id !== ownId && s.name.toLowerCase() === lower)) {
      throw new DevPanelError('serviceSetNameTaken', { name }, `A Service Set named "${name}" already exists`);
    }
    return name;
  }

  /**
   * Stored entries for `refs` (duplicates dropped), named after their Services when found, else
   * after the matching `previous` entry (the names the Set remembered), else after the ids.
   */
  private entries(refs: ServiceRef[], previous: StoredEntry[] = []): StoredEntry[] {
    const seen = new Set<string>();
    const entries: StoredEntry[] = [];
    for (const { repoId, serviceId } of refs) {
      const key = JSON.stringify([repoId, serviceId]);
      if (seen.has(key)) continue;
      seen.add(key);
      const found =
        this.host.findService({ repoId, serviceId }) ??
        previous.find((e) => e.repoId === repoId && e.serviceId === serviceId);
      entries.push({ repoId, serviceId, repoName: found?.repoName ?? repoId, serviceName: found?.serviceName ?? serviceId });
    }
    if (!entries.length) throw new DevPanelError('serviceSetEmpty', {}, 'A Service Set needs at least one Service');
    return entries;
  }

  /** `set` with the current names of its found entries; `set` itself when none changed. */
  private withSeenNames(set: StoredServiceSet): StoredServiceSet {
    let renamed = false;
    const services = set.services.map((entry) => {
      const found = this.host.findService(refOf(entry));
      if (!found || (found.repoName === entry.repoName && found.serviceName === entry.serviceName)) return entry;
      renamed = true;
      return { ...entry, repoName: found.repoName, serviceName: found.serviceName };
    });
    return renamed ? { ...set, services } : set;
  }

  /** Writes `sets` (temp file + rename), then makes them current. */
  private async save(sets: StoredServiceSet[]): Promise<void> {
    await mkdir(this.appDataDir, { recursive: true });
    if (this.damaged) {
      await rename(this.file, `${this.file}.bak`);
      this.damaged = false;
    }
    const temp = `${this.file}.tmp`;
    await writeFile(temp, `${JSON.stringify({ serviceSets: sets }, null, 2)}\n`, 'utf8');
    await rename(temp, this.file);
    this.sets = sets;
  }

  private changed(): void {
    const serviceSets = this.list();
    this.announced = JSON.stringify(serviceSets);
    this.host.emit('serviceSetsChanged', { serviceSets });
  }

  private view(set: StoredServiceSet): ServiceSetView {
    return { id: set.id, name: set.name, services: set.services.map((entry) => this.entryView(entry)) };
  }

  /** Found entries show the current names, not-found ones the stored names. */
  private entryView(entry: StoredEntry): ServiceSetEntryView {
    const found = this.host.findService(refOf(entry));
    return {
      ref: refOf(entry),
      repoName: found?.repoName ?? entry.repoName,
      serviceName: found?.serviceName ?? entry.serviceName,
      found: found !== undefined,
    };
  }
}

function refOf({ repoId, serviceId }: StoredEntry): ServiceRef {
  return { repoId, serviceId };
}

function reportEntry({ ref, repoName, serviceName }: ServiceSetEntryView): ServiceSetStartReportEntry {
  return { ref, repoName, serviceName };
}
