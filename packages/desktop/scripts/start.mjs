// Starts the built app in Electron. VS Code and Claude Code set ELECTRON_RUN_AS_NODE=1 in their
// terminals, which makes electron.exe run as plain Node, so it is removed for the child.
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(electronPath, [desktopDir, ...process.argv.slice(2)], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
