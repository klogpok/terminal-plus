/**
 * The PID file (`<appData>/processes.json`): every process DevPanel spawned for a Service or a
 * Session, with its creation time, so that the next Server start can tell Orphans (still alive, PID
 * and creation time both matching) from processes that merely reused an old PID.
 *
 * Records are grouped by run: one Service run or one Session = one `runId`, recorded as the pty's
 * root process plus its descendants. When the Server is killed hard, Windows closes the pseudo
 * console and its console processes usually die with it; what survives are descendants that left
 * the console (detached workers etc.), which is why the whole tree is recorded, not only the root.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Orphan, ProcessOwner } from '@devpanel/shared';
import { listProcesses, type ProcessInfo } from './ports.js';

export const PID_FILE = 'processes.json';

/** What a run belongs to. */
export interface RunInfo {
  repoId: string;
  repoName: string;
  owner: ProcessOwner;
}

/** One recorded process. */
export interface PidRecord extends RunInfo {
  pid: number;
  /** Creation time (FILETIME ticks, decimal; see `ProcessInfo.createdAt`). */
  createdAt: string;
  runId: string;
}

interface PidFileContent {
  processes: PidRecord[];
}

/** While runs are live, their trees are re-recorded this often (children come and go). */
const REFRESH_INTERVAL_MS = 30_000;
/** One extra recording this long after the spawn, once the program under cmd.exe is up. */
const FOLLOW_UP_MS = 3_000;

function isRecord(value: unknown): value is PidRecord {
  const r = value as PidRecord;
  return (
    typeof r === 'object' &&
    r !== null &&
    Number.isInteger(r.pid) &&
    typeof r.createdAt === 'string' &&
    typeof r.runId === 'string' &&
    typeof r.repoId === 'string' &&
    typeof r.repoName === 'string' &&
    typeof r.owner === 'object' &&
    r.owner !== null
  );
}

/** Reads and writes the PID file. Every change is a synchronous read-modify-write. */
export class PidFile {
  constructor(readonly file: string) {}

  read(): PidRecord[] {
    try {
      const content = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<PidFileContent>;
      return Array.isArray(content.processes) ? content.processes.filter(isRecord) : [];
    } catch {
      return [];
    }
  }

  update(change: (records: PidRecord[]) => PidRecord[]): void {
    const before = this.read();
    const after = change(before);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify({ processes: after } satisfies PidFileContent, null, 2));
    renameSync(temp, this.file);
  }
}

/** Does the live process with this record's PID have the recorded creation time? */
export function matches(record: { pid: number; createdAt: string }, processes: Map<number, ProcessInfo>): boolean {
  const info = processes.get(record.pid);
  return info !== undefined && info.createdAt !== '' && info.createdAt === record.createdAt;
}

/**
 * `root` and all its descendants that are alive. A child must not be older than its parent: an
 * older process with that parent PID belonged to an earlier owner of the PID.
 */
export function processTree(root: number, processes: Map<number, ProcessInfo>): ProcessInfo[] {
  const rootInfo = processes.get(root);
  if (!rootInfo || !rootInfo.createdAt) return [];
  const children = new Map<number, ProcessInfo[]>();
  for (const info of processes.values()) {
    if (info.pid === info.parentPid) continue;
    let list = children.get(info.parentPid);
    if (!list) children.set(info.parentPid, (list = []));
    list.push(info);
  }
  const tree: ProcessInfo[] = [];
  const queue = [rootInfo];
  while (queue.length) {
    const parent = queue.shift()!;
    if (tree.includes(parent)) continue;
    tree.push(parent);
    for (const child of children.get(parent.pid) ?? []) {
      if (child.createdAt && BigInt(child.createdAt) >= BigInt(parent.createdAt)) queue.push(child);
    }
  }
  return tree;
}

/**
 * Records the process trees of live runs in the PID file. Recording needs the process list
 * (PowerShell, ~0.4 s), so requests are batched: at most one listing runs at a time and it serves
 * every request made before it started.
 */
export class ProcessRecorder {
  private readonly runs = new Map<string, RunInfo & { rootPid: number }>();
  private readonly requested = new Set<string>();
  private flushing: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly pidFile: PidFile,
    private readonly list: () => Promise<Map<number, ProcessInfo>> = listProcesses,
  ) {}

  /** Starts recording a newly spawned run (its pty root PID). Returns the run id. */
  track(rootPid: number, info: RunInfo): string {
    const runId = randomUUID();
    this.runs.set(runId, { ...info, rootPid });
    this.refresh(runId);
    // The root (cmd.exe) starts the real program only now; record the tree again shortly.
    setTimeout(() => this.refresh(runId), FOLLOW_UP_MS).unref();
    this.timer ??= setInterval(() => {
      for (const id of this.runs.keys()) this.refresh(id);
    }, REFRESH_INTERVAL_MS).unref();
    return runId;
  }

  /** Re-records the run's process tree (e.g. once it is ready and has spawned its children). */
  refresh(runId: string): void {
    if (!this.runs.has(runId)) return;
    this.requested.add(runId);
    this.flushing ??= this.flush().finally(() => {
      this.flushing = undefined;
    });
  }

  /** The run ended (its root exited): its records are removed. */
  forget(runId: string): void {
    this.runs.delete(runId);
    this.requested.delete(runId);
    this.pidFile.update((records) => records.filter((r) => r.runId !== runId));
    if (this.runs.size === 0) this.stopTimer();
  }

  /** Stops periodic refreshes (records of live runs stay until they end). */
  stopTimer(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async flush(): Promise<void> {
    while (this.requested.size) {
      const ids = [...this.requested];
      this.requested.clear();
      let processes: Map<number, ProcessInfo>;
      try {
        processes = await this.list();
      } catch {
        return; // PowerShell unavailable: nothing can be recorded.
      }
      const fresh = new Map<string, PidRecord[]>();
      for (const runId of ids) {
        const run = this.runs.get(runId);
        if (!run) continue; // ended meanwhile
        const { rootPid, ...info } = run;
        fresh.set(
          runId,
          processTree(rootPid, processes).map((p) => ({ pid: p.pid, createdAt: p.createdAt, runId, ...info })),
        );
      }
      if (fresh.size === 0) continue;
      this.pidFile.update((records) => [
        ...records.filter((r) => !fresh.has(r.runId)),
        ...[...fresh.values()].flat(),
      ]);
    }
  }
}

/** Groups records that still match a live process into Orphans (one per run). */
export function orphansFrom(records: PidRecord[], processes: Map<number, ProcessInfo>): Orphan[] {
  const byRun = new Map<string, Orphan>();
  for (const record of records) {
    if (!matches(record, processes) || record.pid === process.pid) continue;
    const orphan = byRun.get(record.runId);
    if (orphan) orphan.pids.push(record.pid);
    else {
      byRun.set(record.runId, {
        id: record.runId,
        repoId: record.repoId,
        repoName: record.repoName,
        owner: record.owner,
        pids: [record.pid],
      });
    }
  }
  return [...byRun.values()];
}
