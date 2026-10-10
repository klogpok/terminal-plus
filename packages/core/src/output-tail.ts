// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;

/** Removes ANSI/OSC escape sequences (colors, cursor moves, window titles) that ConPTY output carries. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/**
 * Keeps the last `maxLines` lines of pty output as plain text: ANSI stripped, and a bare `\r`
 * (progress bars) overwrites the line like a terminal would. Handles chunks split anywhere.
 */
export class OutputTail {
  private readonly lines: string[] = [];
  /** Raw text of the line still being written (no `\n` yet). */
  private pending = '';

  constructor(private readonly maxLines: number) {}

  push(data: string): void {
    const parts = (this.pending + data).split('\n');
    this.pending = parts.pop()!;
    for (const raw of parts) this.lines.push(toPlainLine(raw));
    // A little slack so trailing blank lines (trimmed in `snapshot`) do not eat into `maxLines`.
    const keep = this.maxLines + 10;
    if (this.lines.length > keep) this.lines.splice(0, this.lines.length - keep);
  }

  /** The last lines (including an unfinished last line), without leading/trailing blank lines. */
  snapshot(): string[] {
    const all = [...this.lines];
    const last = toPlainLine(this.pending);
    if (last !== '') all.push(last);
    let start = 0;
    let end = all.length;
    while (start < end && all[start]!.trim() === '') start++;
    while (end > start && all[end - 1]!.trim() === '') end--;
    return all.slice(start, end).slice(-this.maxLines);
  }
}

function toPlainLine(raw: string): string {
  const line = stripAnsi(raw.replace(/\r+$/, ''));
  const lastCr = line.lastIndexOf('\r');
  return (lastCr === -1 ? line : line.slice(lastCr + 1)).trimEnd();
}
