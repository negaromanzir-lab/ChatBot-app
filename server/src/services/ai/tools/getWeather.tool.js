import { z } from 'zod';

export function createGetWeatherTool({ getWeather }) {
  if (typeof getWeather !== 'function') {
    throw new TypeError('getWeather tool requires a weather handler.');
  }

  return {
    name: 'getWeather',
    description: 'Get current weather conditions for a location.',
    inputSchema: z.object({
      location: z.string().trim().min(2).max(120),
    }).strict(),
    inputSchemaJson: {
      type: 'object',
      properties: { location: { type: 'string', minLength: 2, maxLength: 120 } },
      required: ['location'],
      additionalProperties: false,
    },
    permissions: ['weather:read'],
    handler: ({ location }, { signal } = {}) => getWeather(location, { signal }),
  };
}

export default createGetWeatherTool;
