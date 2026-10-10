/** About how many lines of output are kept per Service (spec: "about 10,000 lines"). */
export const OUTPUT_BUFFER_LINES = 10_000;

/**
 * In-memory ring buffer of raw pty output (ANSI sequences included), bounded by line count.
 * Stores whole chunks; when over the limit it drops the oldest chunks and trims the first kept
 * chunk at a line start, so a replay never starts mid-line. Nothing is written to disk.
 */
export class OutputBuffer {
  private chunks: string[] = [];
  private lineCounts: number[] = [];
  private lines = 0;

  constructor(private readonly maxLines = OUTPUT_BUFFER_LINES) {}

  append(data: string): void {
    if (!data) return;
    const count = countNewlines(data);
    this.chunks.push(data);
    this.lineCounts.push(count);
    this.lines += count;
    this.trim();
  }

  text(): string {
    return this.chunks.join('');
  }

  private trim(): void {
    let excess = this.lines - this.maxLines;
    // Drop whole chunks while they are entirely beyond the limit.
    while (excess > 0 && this.chunks.length > 1 && this.lineCounts[0]! <= excess) {
      excess -= this.lineCounts[0]!;
      this.lines -= this.lineCounts[0]!;
      this.chunks.shift();
      this.lineCounts.shift();
    }
    if (excess <= 0) return;
    // Cut the first chunk after its `excess`-th newline.
    const first = this.chunks[0]!;
    let index = -1;
    for (let i = 0; i < excess; i++) index = first.indexOf('\n', index + 1);
    this.chunks[0] = first.slice(index + 1);
    this.lineCounts[0]! -= excess;
    this.lines -= excess;
  }
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) count++;
  return count;
}
