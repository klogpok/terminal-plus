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
  type ServiceSetsChangedEvent,
  type ServiceSetView,
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
  emit(event: 'serviceSetsChanged', payload: ServiceSetsChangedEvent): boolean;
}

/** Reads the Service Sets file; a missing, unreadable or invalid file means no Service Sets. */
async function readServiceSets(file: string): Promise<StoredServiceSet[]> {
  let json: unknown;
  try {
    json = await readJsonFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Ignoring the unreadable Service Sets file ${file}: ${(err as Error).message}`);
    }
    return [];
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`Ignoring the invalid Service Sets file ${file}: ${parsed.error.message}`);
    return [];
  }
  return parsed.data.serviceSets;
}

export class ServiceSets {
  private sets: StoredServiceSet[] = [];
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly host: ServiceSetHost,
    private readonly appDataDir: string,
  ) {
    this.file = path.join(appDataDir, SERVICE_SETS_FILE);
  }

  /** Reads the stored Service Sets (emits nothing). */
  async load(): Promise<void> {
    this.sets = await readServiceSets(this.file);
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

  /** Runs changes one at a time, so each one validates against the list the previous one saved. */
  private serialized<T>(change: () => Promise<T>): Promise<T> {
    const result = this.queue.then(change);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private requireValidName(raw: string): string {
    const name = raw.trim();
    if (!name) throw new DevPanelError('serviceSetNameEmpty', {}, 'The Service Set name is empty');
    const lower = name.toLowerCase();
    if (this.sets.some((s) => s.name.toLowerCase() === lower)) {
      throw new DevPanelError('serviceSetNameTaken', { name }, `A Service Set named "${name}" already exists`);
    }
    return name;
  }

  /** Stored entries for `refs` (duplicates dropped), named after their Services when found. */
  private entries(refs: ServiceRef[]): StoredEntry[] {
    const seen = new Set<string>();
    const entries: StoredEntry[] = [];
    for (const { repoId, serviceId } of refs) {
      const key = JSON.stringify([repoId, serviceId]);
      if (seen.has(key)) continue;
      seen.add(key);
      const found = this.host.findService({ repoId, serviceId });
      entries.push({ repoId, serviceId, repoName: found?.repoName ?? repoId, serviceName: found?.serviceName ?? serviceId });
    }
    if (!entries.length) throw new DevPanelError('serviceSetEmpty', {}, 'A Service Set needs at least one Service');
    return entries;
  }

  /** Writes `sets` (temp file + rename), then makes them current. */
  private async save(sets: StoredServiceSet[]): Promise<void> {
    await mkdir(this.appDataDir, { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, `${JSON.stringify({ serviceSets: sets }, null, 2)}\n`, 'utf8');
    await rename(temp, this.file);
    this.sets = sets;
  }

  private changed(): void {
    this.host.emit('serviceSetsChanged', { serviceSets: this.list() });
  }

  private view(set: StoredServiceSet): ServiceSetView {
    return {
      id: set.id,
      name: set.name,
      services: set.services.map(({ repoId, serviceId, repoName, serviceName }) => {
        const found = this.host.findService({ repoId, serviceId });
        return {
          ref: { repoId, serviceId },
          repoName: found?.repoName ?? repoName,
          serviceName: found?.serviceName ?? serviceName,
          found: found !== undefined,
        };
      }),
    };
  }
}
