// This fork: rarely used tools are listed only after more_tools enables them.
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createToolServer, publicToolDefinition } from '../mcp-runtime.js';
import { DEFERRED_TOOLS, getAllTools, TOOL_DEFINITIONS } from '../tools/definitions.js';
import type { RobloxStudioTools } from '../tools/index.js';

async function connect(config: { name: string; version: string; tools: typeof TOOL_DEFINITIONS }) {
  const server = createToolServer({
    config,
    getTools: () => ({} as RobloxStudioTools),
    era: 'modern',
    invoke: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }),
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe('deferred tools', () => {
  test('every deferred name is a real tool', () => {
    const names = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
    for (const name of DEFERRED_TOOLS) expect(names.has(name)).toBe(true);
  });

  test('the listed catalog stays small', () => {
    const listed = getAllTools().filter((tool) => !DEFERRED_TOOLS.has(tool.name)).map(publicToolDefinition);
    expect(listed).toHaveLength(29);
    // Under half the full catalog: 26,213 characters of 54,979 when deferral went in.
    expect(JSON.stringify(listed).length).toBeLessThanOrEqual(26_500);
  });

  test('more_tools lists them, enables by name, and the next server keeps them enabled', async () => {
    const config = { name: 'test-server', version: '3.0.0', tools: TOOL_DEFINITIONS };
    const client = await connect(config);
    try {
      let names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('execute_luau');
      expect(names).toContain('more_tools');
      expect(names).not.toContain('grep_scripts');

      const listing = await client.callTool({ name: 'more_tools', arguments: {} });
      expect((listing.content as { text: string }[])[0].text).toMatch(/^capture_micro_profiler: /m);

      const enabled = await client.callTool({ name: 'more_tools', arguments: { enable: ['grep_scripts', 'nope'] } });
      expect((enabled.content as { text: string }[])[0].text).toBe('Enabled: grep_scripts. Not deferred or unknown: nope.');
      names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('grep_scripts');
      expect((await client.callTool({ name: 'grep_scripts', arguments: { pattern: 'x' } })).isError).toBeFalsy();
    } finally {
      await client.close();
    }

    const next = await connect(config);
    try {
      expect((await next.listTools()).tools.map((tool) => tool.name)).toContain('grep_scripts');
    } finally {
      await next.close();
    }
  });
});
