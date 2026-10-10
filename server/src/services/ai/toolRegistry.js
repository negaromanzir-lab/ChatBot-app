import logger from '../../config/logger.js';
import ApiError from '../../utils/ApiError.js';

export function createToolRegistry({ tools = [], log = logger } = {}) {
  const registry = new Map();

  for (const tool of tools) {
    if (
      !tool
      || typeof tool.name !== 'string'
      || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(tool.name)
      || typeof tool.description !== 'string'
      || !tool.description
      || typeof tool.inputSchema?.safeParse !== 'function'
      || !tool.inputSchemaJson
      || typeof tool.handler !== 'function'
      || !Array.isArray(tool.permissions)
    ) {
      throw new TypeError('Tool definitions require a name, description, input schema, permissions, and handler.');
    }
    if (registry.has(tool.name)) {
      throw new TypeError(`Duplicate tool name: ${tool.name}`);
    }
    registry.set(tool.name, Object.freeze({ ...tool }));
  }

  function permitted(tool, permissions) {
    return tool.permissions.every((permission) => permissions.includes(permission));
  }

  function getAvailableTools(permissions = []) {
    return [...registry.values()]
      .filter((tool) => permitted(tool, permissions))
      .map(({ name, description, inputSchemaJson }) => ({
        name,
        description,
        inputSchema: inputSchemaJson,
      }));
  }

  async function execute(name, input, { permissions = [], ...context } = {}) {
    const startedAt = Date.now();
    const tool = registry.get(name);
    if (!tool) {
      log.warn({ toolName: name, outcome: 'unknown' }, 'Tool execution rejected');
      throw ApiError.badGateway('AI_TOOL_UNKNOWN', 'The AI requested an unavailable tool.');
    }

    if (!permitted(tool, permissions)) {
      log.warn({ toolName: tool.name, outcome: 'denied' }, 'Tool execution rejected');
      throw ApiError.forbidden('AI_TOOL_PERMISSION_DENIED', 'The requested tool is not permitted.');
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      log.warn({ toolName: tool.name, outcome: 'invalid_arguments' }, 'Tool execution rejected');
      throw ApiError.badGateway(
        'AI_TOOL_INVALID_ARGUMENTS',
        'The AI requested a tool with invalid arguments.',
      );
    }

    try {
      const result = await tool.handler(parsed.data, context);
      log.info(
        { toolName: tool.name, outcome: 'success', durationMs: Date.now() - startedAt },
        'Tool execution completed',
      );
      return result;
    } catch (error) {
      log.error(
        { toolName: tool.name, outcome: 'failed', durationMs: Date.now() - startedAt },
        'Tool execution failed',
      );
      throw error;
    }
  }

  return Object.freeze({ getAvailableTools, execute });
}

export default createToolRegistry;
