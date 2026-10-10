/**
 * The desktop shell: the folder picker and opening folders/URLs on the user's machine. A browser
 * cannot return a folder path or be trusted to open things, so these always run in the backend
 * (spec: "Opening folders and URLs always goes through the backend"). `core` takes it as an option;
 * tests inject a fake so no real dialog, Explorer window or browser ever opens. Electron (stage 6)
 * will pass an implementation over `dialog.showOpenDialog` / `shell.openPath` / `shell.openExternal`.
 */
import { execFile, spawn } from 'node:child_process';

export interface DesktopShell {
  /** Shows a folder picker; resolves with the chosen folder, or `undefined` when cancelled. */
  pickFolder(): Promise<string | undefined>;
  /** Opens a folder in Explorer. */
  openFolder(folder: string): Promise<void>;
  /** Opens an http(s) URL in the default browser. */
  openUrl(url: string): Promise<void>;
}

// STA is required by WinForms dialogs. The hidden TopMost owner form brings the dialog in front of
// the browser. Output is UTF-8 so non-ASCII (e.g. Cyrillic) paths survive.
const PICK_FOLDER_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$dialog.Description = 'DevPanel'",
  '$dialog.ShowNewFolderButton = $false',
  "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }",
  '$owner.Dispose()',
].join('; ');

function detached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Windows implementation: PowerShell FolderBrowserDialog, explorer.exe, url.dll. */
export const windowsShell: DesktopShell = {
  pickFolder() {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', PICK_FOLDER_SCRIPT],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error) return reject(error);
          const picked = stdout.trim();
          resolve(picked === '' ? undefined : picked);
        },
      );
    });
  },

  openFolder(folder) {
    return detached('explorer.exe', [folder]);
  },

  openUrl(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Promise.reject(new Error(`Refusing to open a non-http(s) URL: ${url}`));
    }
    // Same effect as `start "" <url>`, but without cmd.exe parsing the URL (`&`, `%`, `^`).
    return detached('rundll32.exe', ['url.dll,FileProtocolHandler', parsed.href]);
  },
};
