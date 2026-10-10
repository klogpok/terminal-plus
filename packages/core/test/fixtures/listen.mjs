// Listens on a TCP port.
// Usage: node listen.mjs <port> [ipv4|ipv6|any]
// ipv4 = 127.0.0.1, ipv6 = ::1, any = all addresses (default). Prints "LISTENING <host>:<port>".
import net from 'node:net';

const port = Number(process.argv[2]);
const mode = process.argv[3] ?? 'any';
const host = { ipv4: '127.0.0.1', ipv6: '::1', any: undefined }[mode];

const server = net.createServer((socket) => socket.end());
server.listen({ port, host }, () => {
  console.log(`LISTENING ${host ?? '*'}:${port}`);
});
