import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeService } from '../bridge-service.js';
import { RobloxStudioTools } from '../tools/index.js';
import {
  compareHeapSnapshots,
  heapChunkScript,
  parseHeapChunk,
  parseHeapSnapshot,
  summarizeHeapSnapshot,
} from '../heap-snapshot.js';
import type { HeapSnapshot } from '../heap-snapshot.js';

// A small report in the shape Studio's HeapProfilerService produced (September 2026).
function report(overrides: { total?: number; wallet?: number; leaked?: number; name?: string } = {}): HeapSnapshot {
  return {
    Report: {
      Version: 1,
      Graph: {
        Name: 'root',
        Size: 0,
        TotalSize: overrides.total ?? 5000,
        Children: [
          { Name: 'Module @ReplicatedStorage.Shared.Wallet', Size: 100, TotalSize: overrides.wallet ?? 3000, Children: [
            { Name: 'table cache', Size: 2000, TotalSize: 2500 },
          ] },
          { Name: overrides.name ?? 'Module @ReplicatedStorage.Shared.Shop', Size: 50, TotalSize: 1500 },
          { Name: 'registry', Size: 10, TotalSize: 500 },
        ],
      },
      MemcatBreakdown: [
        { Name: 'Wallet', Count: 10, Size: overrides.wallet ?? 3000 },
        { Name: 'Shop', Count: 5, Size: 1500 },
      ],
      TagBreakdown: [
        { Name: 'table', Count: 40, Size: 4000 },
        { Name: 'function', Count: 20, Size: 1000 },
      ],
      UserdataBreakdown: [
        { Name: 'Part', Count: overrides.leaked ?? 2, Size: (overrides.leaked ?? 2) * 32 },
      ],
    },
    Refs: {
      Version: 1,
      Roots: [],
      UnparentedReferences: [
        { Name: 'Part', Count: overrides.leaked ?? 2, Instances: overrides.leaked ?? 2, Paths: ["from function 'spawn' field 'upvalue'", 'second path'] },
      ],
    },
  };
}

describe('summarizeHeapSnapshot', () => {
  it('ranks what holds memory and keeps the reference paths short', () => {
    const summary = summarizeHeapSnapshot(report(), 2);
    expect(summary.total_bytes).toBe(5000);
    expect(summary.memory_categories.map((e) => e.name)).toEqual(['Wallet', 'Shop']);
    expect(summary.types[0]).toEqual({ name: 'table', count: 40, bytes: 4000 });
    expect(summary.largest_roots).toHaveLength(2);
    expect(summary.largest_roots[0]).toMatchObject({ name: 'Module @ReplicatedStorage.Shared.Wallet', bytes: 3000, own_bytes: 100 });
    expect(summary.largest_roots[0].largest_children).toEqual([{ name: 'table cache', bytes: 2500 }]);
    expect(summary.unparented.total).toBe(2);
    expect(summary.unparented.entries[0].paths).toHaveLength(2);
  });

  it('treats missing sections as empty', () => {
    const summary = summarizeHeapSnapshot({});
    expect(summary.total_bytes).toBe(0);
    expect(summary.memory_categories).toEqual([]);
    expect(summary.unparented).toEqual({ total: 0, entries: [] });
  });
});

describe('compareHeapSnapshots', () => {
  it('puts what grew first, and reports unparented instances that appeared', () => {
    const comparison = compareHeapSnapshots(report(), report({ total: 9000, wallet: 7000, leaked: 12 }));
    expect(comparison.total_bytes_delta).toBe(4000);
    expect(comparison.memory_categories[0]).toMatchObject({ name: 'Wallet', bytes_before: 3000, bytes_after: 7000, bytes_delta: 4000 });
    expect(comparison.roots[0]).toMatchObject({ name: 'Module @ReplicatedStorage.Shared.Wallet', bytes_delta: 4000 });
    expect(comparison.unparented).toMatchObject({ total_before: 2, total_after: 12 });
    expect(comparison.unparented.grown[0]).toMatchObject({ name: 'Part', count_delta: 10 });
  });

  it('shows a root that appeared and one that went', () => {
    const comparison = compareHeapSnapshots(report(), report({ name: 'Module @ReplicatedStorage.Shared.Bank' }));
    const names = comparison.roots.map((e) => [e.name, e.bytes_delta]);
    expect(names).toContainEqual(['Module @ReplicatedStorage.Shared.Bank', 1500]);
    expect(names).toContainEqual(['Module @ReplicatedStorage.Shared.Shop', -1500]);
  });
});

describe('heap snapshot chunks', () => {
  it('reads the last byte and the text back from a reply', () => {
    expect(parseHeapChunk('12:{"a":":b"}')).toEqual({ last: 12, text: '{"a":":b"}' });
    expect(() => parseHeapChunk('no colon')).toThrow('malformed');
  });

  it('asks the peer for a chunk that ends on a character boundary', () => {
    const script = heapChunkScript('k', 1, 10);
    expect(script).toContain('b < 0x80 or b >= 0xC0');
    expect(script).toContain('string.sub(s, 1, last)');
  });
});

