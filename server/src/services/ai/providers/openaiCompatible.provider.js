import createOpenAIProvider from './openai.provider.js';

/**
 * OpenAI-compatible endpoint adapter. It shares the OpenAI wire protocol while
 * allowing the configured server URL and credentials to target another vendor.
 */
export function createOpenAICompatibleProvider(overrides = {}) {
  return {
    ...createOpenAIProvider({
      ...overrides,
      includeSystemInstruction: false,
    }),
    name: 'openai-compatible',
  };
}

export default createOpenAICompatibleProvider;
