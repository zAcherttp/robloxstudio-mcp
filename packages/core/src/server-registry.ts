// This fork: one small file per running server, so a person can tell whose each server is, what
// it runs, and whether it is still used, and decide which to stop. Every MCP client session starts
// its own stdio server (Claude Code starts one per session, in every project when the server is
// configured at user level), and a server keeps the code it started with until it exits.
//
// ~/.robloxstudio-mcp/servers/<pid>.json (ROBLOX_MCP_REGISTRY_DIR to move it) holds the process,
// its parent, the directory and session it was started for, its build, whether it owns Studio's
// bridge port or relays through the one that does, and when it last ran a tool. Written at start,
// at most every FLUSH_MS while tools run, and removed on exit; a file left by a killed process is
// found by `npm run servers` (scripts/servers.mjs), which checks each pid.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FLUSH_MS = 5000;

export interface ServerRecord {
  pid: number;
  parentPid: number;
  cwd: string;
  session?: string;
  client?: string;
  build?: string;
  startedAt: string;
  bridge?: string;
  lastActiveAt?: string;
  lastTool?: string;
  calls: number;
}

export function registryDir(): string {
  return process.env.ROBLOX_MCP_REGISTRY_DIR || path.join(os.homedir(), '.robloxstudio-mcp', 'servers');
}

export interface ServerRegistry {
  // A tool call started now.
  touch(tool: string): void;
  // Something else about the server changed (its bridge mode).
  update(fields: Partial<ServerRecord>): void;
}

// Never lets the registry break the server: every write is best effort.
export function startServerRegistry(build?: string, dir: string = registryDir()): ServerRegistry {
  const file = path.join(dir, `${process.pid}.json`);
  const record: ServerRecord = {
    pid: process.pid,
    parentPid: process.ppid,
    cwd: process.cwd(),
    session: process.env.CLAUDE_CODE_HOST_SESSION_ID || undefined,
    client: process.env.CLAUDE_CODE_ENTRYPOINT || undefined,
    build,
    startedAt: new Date().toISOString(),
    calls: 0,
  };
  let timer: NodeJS.Timeout | undefined;

  const write = () => {
    timer = undefined;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(record, null, 2));
      fs.renameSync(temp, file);
    } catch {
      // A read-only home or a full disk must not stop the server.
    }
  };
  const later = () => {
    if (!timer) {
      timer = setTimeout(write, FLUSH_MS);
      timer.unref();
    }
  };

  write();
  process.on('exit', () => {
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone.
    }
  });
  // The server's own shutdown (SIGTERM, SIGINT, SIGHUP, stdin closing) ends in process.exit, which
  // fires 'exit'; a SIGKILL leaves the file, and the listing finds its pid gone.

  return {
    touch(tool: string) {
      const first = record.calls === 0;
      record.calls += 1;
      record.lastTool = tool;
      record.lastActiveAt = new Date().toISOString();
      if (first) write();
      else later();
    },
    update(fields: Partial<ServerRecord>) {
      Object.assign(record, fields);
      write();
    },
  };
}
