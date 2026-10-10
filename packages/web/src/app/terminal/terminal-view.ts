import { InjectionToken } from '@angular/core';

/** Terminal size in character cells. */
export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * One on-screen terminal. `XtermView` is the real one (xterm.js + fit + search addons); component
 * tests use `FakeTerminalView`, because xterm cannot render in jsdom.
 */
export interface TerminalView {
  /** Renders into `host`; called once. */
  open(host: HTMLElement): void;
  write(data: string): void;
  /** Clears the screen and scrollback (local only; the Server buffer is untouched). */
  clear(): void;
  /** Full reset before a buffer replay. */
  reset(): void;
  /** Keyboard input typed by the user. */
  onInput(listener: (data: string) => void): void;
  /** Fits the terminal to its host; returns the new size, or undefined when the host is not visible. */
  fit(): TerminalSize | undefined;
  /** All text in the scrollback and on screen, without colors. */
  allText(): string;
  findNext(term: string): boolean;
  findPrevious(term: string): boolean;
  clearSearch(): void;
  focus(): void;
  dispose(): void;
}

export const TERMINAL_VIEW_FACTORY = new InjectionToken<() => TerminalView>('TerminalViewFactory');
