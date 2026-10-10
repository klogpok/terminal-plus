export {
  DevPanelCore,
  DEFAULT_TIMINGS,
  REPO_COLORS,
  type CoreEvents,
  type CoreOptions,
  type CoreTimings,
} from './core.js';
export type {
  ExitEvent,
  LogEvent,
  RepoChangedEvent,
  RepoView,
  ServiceView,
  Snapshot,
  StatusChangedEvent,
} from '@devpanel/shared';
export { REPO_CONFIG_FILE, type ServiceDefinition } from './config.js';
export { WORKSPACE_FILE } from './workspace.js';
export { windowsShell, type DesktopShell } from './shell.js';
export { localConfigPath } from './local-config.js';
