/**
 * Port occupancy from the OS table of listening TCP sockets (`netstat -ano`), on every address
 * (IPv4 and IPv6, loopback and any-address). Gives the owner PID of each listening socket.
 * Used as the "port listening" Readiness signal and for port conflicts.
 */
import { execFile } from 'node:child_process';

export interface PortListener {
  /** Local address as printed by netstat, e.g. `0.0.0.0`, `127.0.0.1`, `[::]`, `[::1]`. */
  address: string;
  port: number;
  /** PID of the process that owns the listening socket. */
  pid: number;
}

/**
 * A TCP row: `TCP  <local>:<port>  <foreign>  <state>  <pid>`. Listening rows are recognized by the
 * foreign address `0.0.0.0:0` / `[::]:0` rather than by the state word, which Windows localizes.
 */
const TCP_LISTEN_ROW = /^\s*TCP\s+(\S+):(\d+)\s+(?:0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)\s*$/i;

/** Parses `netstat -ano` output into its listening TCP sockets. */
export function parseNetstatListeners(output: string): PortListener[] {
  const listeners: PortListener[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = TCP_LISTEN_ROW.exec(line);
    if (!match) continue;
    listeners.push({ address: match[1]!, port: Number(match[2]), pid: Number(match[3]) });
  }
  return listeners;
}

/** All listening TCP sockets on the machine. Rejects if `netstat` cannot run. */
export function listListeningSockets(): Promise<PortListener[]> {
  return new Promise((resolve, reject) => {
    // Without `-p`, netstat lists both TCP (IPv4) and TCPv6 sockets (UDP rows are skipped by the parser).
    execFile('netstat', ['-ano'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseNetstatListeners(stdout));
    });
  });
}

/** Sockets listening on `port` on any address, with their owner PIDs (empty when the port is free). */
export async function findPortListeners(port: number): Promise<PortListener[]> {
  return (await listListeningSockets()).filter((l) => l.port === port);
}

/** Is anything listening on `port` on any address? */
export async function isPortListening(port: number): Promise<boolean> {
  return (await findPortListeners(port)).length > 0;
}
