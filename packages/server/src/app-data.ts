import os from 'node:os';
import path from 'node:path';

/**
 * The app data folder: DEVPANEL_APP_DATA, else DevPanel under %APPDATA%, else DevPanel in the
 * home folder (never a relative path). The web version and the desktop sidecar share it.
 */
export function appDataDirFrom(env: NodeJS.ProcessEnv): string {
  return env.DEVPANEL_APP_DATA ?? path.join(env.APPDATA ?? os.homedir(), 'DevPanel');
}
