// Echoes every stdin line back as "ECHO:<line>".
// Usage: node echo-stdin.mjs
import readline from 'node:readline';

console.log('ECHO_READY');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => console.log(`ECHO:${line}`));
