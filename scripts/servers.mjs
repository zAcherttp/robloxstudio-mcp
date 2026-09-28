#!/usr/bin/env node
// This fork: list the robloxstudio-mcp servers running on this machine, from the files each writes
// (packages/core/src/server-registry.ts), so it is clear whose each is and which can be stopped.
//
//   npm run servers            the table
//   npm run servers -- --prune remove files left by servers that are gone (killed with SIGKILL)
//   npm run servers -- --json  the records, with alive/stale/idle worked out
//
// "stale": built from another commit than the build on disk (it runs old code until restarted).
// Stopping one: `kill <pid>` ends it; the client that started it starts a fresh one on its next
// tool call (Claude Code does). The primary owns Studio's bridge port; stopping it hands the port
// to another server within seconds.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = process.env.ROBLOX_MCP_REGISTRY_DIR || path.join(os.homedir(), '.robloxstudio-mcp', 'servers');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let current;
try {
  current = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8')).label;
} catch {
  current = undefined;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const ago = (iso) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
};

const home = os.homedir();
const short = (p) => (p && p.startsWith(home) ? `~${p.slice(home.length)}` : p);

let files = [];
try {
  files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
} catch {
  files = [];
}
const records = [];
for (const f of files) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    r.alive = alive(r.pid);
    r.stale = current !== undefined && r.build !== current;
    records.push({ file: path.join(dir, f), ...r });
  } catch {
    // A half-written file: skip it.
  }
}

if (process.argv.includes('--prune')) {
  for (const r of records.filter((x) => !x.alive)) fs.rmSync(r.file, { force: true });
  console.log(`removed ${records.filter((x) => !x.alive).length} file(s) of servers that are gone`);
  process.exit(0);
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(records, null, 2));
  process.exit(0);
}
if (records.length === 0) {
  console.log(`no servers recorded in ${short(dir)}`);
  process.exit(0);
}

records.sort((a, b) => Date.parse(b.lastActiveAt ?? b.startedAt) - Date.parse(a.lastActiveAt ?? a.startedAt));
console.log(`build on disk: ${current ?? 'unknown'}\n`);
for (const r of records) {
  const flags = [r.alive ? null : 'GONE', r.alive && r.stale ? 'STALE' : null].filter(Boolean).join(' ');
  console.log(`${String(r.pid).padEnd(7)} ${flags.padEnd(6)} ${short(r.cwd)}`);
  console.log(`        last tool ${ago(r.lastActiveAt)}${r.lastTool ? ` (${r.lastTool}, ${r.calls} calls)` : ''}, started ${ago(r.startedAt)}, ${r.bridge ?? 'bridge ?'}`);
  console.log(`        build ${r.build ?? '?'}${r.session ? `, session ${r.session}` : ''}${r.client ? ` (${r.client})` : ''}, parent ${r.parentPid}`);
}
const gone = records.filter((x) => !x.alive).length;
if (gone) console.log(`\n${gone} gone: npm run servers -- --prune`);
