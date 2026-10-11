import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

/** File name of the Repo Config in a Repo root. */
export const REPO_CONFIG_FILE = '.devpanel.yml';

function isValidRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  readyPattern: z.string().min(1).refine(isValidRegExp, 'readyPattern is not a valid regular expression').optional(),
  healthUrl: z.string().url().optional(),
  url: z.string().url().optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const repoConfigSchema = z
  .object({ services: z.array(serviceSchema).default([]) })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    const ports = new Map<number, string>();
    config.services.forEach((service, index) => {
      if (ids.has(service.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['services', index, 'id'],
          message: `Duplicate Service id "${service.id}"`,
        });
      }
      ids.add(service.id);
      if (service.port !== undefined) {
        const other = ports.get(service.port);
        if (other !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['services', index, 'port'],
            message: `Port ${service.port} is used by both "${other}" and "${service.id}"`,
          });
        } else {
          ports.set(service.port, service.id);
        }
      }
    });
    config.services.forEach((service, index) => {
      for (const dep of service.dependsOn ?? []) {
        if (!ids.has(dep) || dep === service.id) {
          ctx.addIssue({
            code: 'custom',
            path: ['services', index, 'dependsOn'],
            message: `Service "${service.id}" depends on "${dep}", which is not another Service of this Repo`,
          });
        }
      }
    });
    const cycle = findDependencyCycle(config.services);
    if (cycle) {
      ctx.addIssue({
        code: 'custom',
        path: ['services'],
        message: `dependsOn forms a cycle: ${cycle.join(' -> ')}`,
      });
    }
  });

/** A dependsOn cycle as a list of Service ids (first id repeated at the end), or undefined. */
function findDependencyCycle(services: { id: string; dependsOn?: string[] }[]): string[] | undefined {
  const deps = new Map(services.map((s) => [s.id, s.dependsOn ?? []]));
  const done = new Set<string>();
  const visit = (id: string, trail: string[]): string[] | undefined => {
    const loop = trail.indexOf(id);
    if (loop >= 0) return [...trail.slice(loop), id];
    if (done.has(id)) return undefined;
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep, [...trail, id]);
      if (cycle) return cycle;
    }
    done.add(id);
    return undefined;
  };
  for (const { id } of services) {
    const cycle = visit(id, []);
    if (cycle) return cycle;
  }
  return undefined;
}

export type ServiceDefinition = z.infer<typeof serviceSchema>;
export type RepoConfig = z.infer<typeof repoConfigSchema>;

/** One validation problem: where in the config (`['services', 1, 'port']`) and what (English). */
export interface ConfigIssue {
  path: PropertyKey[];
  message: string;
}

export type ConfigResult =
  | { ok: true; config: RepoConfig | undefined }
  | { ok: false; error: string; issues?: ConfigIssue[] };

/** Directory inside the app data directory that holds the Local Configs. */
export const LOCAL_CONFIG_DIR = 'local-configs';

/**
 * Path of a Repo's Local Config: `<appData>/local-configs/<hash of the Repo path>.yml`.
 * The single source of this location (also used when a Repo is removed).
 */
export function localConfigPath(appDataDir: string, repoPath: string): string {
  const normalized = path.resolve(repoPath).toLowerCase();
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  return path.join(appDataDir, LOCAL_CONFIG_DIR, `${hash}.yml`);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

/** Validates a parsed config object (Repo Config or Local Config). */
export function validateConfig(raw: unknown, label: string): ConfigResult {
  const result = repoConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(({ path, message }) => ({ path, message }));
    return { ok: false, error: `${label} is invalid: ${describeIssues(result.error)}`, issues };
  }
  return { ok: true, config: result.data };
}

/** Reads and validates a config file. A missing file yields `config: undefined`. */
async function readConfigFile(file: string, label: string): Promise<ConfigResult> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, config: undefined };
    return { ok: false, error: `Cannot read ${label}: ${(err as Error).message}` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (err) {
    return { ok: false, error: `${label} is not valid YAML: ${(err as Error).message}` };
  }
  return validateConfig(raw, label);
}

/** Reads and validates the Repo Config of a Repo. A missing file yields `config: undefined`. */
export function readRepoConfig(repoPath: string): Promise<ConfigResult> {
  return readConfigFile(path.join(repoPath, REPO_CONFIG_FILE), REPO_CONFIG_FILE);
}

/** Reads and validates the Local Config of a Repo. A missing file yields `config: undefined`. */
export function readLocalConfig(appDataDir: string, repoPath: string): Promise<ConfigResult> {
  return readConfigFile(localConfigPath(appDataDir, repoPath), `Local Config ${localConfigPath(appDataDir, repoPath)}`);
}

/** Writes a validated Local Config into the app data directory (never into the Repo). */
export async function writeLocalConfig(appDataDir: string, repoPath: string, config: RepoConfig): Promise<void> {
  const file = localConfigPath(appDataDir, repoPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stringifyYaml(config));
}

/** Deletes a Repo's Local Config; a missing file is fine. */
export async function deleteLocalConfig(appDataDir: string, repoPath: string): Promise<void> {
  await rm(localConfigPath(appDataDir, repoPath), { force: true });
}

