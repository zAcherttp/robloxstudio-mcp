// This fork: Luau from a file, and background evals read back by job id.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BridgeService } from '../bridge-service.js';
import { TOOL_HANDLERS } from '../http-server.js';
import { buildEvalJobLuau, buildEvalJobStatusLuau, readLuauSource } from '../tools/index.js';
import { RobloxStudioTools } from './test-tools.js';

describe('readLuauSource', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luau-file-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('reads a .luau file relative to the project', () => {
    fs.writeFileSync(path.join(dir, 'probe.luau'), 'return 1 + 1\n');
    expect(readLuauSource(undefined, 'probe.luau', 'eval_server_runtime', dir)).toBe('return 1 + 1\n');
    expect(readLuauSource('return 3', undefined, 'eval_server_runtime', dir)).toBe('return 3');
  });

  test('refuses both, other extensions and missing files', () => {
    expect(() => readLuauSource('x', 'probe.luau', 't', dir)).toThrow(/code or file, not both/);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    expect(() => readLuauSource(undefined, 'notes.txt', 't', dir)).toThrow(/\.luau or \.lua/);
    expect(() => readLuauSource(undefined, 'gone.luau', 't', dir)).toThrow(/not found/);
  });
});

describe('background eval jobs', () => {
  test('the wrapper keeps the caller\'s line numbers', () => {
    const code = 'local a = 1\nerror("boom")';
    const wrapped = buildEvalJobLuau(code, 'job1abcd');
    const lines = wrapped.split('\n');
    // Everything before the caller's code is on line 1, so line 2 is still the caller's line 2.
    expect(lines[0].endsWith('local a = 1')).toBe(true);
    expect(lines[1]).toBe('error("boom")');
    expect(wrapped).toContain('task.spawn(function()');
    expect(wrapped).toContain('return { job = __mcp_job_id');
  });

  test('status waits a bounded time and forgets a finished job', () => {
    const status = buildEvalJobStatusLuau('job1abcd', 5, 3);
    expect(status).toContain('os.clock() + 5');
    expect(status).toContain('for i = 3 + 1, #job.output');
    expect(status).toContain('_G.__mcp_jobs["job1abcd"] = nil');
  });

  test('background asks the plugin to keep the payload; job reads status in the same VM', async () => {
    const bridge = new BridgeService();
    const tools = new RobloxStudioTools(bridge);
    const request = jest.fn(async (..._args: unknown[]) => ({ bridge: 'ok', ok: true, result: { job: 'x', state: 'running' } }));
    (tools as unknown as { _callSingle: unknown })._callSingle = request;
    await TOOL_HANDLERS.eval_server_runtime(tools, { code: 'task.wait(60)', background: true });
    expect(request.mock.calls[0][0]).toBe('/api/eval-runtime');
    expect(request.mock.calls[0][1]).toMatchObject({ keepPayload: true });
    expect((request.mock.calls[0][1] as { code: string }).code).toContain('task.wait(60)');

    await TOOL_HANDLERS.eval_server_runtime(tools, { job: 'job1abcd', wait: 99 });
    const [, data, target, , timeoutMs] = request.mock.calls[1] as unknown as [string, { code: string }, string, unknown, number];
    expect(data.code).toContain('os.clock() + 25');
    expect(target).toBe('server');
    expect(timeoutMs).toBe(40_000);
    await expect(TOOL_HANDLERS.eval_server_runtime(tools, { job: 'bad id!' })).rejects.toThrow(/job must be/);
  });
});
