import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { WsTransport } from './backend/ws-transport';
import { TERMINAL_VIEW_FACTORY } from './terminal/terminal-view';
import { XtermView } from './terminal/xterm-view';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Web build talks WebSocket; the desktop build will provide IpcTransport instead.
    { provide: BACKEND_TRANSPORT, useClass: WsTransport },
    // Real xterm.js terminals; component tests provide FakeTerminalView.
    { provide: TERMINAL_VIEW_FACTORY, useValue: () => new XtermView() },
  ],
};
