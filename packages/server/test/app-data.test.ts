import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appDataDirFrom } from '../src/index.js';

describe('the app data folder', () => {
  it('is DEVPANEL_APP_DATA when set', () => {
    expect(appDataDirFrom({ DEVPANEL_APP_DATA: 'D:\\Test\\AppData', APPDATA: 'C:\\Roaming' })).toBe('D:\\Test\\AppData');
  });

  it('is DevPanel under %APPDATA% by default', () => {
    expect(appDataDirFrom({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' })).toBe(
      path.join('C:\\Users\\a\\AppData\\Roaming', 'DevPanel'),
    );
  });

  it('without APPDATA is DevPanel in the home folder, never a relative path', () => {
    const dir = appDataDirFrom({});
    expect(dir).toBe(path.join(os.homedir(), 'DevPanel'));
    expect(path.isAbsolute(dir)).toBe(true);
  });
});
