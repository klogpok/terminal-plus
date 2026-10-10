/**
 * The one way `core` reads JSON files. Windows tools (Notepad, PowerShell 5.1) often save UTF-8
 * with a byte order mark, which `JSON.parse` rejects; it is stripped here.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const BOM = '﻿';

/** Parses JSON text, ignoring a leading UTF-8 byte order mark. */
export function parseJson(text: string): unknown {
  return JSON.parse(text.startsWith(BOM) ? text.slice(BOM.length) : text);
}

/** Reads and parses a JSON file. Rejects like `readFile` (e.g. ENOENT) or `JSON.parse`. */
export async function readJsonFile(file: string): Promise<unknown> {
  return parseJson(await readFile(file, 'utf8'));
}

/** Synchronous `readJsonFile`. */
export function readJsonFileSync(file: string): unknown {
  return parseJson(readFileSync(file, 'utf8'));
}
