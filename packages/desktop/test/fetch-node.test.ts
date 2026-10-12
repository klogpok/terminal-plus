/**
 * The installer's node.exe download: a file is only ever kept when its SHA-256 matches the pinned
 * one. Served from a local HTTP server, so nothing here touches the network.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchVerified } from '../scripts/fetch-node.js';

// sha256("hello node\n"), computed independently with `sha256sum`.
const BODY = 'hello node\n';
const BODY_SHA256 = '00cc7b9b95b2517eabc453117336f9734c70fc3d18e54637c34f3746017ad0b2';

let root: string;
let server: Server;
let url: string;
let requests: number;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'devpanel-fetch-node-test-'));
  requests = 0;
  server = createServer((_request, response) => {
    requests++;
    response.end(BODY);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  url = `http://127.0.0.1:${address.port}/node.exe`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

describe('fetchVerified', () => {
  it('downloads the file when its checksum matches', async () => {
    const dest = path.join(root, 'binaries', 'node.exe');
    expect(await fetchVerified({ url, sha256: BODY_SHA256 }, dest)).toBe('downloaded');
    expect(readFileSync(dest, 'utf8')).toBe(BODY);
  });

  it('fails on a wrong checksum and leaves no file behind', async () => {
    const dest = path.join(root, 'node.exe');
    await expect(fetchVerified({ url, sha256: '0'.repeat(64) }, dest)).rejects.toThrow(/checksum/i);
    expect(existsSync(dest)).toBe(false);
  });

  it('keeps a cached file whose checksum matches, without downloading', async () => {
    const dest = path.join(root, 'node.exe');
    writeFileSync(dest, BODY);
    expect(await fetchVerified({ url, sha256: BODY_SHA256 }, dest)).toBe('cached');
    expect(requests).toBe(0);
  });

  it('replaces a cached file whose checksum does not match', async () => {
    const dest = path.join(root, 'node.exe');
    writeFileSync(dest, 'tampered');
    expect(await fetchVerified({ url, sha256: BODY_SHA256 }, dest)).toBe('downloaded');
    expect(readFileSync(dest, 'utf8')).toBe(BODY);
  });
});
