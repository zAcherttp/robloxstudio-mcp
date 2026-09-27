import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compareSync, fnv1a, readRojoProject, studioSyncScript } from '../rojo-sync.js';
import { findRojoProject } from '../tools/index.js';

function project(files: Record<string, string>, tree: unknown, extra: Record<string, unknown> = {}): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rojo-sync-')));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  fs.writeFileSync(path.join(dir, 'default.project.json'), JSON.stringify({ name: 'Game', tree, ...extra }));
  return dir;
}

const TREE = {
  $className: 'DataModel',
  ReplicatedStorage: {
    Shared: {
      $path: 'src/shared',
      Core: { $path: 'core/shared' },
    },
  },
  ServerScriptService: { Server: { $path: 'src/server' } },
  StarterPlayer: { StarterPlayerScripts: { Client: { $path: 'src/client' } } },
};

const FILES = {
  'src/shared/Config.luau': 'return {}\n',
  'src/shared/Modules/Sim.luau': 'return 1\n',
  'src/shared/Modules/Sim.spec.luau': 'return 2\n',
  'src/shared/Modules/Readme.md': 'not a script',
  'src/shared/Core/Stale.luau': 'replaced by the tree',
  'core/shared/Net/init.luau': 'return "net"\n',
  'src/server/init.server.luau': 'print("server")\n',
  'src/server/Systems/Tanks/init.luau': 'return {}\n',
  'src/client/init.client.luau': 'print("client")\n',
  'src/client/Legacy.client.lua': 'print("lua")\n',
};

function names(dir: string): string[] {
  return readRojoProject(path.join(dir, 'default.project.json')).scripts.map((script) => script.instance.join('.')).sort();
}

describe('check_rojo: reading a Rojo project', () => {
  test("maps script files the way Rojo does, and lets the tree replace a folder's child", () => {
    const dir = project(FILES, TREE);
    expect(names(dir)).toEqual([
      'ReplicatedStorage.Shared.Config',
      'ReplicatedStorage.Shared.Core.Net',
      'ReplicatedStorage.Shared.Modules.Sim',
      'ReplicatedStorage.Shared.Modules.Sim.spec',
      'ServerScriptService.Server',
      'ServerScriptService.Server.Systems.Tanks',
      'StarterPlayer.StarterPlayerScripts.Client',
      'StarterPlayer.StarterPlayerScripts.Client.Legacy',
    ]);
    const rojo = readRojoProject(path.join(dir, 'default.project.json'));
    expect(rojo.roots.map((root) => root.join('.'))).toEqual([
      'ReplicatedStorage.Shared',
      'ReplicatedStorage.Shared.Core',
      'ServerScriptService.Server',
      'StarterPlayer.StarterPlayerScripts.Client',
    ]);
    expect(rojo.servePort).toBe(34872);
  });

  test('reads servePort, and notes a mapped path that is missing', () => {
    const dir = project({}, { ReplicatedStorage: { Shared: { $path: 'nowhere' } } }, { servePort: 34873 });
    const rojo = readRojoProject(path.join(dir, 'default.project.json'));
    expect(rojo.servePort).toBe(34873);
    expect(rojo.notes.join(' ')).toContain('does not exist');
  });

  test('finds default.project.json in a folder, and says so when there is none', () => {
    const dir = project(FILES, TREE);
    expect(findRojoProject(dir)).toBe(path.join(dir, 'default.project.json'));
    expect(findRojoProject(undefined, dir)).toBe(path.join(dir, 'default.project.json'));
    expect(() => findRojoProject(path.join(dir, 'src'))).toThrow(/no Rojo project/);
  });
});

describe('check_rojo: hashing', () => {
  test('is 32-bit FNV-1a', () => {
    expect(fnv1a(Buffer.from(''))).toBe(0x811c9dc5);
    expect(fnv1a(Buffer.from('a'))).toBe(0xe40c292c);
    expect(fnv1a(Buffer.from('foobar'))).toBe(0xbf9cf968);
  });

  test("matches the Luau side's arithmetic (h * 16777619 as h << 24 plus h * 403)", () => {
    const luau = (bytes: Uint8Array) => {
      let h = 2166136261;
      for (const byte of bytes) {
        h = (h ^ byte) >>> 0;
        h = ((((h << 24) >>> 0) + h * 403) % 4294967296);
      }
      return h;
    };
    for (const text of ['', 'return {}\n', 'é ünïcode ✓', 'x'.repeat(5000)]) {
      const bytes = Buffer.from(text, 'utf8');
      expect(luau(bytes)).toBe(fnv1a(bytes));
    }
  });

  test('builds Luau that carries the expected paths and hashes with bit32', () => {
    const code = studioSyncScript([['ReplicatedStorage', 'Shared', 'Config']], [['ReplicatedStorage', 'Shared']]);
    expect(code).toContain('bit32.lshift(h, 24)');
    expect(code).toContain('ReplicatedStorage');
  });
});

describe('check_rojo: comparing', () => {
  const dir = project(FILES, TREE);
  const rojo = readRojoProject(path.join(dir, 'default.project.json'));
  const all = rojo.scripts.map((script) => ({ instance: script.instance, bytes: script.bytes, hash: script.hash }));

  test('is in sync when Studio has every script, the same', () => {
    const result = compareSync(rojo, { found: all, missing: [], extra: [] });
    expect(result).toMatchObject({ in_sync: true, compared: 8, differ: [], only_on_disk: [], only_in_studio: [] });
  });

  test('names what differs, what is only on disk and what is only in Studio', () => {
    const [first, second, ...rest] = all;
    const result = compareSync(rojo, {
      found: [{ ...first, bytes: first.bytes + 3, hash: 1 }, ...rest],
      missing: [second.instance],
      extra: [['ServerScriptService', 'Server', 'Systems', 'Parking']],
    });
    expect(result.in_sync).toBe(false);
    expect(result.differ).toEqual([{ instance: first.instance.join('.'), file: expect.stringContaining('.lua'), studio_bytes: first.bytes + 3, disk_bytes: first.bytes }]);
    expect(result.only_on_disk).toEqual([{ instance: second.instance.join('.'), file: expect.stringContaining('.lua') }]);
    expect(result.only_in_studio).toEqual(['ServerScriptService.Server.Systems.Parking']);
  });
});
