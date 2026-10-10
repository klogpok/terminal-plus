// Prints the working directory name and FORCE_COLOR, then keeps running.
// Usage: node print-env.mjs
import path from 'node:path';

console.log(`CWD_NAME=${path.basename(process.cwd())} FORCE_COLOR=${process.env.FORCE_COLOR ?? ''}`);
setInterval(() => {}, 1000);
