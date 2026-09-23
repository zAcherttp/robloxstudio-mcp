// Fork build stamp: which commit a build came from, and when.
//
// The plugin panel shows the plugin's stamp and the server's side by side, so a stale build is
// visible at a glance: the plugin and the server are built separately (npm run build and
// npm run build:plugin), and either can lag. The stamp is taken when a build runs, not when the
// server starts, so a server launched after a commit but not rebuilt still shows the commit its
// code came from. A trailing + means the working tree had uncommitted changes.
//
// Run directly, it writes build-info.json at the repo root (gitignored), which the server reads at
// startup; build-plugin.mjs imports buildStamp() for the plugin.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function buildStamp() {
  const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const builtAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const source = `${commit}${dirty ? '+' : ''}`;
  return { source, commit, dirty, builtAt, label: `${source} ${builtAt}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stamp = buildStamp();
  writeFileSync(join(rootDir, 'build-info.json'), `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
  console.log(`build stamp: ${stamp.label}`);
}
