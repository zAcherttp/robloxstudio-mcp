import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readEvalPrelude } from '../tools/index.js';

// A project's eval prelude (this fork): read from .robloxstudio/ in the launch directory.
describe('eval prelude', () => {
  function dir(files: Record<string, string | Buffer>): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-prelude-')));
    for (const [name, body] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    }
    return root;
  }

  test('reads each side from its own file', () => {
    const root = dir({
      '.robloxstudio/eval-prelude.server.luau': '_G.run = function() end',
      '.robloxstudio/eval-prelude.client.luau': '_G.me = true',
    });
    expect(readEvalPrelude('server', root)).toBe('_G.run = function() end');
    expect(readEvalPrelude('client', root)).toBe('_G.me = true');
  });

  test('is no prelude when missing, a directory, or over 64 KB', () => {
    expect(readEvalPrelude('server', dir({}))).toBeUndefined();
    const withDir = dir({ '.robloxstudio/eval-prelude.server.luau/keep': '' });
    expect(readEvalPrelude('server', withDir)).toBeUndefined();
    const big = dir({ '.robloxstudio/eval-prelude.client.luau': Buffer.alloc(64 * 1024 + 1, 45) });
    expect(readEvalPrelude('client', big)).toBeUndefined();
  });
});
