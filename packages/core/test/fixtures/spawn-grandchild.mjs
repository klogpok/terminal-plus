// Spawns a grandchild Node process and keeps running.
// Usage: node spawn-grandchild.mjs [--ignore-sigint]
// Prints "CHILD_PID=<pid> GRANDCHILD_PID=<pid>". With --ignore-sigint both processes ignore Ctrl+C.
import { spawn } from 'node:child_process';

const ignoreSigint = process.argv.includes('--ignore-sigint');
const grandchildCode = ignoreSigint
  ? "process.on('SIGINT', () => {}); setInterval(() => {}, 1000);"
  : 'setInterval(() => {}, 1000);';

if (ignoreSigint) process.on('SIGINT', () => console.log('CHILD_IGNORED_SIGINT'));

const grandchild = spawn(process.execPath, ['-e', grandchildCode], { stdio: 'inherit' });
console.log(`CHILD_PID=${process.pid} GRANDCHILD_PID=${grandchild.pid}`);
setInterval(() => {}, 1000);
