// HTTP server whose /health answers 503 until a delay has passed, then 200.
// Usage: node serve-health.mjs <port> <healthyAfterMs>
// Prints "HIT <n>" for every request so tests can count health polls.
import http from 'node:http';

const port = Number(process.argv[2]);
const healthyAfter = Number(process.argv[3] ?? 0);
const startedAt = Date.now();
let hits = 0;

const server = http.createServer((req, res) => {
  hits += 1;
  console.log(`HIT ${hits}`);
  const healthy = Date.now() - startedAt >= healthyAfter;
  res.writeHead(healthy ? 200 : 503, { 'content-type': 'text/plain' });
  res.end(healthy ? 'ok' : 'not yet');
});
server.listen({ port, host: '127.0.0.1' }, () => console.log(`SERVING 127.0.0.1:${port}`));
