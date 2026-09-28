import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startServerRegistry } from '../server-registry.js';

// This fork: each server records whose it is and when it was last used.
describe('server registry', () => {
  test('writes a record at start, at the first tool call, and on an update', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'server-registry-')));
    const registry = startServerRegistry('abc1234 · 2026-09-28 10:00', dir);
    const file = path.join(dir, `${process.pid}.json`);
    const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));

    const started = read();
    expect(started.pid).toBe(process.pid);
    expect(started.parentPid).toBe(process.ppid);
    expect(started.cwd).toBe(process.cwd());
    expect(started.build).toBe('abc1234 · 2026-09-28 10:00');
    expect(started.calls).toBe(0);
    expect(started.lastActiveAt).toBeUndefined();

    registry.touch('eval_server_runtime');
    const used = read();
    expect(used.calls).toBe(1);
    expect(used.lastTool).toBe('eval_server_runtime');
    expect(typeof used.lastActiveAt).toBe('string');

    registry.update({ bridge: 'primary on port 58741' });
    expect(read().bridge).toBe('primary on port 58741');
  });
});
