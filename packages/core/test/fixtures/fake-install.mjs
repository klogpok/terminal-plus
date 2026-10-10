// Stands in for `pnpm install`: prints its working directory name, then either creates
// node_modules and exits 0, or exits with the given non-zero code without creating it.
// Usage: node fake-install.mjs [exitCode]
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const code = Number(process.argv[2] ?? 0);
console.log(`INSTALL_IN=${path.basename(process.cwd())}`);
if (code === 0) {
  mkdirSync(path.join(process.cwd(), 'node_modules'), { recursive: true });
  console.log('INSTALL_DONE');
} else {
  console.log('INSTALL_FAILED');
}
process.exit(code);
