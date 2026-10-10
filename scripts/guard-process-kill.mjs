// PreToolUse hook for Claude Code (Bash and PowerShell tools).
// Blocks killing processes by name or pattern; killing an explicit PID stays allowed.
// Exit code 2 blocks the tool call and shows stderr to the agent.
import { readFileSync } from 'node:fs';

const BY_NAME = [
  [/\btaskkill\b[^|;&\n]*\s[/-]im\b/i, 'taskkill /IM'],
  [/\btaskkill\b[^|;&\n]*\s[/-]fi\b/i, 'taskkill /FI'],
  [/\bStop-Process\b[^|;&\n]*-(Name|ProcessName)\b/i, 'Stop-Process -Name'],
  [/\|\s*(Stop-Process|kill|spps)\b/i, 'piping processes into Stop-Process'],
  [/\b(Get-Process|gps|ps)\b[^\n]*\|[^\n]*\.Kill\(/i, 'Get-Process ... .Kill()'],
  [/\bInvoke-CimMethod\b[^\n]*Terminate/i, 'Invoke-CimMethod Terminate'],
  [/\bwmic\b[^\n]*\b(delete|terminate)\b/i, 'wmic delete/terminate'],
  [/\b(pkill|killall)\b/i, 'pkill/killall'],
];

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {
  process.exit(0);
}

for (const [pattern, label] of BY_NAME) {
  if (pattern.test(command)) {
    process.stderr.write(
      `Blocked: ${label} kills processes by name or pattern and can hit the user's own processes. ` +
        'Kill only PIDs you spawned yourself, e.g. `taskkill /PID <pid> /T /F` or `Stop-Process -Id <pid>`.\n',
    );
    process.exit(2);
  }
}
process.exit(0);
