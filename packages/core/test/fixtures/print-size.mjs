// Prints the console size as "SIZE=<cols>x<rows>" at start and whenever it changes, then keeps running.
// Node caches the console size and does not see ConPTY resizes, so this asks `mode con` instead.
// Usage: node print-size.mjs
import { execSync } from 'node:child_process';

let last = '';
const check = () => {
  const text = execSync('mode con', { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  // Lines, then Columns (labels are localized, the order is not).
  const [rows, cols] = [...text.matchAll(/:\s*(\d+)/g)].map((m) => m[1]);
  const size = `${cols}x${rows}`;
  if (size !== last) console.log(`SIZE=${(last = size)}`);
};
check();
setInterval(check, 200);
