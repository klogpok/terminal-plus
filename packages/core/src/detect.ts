/**
 * Auto-detection of Services for a Repo without a Repo Config or Local Config.
 * pnpm workspace packages with `dev`/`start`/`serve` scripts become `pnpm --filter <name> <script>`;
 * without `pnpm-workspace.yaml` (or when it yields nothing) the root `package.json` scripts are used.
 */
import { glob, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SuggestedService } from '@devpanel/shared';
import { parse as parseYaml } from 'yaml';
import { readJsonFile } from './json-file.js';

/** Scripts that start a long-running process. */
const RUN_SCRIPTS = ['dev', 'start', 'serve'];

interface PackageJson {
  name?: unknown;
  scripts?: unknown;
}

async function readPackageJson(file: string): Promise<PackageJson | undefined> {
  try {
    const value = await readJsonFile(file);
    return value && typeof value === 'object' ? (value as PackageJson) : undefined;
  } catch {
    return undefined;
  }
}

function scriptNames(pkg: PackageJson): string[] {
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== 'object') return [];
  return Object.entries(scripts)
    .filter(([, command]) => typeof command === 'string')
    .map(([name]) => name);
}

/** A Service id from free text: lowercase letters, digits and dashes. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function workspacePackageDirs(repoPath: string): Promise<string[] | undefined> {
  let text: string;
  try {
    text = await readFile(path.join(repoPath, 'pnpm-workspace.yaml'), 'utf8');
  } catch {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    return undefined;
  }
  const patterns = (raw as { packages?: unknown } | null)?.packages;
  if (!Array.isArray(patterns)) return [];
  const include = patterns.filter((p): p is string => typeof p === 'string' && !p.startsWith('!'));
  const exclude = patterns
    .filter((p): p is string => typeof p === 'string' && p.startsWith('!'))
    .map((p) => p.slice(1).replace(/\/+$/, ''));

  const dirs = new Set<string>();
  for (const pattern of include) {
    const manifests = glob(`${pattern.replace(/\/+$/, '')}/package.json`, {
      cwd: repoPath,
      exclude: (name) => name === 'node_modules',
    });
    for await (const manifest of manifests) {
      const dir = path.dirname(manifest).split(path.sep).join('/');
      if (dir === '.' || exclude.some((p) => path.matchesGlob(dir, p))) continue;
      dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/** Proposes Services for a Repo. Never writes anything. */
export async function detectServices(repoPath: string): Promise<SuggestedService[]> {
  const suggestions: SuggestedService[] = [];
  const ids = new Set<string>();
  const add = (base: string, suggestion: Omit<SuggestedService, 'id'>) => {
    let id = base || 'service';
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    suggestions.push({ id, ...suggestion });
  };

  for (const dir of (await workspacePackageDirs(repoPath)) ?? []) {
    const pkg = await readPackageJson(path.join(repoPath, dir, 'package.json'));
    if (!pkg || typeof pkg.name !== 'string' || !pkg.name) continue;
    const shortName = pkg.name.split('/').pop()!;
    for (const script of scriptNames(pkg).filter((s) => RUN_SCRIPTS.includes(s))) {
      add(slug(`${shortName}-${script}`), {
        name: `${shortName} ${script}`,
        command: `pnpm --filter ${pkg.name} ${script}`,
        preselected: true,
      });
    }
  }
  if (suggestions.length > 0) return suggestions;

  const root = await readPackageJson(path.join(repoPath, 'package.json'));
  for (const script of root ? scriptNames(root) : []) {
    add(slug(script), { name: script, command: `pnpm run ${script}`, preselected: RUN_SCRIPTS.includes(script) });
  }
  return suggestions;
}
