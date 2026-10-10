import { OutputBuffer } from './output-buffer.js';
import type { ServiceProcess } from './process.js';

/**
 * What a Service and a Session have in common: a pty process while one runs, the buffered output
 * (which outlives the process), and the size clients last asked for. Clients are equal peers:
 * input from any of them goes to the pty, and the most recent resize wins.
 */
export class Terminal {
  /** Set while the process runs. */
  process?: ServiceProcess;
  readonly output = new OutputBuffer();
  /** Size from the most recent resize; a later spawn starts with it too. */
  size?: { cols: number; rows: number };

  /** Keyboard input for the pty; dropped while no process runs. */
  write(data: string): void {
    this.process?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.size = { cols, rows };
    this.process?.resize(cols, rows);
  }
}
