import { CORE_LESSONS, CORE_LESSON_COUNT } from '../knowledge/lessons.js';
import { RobloxStudioTools } from '../tools/index.js';

// The tool holds no state, so a bare prototype is enough to exercise it.
const tools = Object.create(RobloxStudioTools.prototype) as RobloxStudioTools;

async function lessons(domain?: string) {
  const result = await (tools as any).getCoreLessons(domain);
  return JSON.parse(result.content[0].text) as { count: number; lessons: string; domain?: string };
}

describe('get_core_lessons', () => {
  it('ships the lessons compiled in, not read from a checkout', () => {
    // The point of vendoring: a machine with the MCP and no framework still answers.
    expect(CORE_LESSONS.length).toBeGreaterThan(0);
    expect(CORE_LESSON_COUNT).toBeGreaterThan(0);
  });

  it('returns every lesson when no domain is given', async () => {
    const all = await lessons();
    expect(all.count).toBe(CORE_LESSON_COUNT);
    expect(all.lessons).toBe(CORE_LESSONS);
  });

  it('filters to one domain', async () => {
    const properties = await lessons('PROPERTY');
    expect(properties.count).toBeGreaterThan(0);
    expect(properties.count).toBeLessThan(CORE_LESSON_COUNT);
    expect(properties.lessons).toContain('Motor6D.Transform');
  });

  it('keeps the arrow line with the lesson it belongs to', async () => {
    // Half a lesson is worse than none: the arrow is what to do instead.
    const properties = await lessons('PROPERTY');
    const lines = properties.lessons.split('\n');
    const first = lines.findIndex((line) => /^PROPERTY {2}/.test(line));
    expect(lines[first + 1]?.trim().startsWith('→')).toBe(true);
  });

  it('is case insensitive', async () => {
    const upper = await lessons('STATE');
    const lower = await lessons('state');
    expect(lower.lessons).toBe(upper.lessons);
  });

  it('says so plainly when nothing matches', async () => {
    const none = await lessons('nosuchdomain');
    expect(none.count).toBe(0);
    expect(none.lessons).toContain('No lesson mentions');
  });
});
