import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import type { TerminalSize, TerminalView } from './terminal-view';

const SEARCH_OPTIONS: ISearchOptions = {
  decorations: {
    matchBackground: '#665c00',
    matchOverviewRuler: '#d4b800',
    activeMatchBackground: '#d97706',
    activeMatchColorOverviewRuler: '#f59e0b',
  },
};

/** `TerminalView` on xterm.js with the fit and search addons. */
export class XtermView implements TerminalView {
  private readonly terminal = new Terminal({
    scrollback: 10_000,
    convertEol: false,
    // ConPTY starts every run with a clear screen (ESC[2J); keep the previous run (and the restart
    // separator) in the scrollback instead of erasing it.
    scrollOnEraseInDisplay: true,
    cursorBlink: false,
    allowProposedApi: true, // search decorations
    fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
    fontSize: 13,
    theme: { background: '#0b0f17' },
  });
  private readonly fitAddon = new FitAddon();
  private readonly searchAddon = new SearchAddon();

  constructor() {
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
  }

  open(host: HTMLElement): void {
    this.terminal.open(host);
  }

  write(data: string): void {
    this.terminal.write(data);
  }

  clear(): void {
    // `clear()` keeps the prompt line; wipe the screen too so the tab is really empty.
    this.terminal.clear();
    this.terminal.write('\u001b[2J\u001b[H');
  }

  reset(): void {
    this.terminal.reset();
  }

  onInput(listener: (data: string) => void): void {
    this.terminal.onData(listener);
  }

  fit(): TerminalSize | undefined {
    const element = this.terminal.element;
    if (!element || element.offsetParent === null) return undefined;
    this.fitAddon.fit();
    return { cols: this.terminal.cols, rows: this.terminal.rows };
  }

  allText(): string {
    const buffer = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (!line) continue;
      const text = line.translateToString(true);
      // A wrapped line continues the previous one.
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  findNext(term: string): boolean {
    return this.searchAddon.findNext(term, SEARCH_OPTIONS);
  }

  findPrevious(term: string): boolean {
    return this.searchAddon.findPrevious(term, SEARCH_OPTIONS);
  }

  clearSearch(): void {
    this.searchAddon.clearDecorations();
    this.terminal.clearSelection();
  }

  focus(): void {
    this.terminal.focus();
  }

  dispose(): void {
    this.terminal.dispose();
  }
}
