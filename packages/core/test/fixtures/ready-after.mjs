// Prints a ready line after a delay, then keeps running.
// Usage: node ready-after.mjs <delayMs> [line]
const delay = Number(process.argv[2] ?? 0);
const line = process.argv[3] ?? 'READY';

setTimeout(() => console.log(line), delay);
setInterval(() => {}, 1000);
