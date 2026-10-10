// Ignores Ctrl+C and keeps running until killed.
// Usage: node ignore-sigint.mjs
process.on('SIGINT', () => console.log('IGNORED_SIGINT'));
console.log(`PID=${process.pid}`);
setInterval(() => {}, 1000);
