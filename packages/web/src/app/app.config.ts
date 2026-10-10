import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { WsTransport } from './backend/ws-transport';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Web build talks WebSocket; the desktop build will provide IpcTransport instead.
    { provide: BACKEND_TRANSPORT, useClass: WsTransport },
  ],
};
