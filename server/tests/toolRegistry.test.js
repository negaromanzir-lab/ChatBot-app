// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createToolRegistry } from '../src/services/ai/toolRegistry.js';
import { createSearchWebTool } from '../src/services/ai/tools/searchWeb.tool.js';

describe('tool registry', () => {
  it('exposes only permitted tools and validates arguments before execution', async () => {
    const searchWeb = vi.fn().mockResolvedValue([{ title: 'Trusted source' }]);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = createToolRegistry({
      tools: [createSearchWebTool({ searchWeb })],
      log,
    });

    expect(registry.getAvailableTools()).toEqual([]);
    expect(registry.getAvailableTools(['web:search'])).toEqual([{
      name: 'searchWeb',
      description: expect.any(String),
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 200 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    }]);

    await expect(registry.execute('searchWeb', { query: ' latest guidance ' }, {
      permissions: ['web:search'],
      signal: 'request-signal',
    })).resolves.toEqual([{ title: 'Trusted source' }]);
    expect(searchWeb).toHaveBeenCalledWith('latest guidance', { signal: 'request-signal' });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'searchWeb', outcome: 'success' }),
      'Tool execution completed',
    );

    await expect(registry.execute('searchWeb', { query: 'x', arbitraryCode: 'run()' }, {
      permissions: ['web:search'],
    })).rejects.toMatchObject({ code: 'AI_TOOL_INVALID_ARGUMENTS' });
    expect(searchWeb).toHaveBeenCalledOnce();
  });

  it('rejects unpermitted and unknown tools without invoking handlers', async () => {
    const handler = vi.fn();
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = createToolRegistry({
      tools: [{
        name: 'safeLookup',
        description: 'Look up approved data.',
        inputSchema: z.object({ key: z.string() }).strict(),
        inputSchemaJson: { type: 'object' },
        permissions: ['data:read'],
        handler,
      }],
      log,
    });

    await expect(registry.execute('safeLookup', { key: 'value' }))
      .rejects.toMatchObject({ code: 'AI_TOOL_PERMISSION_DENIED' });
    await expect(registry.execute('runShell', {}))
      .rejects.toMatchObject({ code: 'AI_TOOL_UNKNOWN' });
    expect(handler).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid or duplicate server tool definitions at registration', () => {
    const tool = createSearchWebTool({ searchWeb: vi.fn() });
    expect(() => createToolRegistry({ tools: [tool, tool] })).toThrow(/Duplicate tool name/);
    expect(() => createToolRegistry({ tools: [{ name: 'broken' }] }))
      .toThrow(/Tool definitions require/);
  });
});