// A play peer that answers capture_heap_snapshot's Luau the way Studio does: the report stays in
// its _G and is read back in byte ranges that stretch to the next UTF-8 character boundary.
function fakePeer(raw: Buffer) {
  const stored = new Map<string, Buffer>();
  const calls: string[] = [];
  return {
    calls,
    answer(code: string): { success: boolean; returnValue?: string; error?: string } {
      calls.push(code.includes('HeapProfilerService') ? 'capture' : code.includes('= nil') ? 'release' : 'chunk');
      const key = /_G\["([^"]+)"\]/.exec(code)?.[1] ?? '';
      if (code.includes('HeapProfilerService')) {
        stored.set(key, raw);
        return { success: true, returnValue: String(raw.length) };
      }
      if (code.includes('= nil')) {
        stored.delete(key);
        return { success: true, returnValue: 'released' };
      }
      const s = stored.get(key)!;
      const to = Number(/math\.min\((\d+), #s\)/.exec(code)![1]);
      const from = Number(/string\.sub\(s, (\d+), last\)/.exec(code)![1]);
      let last = Math.min(to, s.length);
      while (last < s.length && s[last] >= 0x80 && s[last] < 0xc0) last += 1;
      return { success: true, returnValue: `${last}:${s.subarray(from - 1, last).toString('utf8')}` };
    },
  };
}

async function serve(bridge: BridgeService, transportPeerId: string, peer: ReturnType<typeof fakePeer>, done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
    const queued = bridge.claimNextRequestForTransport(transportPeerId, 'heap-test');
    if (!queued) continue;
    expect(queued.endpoint).toBe('/api/execute-luau');
    bridge.resolveRequest(queued.requestId, peer.answer((queued.data as { code: string }).code));
  }
}

describe('capture_heap_snapshot', () => {
  const EDIT = {
    peerId: 'session-1', transportPeerId: 'session-1', instanceId: 'instance:test', role: 'edit',
    placeId: 0, placeName: 'TestPlace', dataModelName: 'TestPlace', isRunning: false,
    pluginVersion: 'test-version', pluginVariant: 'main', timestamp: Date.now(),
  };
  const SERVER = {
    peerId: 'server-1', transportPeerId: 'server-1', instanceId: 'instance:test', role: 'server',
    placeId: 0, placeName: 'TestPlace', dataModelName: 'Game', isRunning: true,
  };

  it('reads the report in chunks, writes it whole, and returns a summary and a comparison', async () => {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    bridge.registerPeer(EDIT);
    bridge.registerPeer(SERVER);
    // Big enough for several chunks, with multi-byte characters to land on chunk edges.
    const padding = Array.from({ length: 9000 }, (_, i) => ({ Name: `Modulé ☃ ${i}`, Count: 1, Size: 1 }));
    const after = report({ total: 9000, wallet: 7000, leaked: 12 });
    after.Report!.TagBreakdown = [...after.Report!.TagBreakdown!, ...padding];
    const raw = Buffer.from(JSON.stringify(after), 'utf8');
    expect(raw.length).toBeGreaterThan(400_000);
    const peer = fakePeer(raw);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsmcp-heap-'));
    const beforePath = path.join(dir, 'before.json');
    fs.writeFileSync(beforePath, JSON.stringify(report()), 'utf8');
    const outputPath = path.join(dir, 'after.json');

    let settled = false;
    const promise = tools.captureHeapSnapshot('server', { output_path: outputPath, compare_path: beforePath, top: 3 }, 'instance:test')
      .finally(() => { settled = true; });
    await serve(bridge, 'server-1', peer, () => settled);
    const body = JSON.parse((await promise).content[0].text);

    expect(peer.calls[0]).toBe('capture');
    expect(peer.calls.filter((c) => c === 'chunk').length).toBeGreaterThanOrEqual(3);
    expect(peer.calls[peer.calls.length - 1]).toBe('release');
    expect(fs.readFileSync(outputPath)).toEqual(raw);
    expect(body).toMatchObject({ target: 'server', output_path: path.resolve(outputPath), snapshot_bytes: raw.length });
    expect(body.summary.total_bytes).toBe(9000);
    expect(body.comparison.memory_categories[0]).toMatchObject({ name: 'Wallet', bytes_delta: 4000 });
    expect(body.comparison.unparented.grown[0]).toMatchObject({ name: 'Part', count_delta: 10 });
    expect(parseHeapSnapshot(fs.readFileSync(outputPath, 'utf8')).Report?.Graph?.TotalSize).toBe(9000);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses the edit peer', async () => {
    const tools = new RobloxStudioTools(new BridgeService());
    await expect(tools.captureHeapSnapshot('edit')).rejects.toThrow('only a running play peer');
  });

  it('releases the report on the peer even when reading it fails', async () => {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    bridge.registerPeer(EDIT);
    bridge.registerPeer(SERVER);
    const peer = fakePeer(Buffer.from('{"Report":{}}', 'utf8'));
    const failing = {
      calls: peer.calls,
      answer(code: string) {
        if (!code.includes('HeapProfilerService') && !code.includes('= nil')) {
          peer.calls.push('chunk');
          return { success: false, error: 'boom' };
        }
        return peer.answer(code);
      },
    };
    let settled = false;
    const promise = tools.captureHeapSnapshot('server', {}, 'instance:test').finally(() => { settled = true; });
    const served = serve(bridge, 'server-1', failing as ReturnType<typeof fakePeer>, () => settled);
    await expect(promise).rejects.toThrow('boom');
    await served;
    expect(peer.calls[peer.calls.length - 1]).toBe('release');
  });
});
