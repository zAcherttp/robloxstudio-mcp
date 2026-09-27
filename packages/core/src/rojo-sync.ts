// Whether Studio is running what is on disk: a Rojo project's scripts compared with the Studio
// edit session's, by content.
//
// A Rojo server that answers says nothing about the Studio plugin, which can disconnect (or the
// server crash on a deleted folder) and leave Studio running old code while every playtest looks
// like a test of the new. So check_rojo reads the project file, works out which instance each
// script file becomes (Rojo's own naming rules, below), hashes both sides with the same exact
// 32-bit FNV-1a, and reports what differs, what is only on disk and what is only in Studio.
//
// Rojo's rules for a directory mapped with $path, as far as scripts go:
//   name.server.luau / name.server.lua   Script "name"
//   name.client.luau / name.client.lua   LocalScript "name"
//   name.luau / name.lua                 ModuleScript "name" (so "Foo.spec.luau" is "Foo.spec")
//   init.server.luau, init.client.luau,  the directory itself becomes that script
//   init.luau (and .lua)
// A child node in the project tree replaces a same-named child of its parent's directory. Anything
// else (models, JSON, text, nested projects) is not a script and is left out; a nested
// default.project.json is reported, since Rojo would read that directory differently.

import * as fs from 'fs';
import * as path from 'path';

export type ScriptEntry = {
  // The instance's names from the service down, e.g. ["ReplicatedStorage", "Shared", "Config"].
  instance: string[];
  file: string;
  bytes: number;
  hash: number;
};

export type RojoProject = {
  name: string;
  file: string;
  servePort: number;
  // The DataModel paths the project maps a directory or file onto.
  roots: string[][];
  scripts: ScriptEntry[];
  notes: string[];
};

export type StudioScript = { instance: string[]; bytes: number; hash: number };
export type StudioReport = { found: StudioScript[]; missing: string[][]; extra: string[][] };

export type SyncResult = {
  in_sync: boolean;
  compared: number;
  differ: { instance: string; file: string; studio_bytes: number; disk_bytes: number }[];
  only_on_disk: { instance: string; file: string }[];
  only_in_studio: string[];
};

/** Exact 32-bit FNV-1a over bytes. The Luau side computes the same with bit32. */
export function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const SCRIPT = /^(.*?)(\.server|\.client)?\.(luau|lua)$/;

function scriptName(file: string): { name: string; init: boolean } | undefined {
  const match = SCRIPT.exec(file);
  if (!match) return undefined;
  return { name: match[1], init: match[1] === 'init' };
}

function entry(instance: string[], file: string): ScriptEntry {
  const data = fs.readFileSync(file);
  return { instance, file, bytes: data.length, hash: fnv1a(data) };
}

// Every script under a directory mapped onto `instance`, leaving out children the tree replaces.
function walkDirectory(dir: string, instance: string[], replaced: Set<string>, out: ScriptEntry[], notes: string[]) {
  const names = fs.readdirSync(dir).sort();
  if (dir !== '' && names.includes('default.project.json')) {
    notes.push(`${dir} holds its own default.project.json; Rojo reads it as a nested project, which check_rojo does not follow`);
    return;
  }
  for (const child of names) {
    const full = path.join(dir, child);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!replaced.has(child)) walkDirectory(full, [...instance, child], new Set(), out, notes);
      continue;
    }
    const script = scriptName(child);
    if (!script) continue;
    if (script.init) {
      out.push(entry(instance, full));
    } else if (!replaced.has(script.name)) {
      out.push(entry([...instance, script.name], full));
    }
  }
}

type TreeNode = { $path?: string; [child: string]: unknown };

function walkTree(node: TreeNode, instance: string[], base: string, roots: string[][], out: ScriptEntry[], notes: string[]) {
  const children = Object.keys(node).filter((key) => !key.startsWith('$'));
  if (typeof node.$path === 'string') {
    const target = path.resolve(base, node.$path);
    roots.push(instance);
    if (!fs.existsSync(target)) {
      notes.push(`${instance.join('.')} maps ${node.$path}, which does not exist`);
    } else if (fs.statSync(target).isDirectory()) {
      walkDirectory(target, instance, new Set(children), out, notes);
    } else if (scriptName(path.basename(target))) {
      out.push(entry(instance, target));
    }
  }
  for (const child of children) {
    const value = node[child];
    if (value && typeof value === 'object') walkTree(value as TreeNode, [...instance, child], base, roots, out, notes);
  }
}

