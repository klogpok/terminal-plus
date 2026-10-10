// Prints "LINE 1" .. "LINE <count>", then "DONE", then keeps running.
// Usage: node print-lines.mjs <count>
const count = Number(process.argv[2] ?? 10);
let text = '';
for (let i = 1; i <= count; i++) text += `LINE ${i}\n`;
process.stdout.write(text + 'DONE\n');
setInterval(() => {}, 1000);
