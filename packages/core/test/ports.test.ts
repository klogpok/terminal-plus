import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { findPortListeners, isPortListening } from '../src/index.js';
import { freePort } from './harness.js';

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function listen(port: number, host?: string): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, resolve);
  });
}

describe('findPortListeners (OS listening-socket table)', () => {
  it.each([
    ['IPv4 127.0.0.1', '127.0.0.1'],
    ['IPv6 ::1', '::1'],
    ['any address', undefined],
  ])('finds a socket listening on %s and returns the owner PID', async (_label, host) => {
    const port = await freePort();
    await listen(port, host);

    const listeners = await findPortListeners(port);

    expect(listeners.length).toBeGreaterThan(0);
    expect(listeners.every((l) => l.pid === process.pid)).toBe(true);
    expect(await isPortListening(port)).toBe(true);
  });

  it('returns nothing for a port nobody listens on', async () => {
    const port = await freePort();

    expect(await findPortListeners(port)).toEqual([]);
    expect(await isPortListening(port)).toBe(false);
  });

  it('does not confuse a port with one that merely starts with the same digits', async () => {
    const port = await freePort();
    await listen(port, '127.0.0.1');

    expect(await findPortListeners(Number(String(port).slice(0, -1)))).not.toContainEqual(
      expect.objectContaining({ pid: process.pid }),
    );
  });
});
