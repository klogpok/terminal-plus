import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** File name of the Repo Config in a Repo root. */
export const REPO_CONFIG_FILE = '.devpanel.yml';

const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  readyPattern: z.string().min(1).optional(),
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
  });

export type ServiceDefinition = z.infer<typeof serviceSchema>;
export type RepoConfig = z.infer<typeof repoConfigSchema>;

export type ConfigResult =
  | { ok: true; config: RepoConfig | undefined }
  | { ok: false; error: string };

/** Reads and validates the Repo Config of a Repo. A missing file yields `config: undefined`. */
export async function readRepoConfig(repoPath: string): Promise<ConfigResult> {
  let text: string;
  try {
    text = await readFile(path.join(repoPath, REPO_CONFIG_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, config: undefined };
    return { ok: false, error: `Cannot read ${REPO_CONFIG_FILE}: ${(err as Error).message}` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (err) {
    return { ok: false, error: `${REPO_CONFIG_FILE} is not valid YAML: ${(err as Error).message}` };
  }
  const result = repoConfigSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, error: `${REPO_CONFIG_FILE} is invalid: ${details}` };
  }
  return { ok: true, config: result.data };
}
