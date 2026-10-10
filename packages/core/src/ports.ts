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

/** One running process: name (e.g. `node.exe`) and parent PID. */
export interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
}

/**
 * Every running process with its parent PID (`Get-CimInstance Win32_Process`; `tasklist` has no
 * parent PIDs and `wmic` is gone from current Windows). ~0.4 s, so only called on a conflict.
 */
export function listProcesses(): Promise<Map<number, ProcessInfo>> {
  // Tab-separated `pid ppid name`; [char]9 because single-quoted PowerShell strings do not expand `t.
  const script =
    "Get-CimInstance Win32_Process | ForEach-Object { '{0}{3}{1}{3}{2}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, [char]9 }";
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const processes = new Map<number, ProcessInfo>();
        for (const line of stdout.split(/\r?\n/)) {
          const [pid, parentPid, name] = line.split('\t');
          if (!pid || !name) continue;
          processes.set(Number(pid), { pid: Number(pid), parentPid: Number(parentPid), name });
        }
        resolve(processes);
      },
    );
  });
}

/** PID and its ancestors (nearest first), stopping at a missing parent or a cycle. */
export function ancestry(pid: number, processes: Map<number, ProcessInfo>): number[] {
  const chain: number[] = [];
  let current: number | undefined = pid;
  while (current !== undefined && current > 0 && !chain.includes(current)) {
    chain.push(current);
    current = processes.get(current)?.parentPid;
  }
  return chain;
}
