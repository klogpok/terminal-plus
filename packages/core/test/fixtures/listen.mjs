// Listens on a TCP port, optionally after a delay.
// Usage: node listen.mjs <port> [ipv4|ipv6|any] [delayMs]
// ipv4 = 127.0.0.1, ipv6 = ::1, any = all addresses (default). Prints "LISTENING <host>:<port>".
import net from 'node:net';

const port = Number(process.argv[2]);
const mode = process.argv[3] ?? 'any';
const delay = Number(process.argv[4] ?? 0);
const host = { ipv4: '127.0.0.1', ipv6: '::1', any: undefined }[mode];

setTimeout(() => {
  const server = net.createServer((socket) => socket.end());
  server.listen({ port, host }, () => {
    console.log(`LISTENING ${host ?? '*'}:${port}`);
  });
}, delay);
setInterval(() => {}, 1000);
