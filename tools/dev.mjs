// Starts the game server (8100) and the Vite client (5200) together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const procs = [
  spawn(npm, ['run', 'dev', '-w', '@floors/server'], { stdio: 'inherit', shell: isWin }),
  spawn(npm, ['run', 'dev', '-w', '@floors/client'], { stdio: 'inherit', shell: isWin }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill();
  process.exit(code);
}
for (const p of procs) p.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
