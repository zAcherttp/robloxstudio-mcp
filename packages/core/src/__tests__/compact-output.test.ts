// This fork's compact tool replies: what an agent acts on by default, the full envelope with
// verbose. Direct method calls keep upstream's full output; the tool handlers ask for compact.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeService } from '../bridge-service.js';
import { TOOL_HANDLERS } from '../http-server.js';
import { authFromLogText, studioAuthForProcess } from '../studio-log.js';
import { RobloxStudioTools } from './test-tools.js';

const EDIT = {
  peerId: 'session-1',
  transportPeerId: 'session-1',
  instanceId: 'instance:test',
  role: 'edit',
  placeId: 0,
  placeName: 'TestPlace',
  dataModelName: 'TestPlace',
  isRunning: false,
  pluginVersion: 'test-version',
  pluginVariant: 'main',
};

const client = (n: number) => ({
  ...EDIT,
  peerId: `client-${n}`,
  transportPeerId: 'server-1',
  role: 'client',
  isRunning: true,
});

function claim(bridge: BridgeService, transportPeerId: string) {
  return bridge.claimNextRequestForTransport(transportPeerId, 'compact-test');
}

function textOf(result: unknown): Record<string, unknown> {
  return JSON.parse((result as { content: { text: string }[] }).content[0].text);
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe('set_network_profile compact', () => {
  test('ms sets the round trip on a connected client in one line', async () => {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    bridge.registerPeer(EDIT);
    bridge.registerPeer(client(1));
    const pending = TOOL_HANDLERS.set_network_profile(tools, { ms: 100 });
    await flush();
    const queued = claim(bridge, 'server-1');
    expect(queued?.endpoint).toBe('/api/execute-luau');
    expect((queued?.data as { code: string }).code).toContain('"InboundNetworkMinDelayMs\\":50');
    bridge.resolveRequest(queued!.requestId, { success: true, returnValue: JSON.stringify({ after: {} }) });
    expect(textOf(await pending)).toEqual({
      set: 'client-1: rtt 100 ms (in 50/out 50), jitter 0/0 ms, loss 0/0%',
    });
  });

  test('before Play the profile is kept and applied when the client joins', async () => {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    bridge.registerPeer(EDIT);
    const body = textOf(await TOOL_HANDLERS.set_network_profile(tools, { ms: 0 }));
    expect(body).toEqual({ set: 'pending for client-1 when it joins: rtt 0 ms (in 0/out 0), jitter 0/0 ms, loss 0/0%' });
    expect(claim(bridge, 'session-1')).toBeNull();

    bridge.registerPeer(client(1));
    await flush();
    const queued = claim(bridge, 'server-1');
    expect(queued?.endpoint).toBe('/api/execute-luau');
    expect((queued?.data as { code: string }).code).toContain('NetworkSettings');
    bridge.resolveRequest(queued!.requestId, { success: true, returnValue: JSON.stringify({ after: {} }) });

    // client-1's profile was applied once; a second client gets nothing.
    bridge.registerPeer(client(2));
    await flush();
    expect(claim(bridge, 'server-1')).toBeNull();
  });

  test('requires profile or ms', async () => {
    const tools = new RobloxStudioTools(new BridgeService());
    await expect(tools.setNetworkProfile(undefined, 'client-1')).rejects.toThrow(/profile or ms/);
  });
});

describe('get_runtime_logs compact', () => {
  async function read(body: Record<string, unknown>) {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    bridge.registerPeer(EDIT);
    const pending = TOOL_HANDLERS.get_runtime_logs(tools, { instance_id: 'instance:test', ...body });
    await flush();
    const queued = claim(bridge, 'session-1');
    bridge.resolveRequest(queued!.requestId, {
      entries: [
        { seq: 1, ts: 1, level: 'INFO', message: 'Studio chatter' },
        { seq: 2, ts: 2, level: 'OUT', message: 'Eclipse Animator loaded' },
        { seq: 3, ts: 3, level: 'OUT', message: 'PASS combo' },
        { seq: 4, ts: 4, level: 'WARN', message: 'slow frame' },
        { seq: 5, ts: 5, level: 'ERR', message: 'PASS combo 2' },
      ],
      totalDropped: 0,
      nextSince: 5,
    });
    return textOf(await pending);
  }

  test('drops noise, timestamps and the cursor', async () => {
    expect(await read({})).toEqual({ entries: ['PASS combo', 'W: slow frame', 'E: PASS combo 2'] });
  });

  test('exact keeps whole-message matches; exclude and tail apply after noise', async () => {
    expect(await read({ filter: 'PASS combo', exact: true })).toEqual({ entries: ['PASS combo'] });
    expect(await read({ exclude: ['slow'], tail: 1 })).toEqual({ entries: ['E: PASS combo 2'] });
  });

  test('the cursor comes back when asked', async () => {
    const body = await read({ next_cursor: true });
    expect(typeof body.nextCursor).toBe('string');
  });
});

describe('Studio sign-in from its log', () => {
  test('the last Authenticated line wins', () => {
    expect(authFromLogText('x [FLog::StudioTimingLog] Authenticated : NO\ny\n[FLog::StudioTimingLog] Authenticated : YES\n')).toBe('YES');
    expect(authFromLogText('[FLog::StudioTimingLog] Authenticated : NO\n')).toBe('NO');
    expect(authFromLogText('nothing here')).toBeUndefined();
  });

  test('without the process, the log begun after launch that names the place', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-log-'));
    try {
      const launchedAt = Date.now();
      fs.writeFileSync(path.join(dir, 'a_Studio_1_last.log'), 'RobloxStudio other.rbxl\n[FLog::StudioTimingLog] Authenticated : NO\n');
      fs.writeFileSync(path.join(dir, 'b_Studio_2_last.log'), 'RobloxStudio /tmp/mine.rbxl\n[FLog::StudioTimingLog] Authenticated : YES\n');
      expect(studioAuthForProcess({ launchedAt, placeFile: '/tmp/mine.rbxl', directory: dir })).toBe('YES');
      expect(studioAuthForProcess({ launchedAt, placeFile: 'other.rbxl', directory: dir })).toBe('NO');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
