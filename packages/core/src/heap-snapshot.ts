// Luau heap snapshots: HeapProfilerService's report, read and compared on the MCP host.
//
// A snapshot is the engine's JSON report of one Luau VM's heap. It is several hundred KB, so it is
// never returned whole: capture_heap_snapshot writes it to a file and returns this summary, and
// can compare it with an earlier file, which is how a leak is confirmed (a "before" and an
// "after" around the action suspected of leaking).
//
// The report's shape, as Studio produced it in September 2026:
//
//   Report.Graph                   { Name, Size, TotalSize, Children[] } - the retention tree;
//                                  Size is the node's own bytes, TotalSize includes its children
//   Report.MemcatBreakdown         [{ Name, Count, Size }] - by memory category (script names by
//                                  default, joined with commas when scripts share one)
//   Report.TagBreakdown            [{ Name, Count, Size }] - by Luau type (table, function, ...)
//   Report.UserdataBreakdown       [{ Name, Count, Size }] - by userdata type (Instance classes,
//                                  Vector3, CFrame, ...)
//   Refs.UnparentedReferences      [{ Name, Count, Instances, Paths[] }] - Instances held by Luau
//                                  but not in the DataModel, with the reference chains holding them
//   Refs.Roots                     [{ Name, Count, Instances, Paths[] }]
//
// Anything missing is treated as empty, so a report from another engine version still summarises.

export type HeapBreakdownEntry = { Name: string; Count: number; Size: number };
export type HeapGraphNode = { Name: string; Size: number; TotalSize: number; Children?: HeapGraphNode[] };
export type HeapReference = { Name: string; Count: number; Instances?: number; Paths?: string[] };

export type HeapSnapshot = {
  Report?: {
    Graph?: HeapGraphNode;
    MemcatBreakdown?: HeapBreakdownEntry[];
    TagBreakdown?: HeapBreakdownEntry[];
    UserdataBreakdown?: HeapBreakdownEntry[];
    Version?: unknown;
  };
  Refs?: {
    Roots?: HeapReference[];
    UnparentedReferences?: HeapReference[];
    Version?: unknown;
  };
};

export type HeapEntrySummary = { name: string; count: number; bytes: number };
export type HeapNodeSummary = { name: string; bytes: number; own_bytes: number; largest_children?: { name: string; bytes: number }[] };
export type HeapReferenceSummary = { name: string; count: number; instances: number; paths: string[] };

export type HeapSummary = {
  total_bytes: number;
  memory_categories: HeapEntrySummary[];
  types: HeapEntrySummary[];
  userdata: HeapEntrySummary[];
  largest_roots: HeapNodeSummary[];
  unparented: { total: number; entries: HeapReferenceSummary[] };
};

export type HeapDeltaEntry = { name: string; bytes_before: number; bytes_after: number; bytes_delta: number; count_delta: number };
export type HeapComparison = {
  total_bytes_before: number;
  total_bytes_after: number;
  total_bytes_delta: number;
  memory_categories: HeapDeltaEntry[];
  types: HeapDeltaEntry[];
  userdata: HeapDeltaEntry[];
  roots: HeapDeltaEntry[];
  unparented: { total_before: number; total_after: number; grown: HeapDeltaEntry[] };
};

const PATH_CHARS = 240;
const PATHS_PER_REFERENCE = 2;

function list<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bySize(entries: HeapBreakdownEntry[], top: number): HeapEntrySummary[] {
  return [...entries]
    .sort((a, b) => num(b.Size) - num(a.Size))
    .slice(0, top)
    .map((e) => ({ name: String(e.Name ?? ''), count: num(e.Count), bytes: num(e.Size) }));
}

export function parseHeapSnapshot(raw: string): HeapSnapshot {
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('the heap snapshot is not a JSON object');
  }
  return value as HeapSnapshot;
}

export function unparentedTotal(snapshot: HeapSnapshot): number {
  return list(snapshot.Refs?.UnparentedReferences).reduce((sum, r) => sum + num(r.Instances ?? r.Count), 0);
}

export function summarizeHeapSnapshot(snapshot: HeapSnapshot, top = 10): HeapSummary {
  const report = snapshot.Report ?? {};
  const graph = report.Graph;
  const roots = [...list(graph?.Children)].sort((a, b) => num(b.TotalSize) - num(a.TotalSize)).slice(0, top);
  const unparented = [...list(snapshot.Refs?.UnparentedReferences)]
    .sort((a, b) => num(b.Instances ?? b.Count) - num(a.Instances ?? a.Count));
  return {
    total_bytes: num(graph?.TotalSize),
    memory_categories: bySize(list(report.MemcatBreakdown), top),
    types: bySize(list(report.TagBreakdown), top),
    userdata: bySize(list(report.UserdataBreakdown), top),
    largest_roots: roots.map((node, index) => {
      const summary: HeapNodeSummary = { name: String(node.Name ?? ''), bytes: num(node.TotalSize), own_bytes: num(node.Size) };
      // One level down for the biggest few, which is usually where the answer is.
      if (index < 3) {
        summary.largest_children = [...list(node.Children)]
          .sort((a, b) => num(b.TotalSize) - num(a.TotalSize))
          .slice(0, 3)
          .map((child) => ({ name: String(child.Name ?? ''), bytes: num(child.TotalSize) }));
      }
      return summary;
    }),
    unparented: {
      total: unparentedTotal(snapshot),
      entries: unparented.slice(0, top).map((r) => ({
        name: String(r.Name ?? ''),
        count: num(r.Count),
        instances: num(r.Instances ?? r.Count),
        paths: list(r.Paths).slice(0, PATHS_PER_REFERENCE).map((p) => String(p).slice(0, PATH_CHARS)),
      })),
    },
  };
}

