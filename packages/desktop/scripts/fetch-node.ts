// Downloads the node.exe the installer ships as the sidecar's runtime, into the place Tauri's
// `externalBin` expects it (src-tauri/binaries, gitignored), and checks it against the pinned
// SHA-256. A wrong checksum throws, so `pnpm desktop:dist` stops. Run with `node` (type stripping).
//
// Updating Node: pick a version satisfying the root `engines.node`, then take the `win-x64/node.exe`
// line of https://nodejs.org/dist/<version>/SHASUMS256.txt.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PinnedFile {
  url: string;
  sha256: string;
}

const NODE_VERSION = 'v24.21.0';

export const NODE_EXE: PinnedFile = {
  url: `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`,
  sha256: 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32',
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function readIfExists(file: string): Buffer | undefined {
  try {
    return readFileSync(file);
  } catch {
    return undefined;
  }
}

/** Puts the pinned file at `dest`: keeps a cached copy whose checksum matches, else downloads it. */
export async function fetchVerified(pinned: PinnedFile, dest: string): Promise<'cached' | 'downloaded'> {
  const cached = readIfExists(dest);
  if (cached && sha256(cached) === pinned.sha256) return 'cached';

  const response = await fetch(pinned.url);
  if (!response.ok) throw new Error(`Downloading ${pinned.url} failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== pinned.sha256) {
    rmSync(dest, { force: true });
    throw new Error(`Checksum mismatch for ${pinned.url}: expected ${pinned.sha256}, got ${actual}`);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  const partial = `${dest}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, dest);
  return 'downloaded';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Tauri appends the target triple to `externalBin` names and strips it when installing.
  const dest = fileURLToPath(new URL('../src-tauri/binaries/node-x86_64-pc-windows-msvc.exe', import.meta.url));
  const result = await fetchVerified(NODE_EXE, dest);
  console.log(`node.exe ${NODE_VERSION} ${result}, checksum verified: ${dest}`);
}
