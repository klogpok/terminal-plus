// Exits with a given code after a delay.
// Usage: node exit-after.mjs <delayMs> <exitCode>
const delay = Number(process.argv[2] ?? 0);
const code = Number(process.argv[3] ?? 0);

console.log(`EXITING_IN ${delay} WITH ${code}`);
setTimeout(() => process.exit(code), delay);
