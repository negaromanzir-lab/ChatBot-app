// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCalculatorTool } from '../src/services/ai/tools/calculator.tool.js';
import { createGetWeatherTool } from '../src/services/ai/tools/getWeather.tool.js';
import { createDocumentSearchTool } from '../src/services/ai/tools/documentSearch.tool.js';
import { createCreateTodoTool } from '../src/services/ai/tools/createTodo.tool.js';
import { createWeatherService } from '../src/modules/weather/weather.service.js';
import { createTodoRepository } from '../src/modules/todos/todo.repository.js';
import { createToolRegistry } from '../src/services/ai/toolRegistry.js';
import { createChatService } from '../src/services/ai/chat.service.js';

const quietLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('registered assistant tools', () => {
  it('evaluates basic arithmetic without evaluating model-provided code', async () => {
    const registry = createToolRegistry({
      tools: [createCalculatorTool()],
      log: quietLog,
    });

    await expect(registry.execute('calculator', {
      expression: '(2 + 3) * 4 / 2',
    })).resolves.toEqual({
      expression: '(2 + 3) * 4 / 2',
      result: 10,
    });
    await expect(registry.execute('calculator', { expression: '1 / 0' }))
      .rejects.toMatchObject({ code: 'AI_CALCULATOR_INVALID_EXPRESSION' });
    await expect(registry.execute('calculator', { expression: 'process.exit()' }))
      .rejects.toMatchObject({ code: 'AI_CALCULATOR_INVALID_EXPRESSION' });
  });

  it('requires registered handler dependencies and forwards only validated arguments', async () => {
    const getWeather = vi.fn().mockResolvedValue({ temperature: 20 });
    const searchDocuments = vi.fn().mockResolvedValue([{ content: 'Passage' }]);
    const createTodo = vi.fn().mockResolvedValue({ id: 'todo-id' });
    const registry = createToolRegistry({
      tools: [
        createGetWeatherTool({ getWeather }),
        createDocumentSearchTool({ searchDocuments }),
        createCreateTodoTool({ createTodo }),
      ],
      log: quietLog,
    });
    const permissions = ['weather:read', 'document:search', 'todo:create'];

    await registry.execute('getWeather', { location: ' Helsinki ' }, {
      permissions,
      signal: 'signal',
    });
    await registry.execute('documentSearch', { query: ' policy details ' }, {
      permissions,
      userId: 'user-id',
      fileIds: ['file-id'],
    });
    await registry.execute('createTodo', { title: ' Review report ' }, {
      permissions,
      userId: 'user-id',
      conversationId: 'conversation-id',
    });

    expect(getWeather).toHaveBeenCalledWith('Helsinki', { signal: 'signal' });
    expect(searchDocuments).toHaveBeenCalledWith('policy details', {
      userId: 'user-id',
      fileIds: ['file-id'],
    });
    expect(createTodo).toHaveBeenCalledWith({
      userId: 'user-id',
      conversationId: 'conversation-id',
      title: 'Review report',
      description: '',
    });
  });

  it('uses fixed Open-Meteo endpoints and returns validated current conditions', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ name: 'Helsinki', country: 'Finland', latitude: 60.17, longitude: 24.94 }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        current: {
          time: '2026-10-10T12:00',
          temperature_2m: 12,
          apparent_temperature: 10,
          relative_humidity_2m: 70,
          wind_speed_10m: 8,
          weather_code: 2,
        },
        current_units: { temperature_2m: '°C' },
      })));
    const weather = createWeatherService({ fetchImpl });

    await expect(weather.getWeather('Helsinki')).resolves.toMatchObject({
      location: 'Helsinki, Finland',
      temperature: 12,
      conditions: 'Partly cloudy',
      source: 'Open-Meteo',
    });
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).origin)).toEqual([
      'https://geocoding-api.open-meteo.com',
      'https://api.open-meteo.com',
    ]);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('name')).toBe('Helsinki');
  });

  it('stores todos only under the authenticated user and owned conversation', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: 'todo-id',
          title: 'Review report',
          description: '',
          status: 'pending',
          created_at: new Date('2026-10-10T12:00:00Z'),
        }],
      }),
    };
    const repository = createTodoRepository({ databasePool });

    await expect(repository.create({
      userId: 'user-id',
      conversationId: 'conversation-id',
      title: 'Review report',
      description: '',
    })).resolves.toMatchObject({ id: 'todo-id', status: 'pending' });
    expect(databasePool.query.mock.calls[0][0]).toContain('WHERE c.id = $1 AND c.user_id = $2');
    expect(databasePool.query.mock.calls[0][1]).toEqual([
      'conversation-id',
      'user-id',
      'Review report',
      '',
    ]);
  });

  it('runs a validated model-selected tool then gives its result to the model', async () => {
    const provider = {
      name: 'openai',
      generateResponse: vi.fn()
        .mockResolvedValueOnce({
          role: 'assistant',
          content: '{"toolCall":{"name":"calculator","arguments":{"expression":"19 * 2"}}}',
        })
        .mockResolvedValueOnce({ role: 'assistant', content: '19 times 2 is 38.' }),
    };
    const service = createChatService({
      providerFactory: () => provider,
      modelResolver: () => ({ id: 'test-model', supportsVision: false }),
    });

    await expect(service.generateAssistantReply([{
      role: 'user',
      content: 'What is 19 times 2?',
    }])).resolves.toMatchObject({
      content: '19 times 2 is 38.',
    });
    expect(provider.generateResponse).toHaveBeenCalledTimes(2);
    expect(provider.generateResponse.mock.calls[1][0][0].content)
      .toContain('"result":38');
    expect(provider.generateResponse.mock.calls[0][1].systemInstruction)
      .toContain('"name":"calculator"');
  });
});
