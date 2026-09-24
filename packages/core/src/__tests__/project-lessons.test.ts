import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ENGINE_LESSONS, ENGINE_LESSON_COUNT } from '../knowledge/engine-lessons.js';
import { RobloxStudioTools, filterLessons, readProjectLessons } from '../tools/index.js';

// The tool holds no state, so a bare prototype is enough to exercise it.
const tools = Object.create(RobloxStudioTools.prototype) as RobloxStudioTools;

type Body = {
  engine: { count: number; lessons: string };
  project: { source: string | null; count?: number; lessons?: string; note?: string; looked_in?: string[] };
  domain?: string;
};

async function lessons(domain?: string, lessonsPath?: string): Promise<Body> {
  const result = await tools.getProjectLessons(domain, lessonsPath);
  return JSON.parse(result.content[0].text) as Body;
}

const PROJECT = [
  '# Lessons',
  '',
  'NET       Our lobby remote fires twice on respawn',
  '          → debounce by character, not by player',
  'SHOP      Prices live on the server',
].join('\n');

describe('engine lessons', () => {
  it('are compiled in and name no game or framework', () => {
    expect(ENGINE_LESSON_COUNT).toBeGreaterThan(20);
    for (const word of ['roblox-core', 'Oreworks', 'Globeshot', 'Toyforge', 'Systems.start', 'Util.Holds']) {
      expect(ENGINE_LESSONS).not.toContain(word);
    }
  });

  it('give every lesson a line format the filter understands', () => {
    expect(filterLessons(ENGINE_LESSONS, '').count).toBe(ENGINE_LESSON_COUNT);
  });
});

describe('filterLessons', () => {
  it('keeps the arrow line with the lesson it belongs to', () => {
    // Half a lesson is worse than none: the arrow is what to do instead.
    const net = filterLessons(PROJECT, 'net');
    expect(net.count).toBe(1);
    expect(net.text.split('\n')[1].trim().startsWith('→')).toBe(true);
  });

  it('reads Windows line endings', () => {
    expect(filterLessons(PROJECT.replace(/\n/g, '\r\n'), 'NET').count).toBe(1);
    expect(filterLessons(PROJECT.replace(/\n/g, '\r\n'), '').count).toBe(2);
  });

  it('says so when nothing matches', () => {
    expect(filterLessons(PROJECT, 'NOPE')).toEqual({ count: 0, text: 'No lesson mentions "NOPE".' });
  });
});

describe('get_project_lessons', () => {
  let dir: string;
  const cwd = process.cwd();
  const env = process.env.ROBLOX_PROJECT_LESSONS;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsmcp-lessons-'));
    delete process.env.ROBLOX_PROJECT_LESSONS;
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    if (env === undefined) delete process.env.ROBLOX_PROJECT_LESSONS;
    else process.env.ROBLOX_PROJECT_LESSONS = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the engine lessons and explains how to add a project file when there is none', async () => {
    const body = await lessons();
    expect(body.engine.count).toBe(ENGINE_LESSON_COUNT);
    expect(body.project.source).toBeNull();
    expect(body.project.note).toContain('LESSONS.md');
    expect(body.project.looked_in).toHaveLength(2);
  });

  it("reads the project's LESSONS.md at call time, so an edit shows up without a rebuild", async () => {
    fs.writeFileSync(path.join(dir, 'LESSONS.md'), PROJECT);
    expect((await lessons()).project.count).toBe(2);
    fs.writeFileSync(path.join(dir, 'LESSONS.md'), `${PROJECT}\nUI        Buttons need a hover state\n`);
    expect((await lessons()).project.count).toBe(3);
  });

  it('finds docs/LESSONS.md too', async () => {
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'LESSONS.md'), PROJECT);
    expect((await lessons()).project.source).toBe(path.join(fs.realpathSync(dir), 'docs', 'LESSONS.md'));
  });

  it('filters both sources with one domain', async () => {
    fs.writeFileSync(path.join(dir, 'LESSONS.md'), PROJECT);
    const body = await lessons('net');
    expect(body.domain).toBe('NET');
    expect(body.project.count).toBe(1);
    expect(body.engine.count).toBeGreaterThan(0);
    expect(body.engine.count).toBeLessThan(ENGINE_LESSON_COUNT);
  });

  it('takes an explicit path, then the environment variable', async () => {
    fs.writeFileSync(path.join(dir, 'team.md'), PROJECT);
    expect((await lessons(undefined, 'team.md')).project.count).toBe(2);
    process.env.ROBLOX_PROJECT_LESSONS = path.join(dir, 'team.md');
    expect((await lessons()).project.count).toBe(2);
  });

  it('reads only Markdown, and only a bounded file', () => {
    fs.writeFileSync(path.join(dir, 'secret.env'), 'TOKEN=1');
    expect(readProjectLessons('secret.env', {}, dir).text).toBeUndefined();
    fs.writeFileSync(path.join(dir, 'big.md'), 'x'.repeat(300 * 1024));
    const big = readProjectLessons('big.md', {}, dir);
    expect(big.text).toBeUndefined();
    expect(big.note).toContain('bytes');
  });
});
