// Studio sign-in state for one Studio process, read from that process's own log (this fork).
// Studio writes "[FLog::StudioTimingLog] Authenticated : NO" early and "... : YES" once sign-in
// completes; the last such line is the state. Agents used to find it by grepping the newest log
// by guess, which picks the wrong file as soon as two Studios run.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export type StudioAuth = 'YES' | 'NO';

const AUTH_LINE = /\[FLog::StudioTimingLog\] Authenticated : (YES|NO)/g;
// The sign-in lines come within the first seconds; a log can grow to many megabytes after.
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

export function studioLogDirectory(): string | undefined {
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Logs', 'Roblox');
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Roblox', 'logs');
  }
  return undefined;
}

export function authFromLogText(text: string): StudioAuth | undefined {
  let last: StudioAuth | undefined;
  for (const match of text.matchAll(AUTH_LINE)) last = match[1] as StudioAuth;
  return last;
}

function readHead(file: string): string {
  const fd = openSync(file, 'r');
  try {
    const size = Math.min(statSync(file).size, MAX_SCAN_BYTES);
    const buffer = Buffer.alloc(size);
    readSync(fd, buffer, 0, size, 0);
    return buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

// The log file a running Studio process holds open (macOS: lsof names it exactly).
function openLogOf(pid: number, directory: string): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  try {
    const out = execFileSync('lsof', ['-p', String(pid), '-Fn'], { encoding: 'utf8', timeout: 3000 });
    return out.split('\n')
      .filter((line) => line.startsWith('n'))
      .map((line) => line.slice(1))
      .find((file) => file.startsWith(directory + path.sep) && /_Studio_.*\.log$/.test(file));
  } catch {
    return undefined;
  }
}

// Without the process (it exited, or lsof is unavailable): the newest Studio log begun at or after
// the launch, whose command line names the place file when there is one.
function logStartedAfter(directory: string, launchedAt: number, placeFile?: string): string | undefined {
  let entries: { file: string; mtime: number; birth: number }[];
  try {
    entries = readdirSync(directory)
      .filter((name) => /_Studio_.*\.log$/.test(name))
      .map((name) => {
        const file = path.join(directory, name);
        const stat = statSync(file);
        return { file, mtime: stat.mtimeMs, birth: stat.birthtimeMs || stat.ctimeMs };
      });
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((entry) => entry.birth >= launchedAt - 5_000)
    .sort((a, b) => a.birth - b.birth);
  for (const entry of candidates) {
    if (!placeFile) return entry.file;
    try {
      if (readHead(entry.file).slice(0, 8192).includes(placeFile)) return entry.file;
    } catch {
      // Unreadable: try the next one.
    }
  }
  return undefined;
}

export function studioAuthForProcess(
  options: { pid?: number; launchedAt?: number; placeFile?: string; directory?: string },
): StudioAuth | undefined {
  const directory = options.directory ?? studioLogDirectory();
  if (!directory) return undefined;
  const file = (options.pid !== undefined ? openLogOf(options.pid, directory) : undefined)
    ?? (options.launchedAt !== undefined ? logStartedAfter(directory, options.launchedAt, options.placeFile) : undefined);
  if (!file) return undefined;
  try {
    return authFromLogText(readHead(file));
  } catch {
    return undefined;
  }
}
