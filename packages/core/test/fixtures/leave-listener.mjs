// Starts a TCP listener that escapes the Service's process tree, then keeps running.
// Usage: node leave-listener.mjs <port>
// A short-lived middle process spawns the listener detached and exits, so the listener's parent is
// gone and `taskkill /T` on the Service does not reach it: the port stays taken after a Stop.
// Prints "PID=<listener pid> LEFT" (the test harness kills that PID on dispose).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.argv[2];

if (process.argv[3] === 'middle') {
  const listener = spawn(process.execPath, [path.join(here, 'listen.mjs'), port, 'any'], {
    detached: true,
    stdio: 'ignore',
  });
  listener.unref();
  process.stdout.write(String(listener.pid));
  process.exit(0);
}

const middle = spawn(process.execPath, [fileURLToPath(import.meta.url), port, 'middle'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
let out = '';
middle.stdout.on('data', (d) => (out += d));
middle.on('exit', () => console.log(`PID=${out.trim()} LEFT`));
setInterval(() => {}, 1000);