/** A Rojo project's scripts, hashed, with the DataModel roots it maps. */
export function readRojoProject(projectFile: string): RojoProject {
  const file = path.resolve(projectFile);
  const project = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; servePort?: number; tree?: TreeNode };
  if (!project.tree || typeof project.tree !== 'object') throw new Error(`${file} has no tree`);
  const roots: string[][] = [];
  const scripts: ScriptEntry[] = [];
  const notes: string[] = [];
  const base = path.dirname(file);
  // The tree's root is the DataModel: its children are services.
  for (const service of Object.keys(project.tree).filter((key) => !key.startsWith('$'))) {
    walkTree(project.tree[service] as TreeNode, [service], base, roots, scripts, notes);
  }
  return {
    name: project.name ?? path.basename(base),
    file,
    servePort: typeof project.servePort === 'number' ? project.servePort : 34872,
    roots,
    scripts,
    notes,
  };
}

/**
 * Luau for the edit session: finds each expected script by its names, hashes its Source, and
 * lists any other script under the mapped roots. Returns JSON (a StudioReport).
 */
export function studioSyncScript(expected: string[][], roots: string[][]): string {
  const data = JSON.stringify({ expected, roots });
  return `
local HttpService = game:GetService("HttpService")
local data = HttpService:JSONDecode(${JSON.stringify(data)})
local function fnv(s)
  local h = 2166136261
  for i = 1, #s do
    h = bit32.bxor(h, string.byte(s, i))
    -- h * 16777619 mod 2^32, exactly: 16777619 = 2^24 + 403, and h * 403 < 2^53.
    h = (bit32.lshift(h, 24) + h * 403) % 4294967296
  end
  return h
end
local function find(names)
  local ok, node = pcall(function() return game:GetService(names[1]) end)
  if not ok or not node then node = game:FindFirstChild(names[1]) end
  for i = 2, #names do
    if not node then return nil end
    node = node:FindFirstChild(names[i])
  end
  return node
end
local function key(names) return table.concat(names, "\\0") end
local wanted = {}
local found, missing, extra = {}, {}, {}
for _, names in data.expected do
  wanted[key(names)] = true
  local node = find(names)
  if node and node:IsA("LuaSourceContainer") then
    local source = node.Source
    table.insert(found, { instance = names, bytes = #source, hash = fnv(source) })
  else
    table.insert(missing, names)
  end
end
local seen = {}
for _, names in data.roots do
  local root = find(names)
  if root then
    local function visit(node, path)
      local k = key(path)
      if node:IsA("LuaSourceContainer") and not wanted[k] and not seen[k] then
        seen[k] = true
        table.insert(extra, path)
      end
      for _, child in node:GetChildren() do
        local next = table.clone(path)
        table.insert(next, child.Name)
        visit(child, next)
      end
    end
    visit(root, table.clone(names))
  end
end
return HttpService:JSONEncode({ found = found, missing = missing, extra = extra })
`;
}

/** The project's scripts against what the edit session reported. */
export function compareSync(project: RojoProject, report: StudioReport, limit = 50): SyncResult {
  const dotted = (names: string[]) => names.join('.');
  const byInstance = new Map(project.scripts.map((script) => [dotted(script.instance), script]));
  const differ: SyncResult['differ'] = [];
  for (const studio of report.found ?? []) {
    const disk = byInstance.get(dotted(studio.instance));
    if (disk && (disk.hash !== studio.hash || disk.bytes !== studio.bytes)) {
      differ.push({ instance: dotted(studio.instance), file: disk.file, studio_bytes: studio.bytes, disk_bytes: disk.bytes });
    }
  }
  const onlyOnDisk = (report.missing ?? []).map((names) => ({
    instance: dotted(names),
    file: byInstance.get(dotted(names))?.file ?? '',
  }));
  const onlyInStudio = (report.extra ?? []).map(dotted);
  return {
    in_sync: differ.length === 0 && onlyOnDisk.length === 0 && onlyInStudio.length === 0,
    compared: project.scripts.length,
    differ: differ.slice(0, limit),
    only_on_disk: onlyOnDisk.slice(0, limit),
    only_in_studio: onlyInStudio.slice(0, limit),
  };
}
