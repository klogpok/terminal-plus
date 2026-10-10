import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** File name of the Workspace file in the app data directory. */
export const WORKSPACE_FILE = 'workspace.json';

const workspaceSchema = z.object({
  repos: z
    .array(
      z.object({
        path: z.string().min(1),
        name: z.string().min(1),
        color: z.string().optional(),
      }),
    )
    .default([]),
});

export type WorkspaceFile = z.infer<typeof workspaceSchema>;

/** Reads the Workspace file; a missing file is an empty Workspace. */
export async function readWorkspace(appDataDir: string): Promise<WorkspaceFile> {
  const file = path.join(appDataDir, WORKSPACE_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { repos: [] };
    throw err;
  }
  return workspaceSchema.parse(JSON.parse(text));
}