function deltas(
  before: { name: string; bytes: number; count: number }[],
  after: { name: string; bytes: number; count: number }[],
  top: number,
): HeapDeltaEntry[] {
  const merged = new Map<string, HeapDeltaEntry>();
  for (const e of before) {
    merged.set(e.name, { name: e.name, bytes_before: e.bytes, bytes_after: 0, bytes_delta: -e.bytes, count_delta: -e.count });
  }
  for (const e of after) {
    const existing = merged.get(e.name);
    if (existing) {
      existing.bytes_after = e.bytes;
      existing.bytes_delta = e.bytes - existing.bytes_before;
      existing.count_delta += e.count;
    } else {
      merged.set(e.name, { name: e.name, bytes_before: 0, bytes_after: e.bytes, bytes_delta: e.bytes, count_delta: e.count });
    }
  }
  // Growth first: a leak is something that grew. Largest absolute change breaks ties.
  return [...merged.values()]
    .filter((e) => e.bytes_delta !== 0 || e.count_delta !== 0)
    .sort((a, b) => b.bytes_delta - a.bytes_delta || Math.abs(b.count_delta) - Math.abs(a.count_delta))
    .slice(0, top);
}

function entries(value: HeapBreakdownEntry[] | undefined) {
  return list(value).map((e) => ({ name: String(e.Name ?? ''), bytes: num(e.Size), count: num(e.Count) }));
}

function rootEntries(snapshot: HeapSnapshot) {
  return list(snapshot.Report?.Graph?.Children).map((n) => ({ name: String(n.Name ?? ''), bytes: num(n.TotalSize), count: 1 }));
}

function referenceEntries(snapshot: HeapSnapshot) {
  return list(snapshot.Refs?.UnparentedReferences).map((r) => ({ name: String(r.Name ?? ''), bytes: 0, count: num(r.Instances ?? r.Count) }));
}

export function compareHeapSnapshots(before: HeapSnapshot, after: HeapSnapshot, top = 10): HeapComparison {
  const totalBefore = num(before.Report?.Graph?.TotalSize);
  const totalAfter = num(after.Report?.Graph?.TotalSize);
  return {
    total_bytes_before: totalBefore,
    total_bytes_after: totalAfter,
    total_bytes_delta: totalAfter - totalBefore,
    memory_categories: deltas(entries(before.Report?.MemcatBreakdown), entries(after.Report?.MemcatBreakdown), top),
    types: deltas(entries(before.Report?.TagBreakdown), entries(after.Report?.TagBreakdown), top),
    userdata: deltas(entries(before.Report?.UserdataBreakdown), entries(after.Report?.UserdataBreakdown), top),
    roots: deltas(rootEntries(before), rootEntries(after), top),
    unparented: {
      total_before: unparentedTotal(before),
      total_after: unparentedTotal(after),
      grown: deltas(referenceEntries(before), referenceEntries(after), top).filter((e) => e.count_delta > 0),
    },
  };
}

// The Luau run on the target peer through execute_luau, which runs as the plugin: the eval tools'
// threads lack the Plugin capability HeapProfilerService requires. The report stays in the peer's
// _G under `key` and is read back in chunks, so no single reply carries the whole of it.
export function heapCaptureScript(key: string): string {
  return [
    'local HeapProfilerService = game:GetService("HeapProfilerService")',
    'local RunService = game:GetService("RunService")',
    'local raw',
    'if RunService:IsClient() then',
    '  raw = HeapProfilerService:ClientRequestDataAsync(game:GetService("Players").LocalPlayer)',
    'else',
    '  raw = HeapProfilerService:ServerRequestDataAsync()',
    'end',
    `_G[${JSON.stringify(key)}] = raw`,
    'return #raw',
  ].join('\n');
}

// Returns "<last byte>:<text>" for bytes `from` to about `to`. The report is UTF-8 and string.sub
// counts bytes, so the chunk is stretched to end on a character boundary: a character split
// across two replies would arrive as two broken halves.
export function heapChunkScript(key: string, from: number, to: number): string {
  return [
    `local s = _G[${JSON.stringify(key)}]`,
    `local last = math.min(${to}, #s)`,
    'while last < #s do',
    '  local b = string.byte(s, last + 1)',
    '  if b < 0x80 or b >= 0xC0 then break end',
    '  last += 1',
    'end',
    `return last .. ":" .. string.sub(s, ${from}, last)`,
  ].join('\n');
}

// Splits a chunk reply into the last byte it covers and its text.
export function parseHeapChunk(reply: string): { last: number; text: string } {
  const colon = reply.indexOf(':');
  const last = Number(reply.slice(0, colon));
  if (colon <= 0 || !Number.isSafeInteger(last)) throw new Error('malformed heap snapshot chunk');
  return { last, text: reply.slice(colon + 1) };
}

export function heapReleaseScript(key: string): string {
  return `_G[${JSON.stringify(key)}] = nil\nreturn "released"`;
}
