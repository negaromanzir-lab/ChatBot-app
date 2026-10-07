import config from '../../../config/env.js';
import ApiError from '../../../utils/ApiError.js';
import createLocalProvider from './local.provider.js';
import createOpenAICompatibleProvider from './openaiCompatible.provider.js';
import createOpenAIProvider from './openai.provider.js';
import createGeminiProvider from './gemini.provider.js';
import createClaudeProvider from './claude.provider.js';

const factories = {
  local: createLocalProvider,
  openai: createOpenAIProvider,
  'openai-compatible': createOpenAICompatibleProvider,
  gemini: createGeminiProvider,
  claude: createClaudeProvider,
  // Retain the existing selector while users migrate to the canonical name.
  'openai-direct': createOpenAIProvider,
};

export function createProvider(overrides = {}) {
  const name = overrides.provider ?? config.ai.provider;
  const factory = factories[name];
  if (!factory) {
    throw ApiError.internal('AI_PROVIDER_UNKNOWN', 'Unknown AI provider ' + name + '.');
  }
  return factory(overrides);
}

export { createLocalProvider, createOpenAICompatibleProvider, createOpenAIProvider };
export { createGeminiProvider, createClaudeProvider };
export default createProvider;
