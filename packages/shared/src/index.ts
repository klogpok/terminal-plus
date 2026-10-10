/**
 * Message contract and types shared by `core`, `server` and `web`.
 * The full command/event contract arrives with the WebSocket transport (ticket 02).
 */

/** Service Status, see GLOSSARY.md. */
export type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'stopping'
  | 'crashed'
  | 'exited';
