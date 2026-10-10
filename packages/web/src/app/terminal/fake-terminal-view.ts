import type { TerminalSize, TerminalView } from './terminal-view';

/** Test double for `TerminalView`: records what was written and lets a test type or resize. */
export class FakeTerminalView implements TerminalView {
  /** Every created view, oldest first (provide `FakeTerminalView.factory` as `TERMINAL_VIEW_FACTORY`). */
  static readonly created: FakeTerminalView[] = [];
  static factory = (): TerminalView => {
    const view = new FakeTerminalView();
    FakeTerminalView.created.push(view);
    return view;
  };

  /** What the terminal currently shows (reset/clear empty it). */
  screen = '';
  host?: HTMLElement;
  size: TerminalSize | undefined = { cols: 80, rows: 24 };
  readonly searches: string[] = [];
  disposed = false;
  private inputListener?: (data: string) => void;

  open(host: HTMLElement): void {
    this.host = host;
  }
  write(data: string): void {
    this.screen += data;
  }
  clear(): void {
    this.screen = '';
  }
  reset(): void {
    this.screen = '';
  }
  onInput(listener: (data: string) => void): void {
    this.inputListener = listener;
  }
  fit(): TerminalSize | undefined {
    return this.size;
  }
  allText(): string {
    return this.screen;
  }
  findNext(term: string): boolean {
    this.searches.push(`next:${term}`);
    return true;
  }
  findPrevious(term: string): boolean {
    this.searches.push(`previous:${term}`);
    return true;
  }
  clearSearch(): void {
    this.searches.push('clear');
  }
  focus(): void {}
  dispose(): void {
    this.disposed = true;
  }

  /** Simulates the user typing. */
  type(data: string): void {
    this.inputListener?.(data);
  }
}
