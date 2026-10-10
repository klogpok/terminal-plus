import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

/** Writes the Workspace file (via a temp file + rename, so a crash never leaves half a file). */
export async function writeWorkspace(appDataDir: string, workspace: WorkspaceFile): Promise<void> {
  await mkdir(appDataDir, { recursive: true });
  const file = path.join(appDataDir, WORKSPACE_FILE);
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
  await rename(temp, file);
}
