import config from '../../../config/env.js';
import ApiError from '../../../utils/ApiError.js';
import createLocalProvider from './local.provider.js';
import createOpenAICompatibleProvider from './openaiCompatible.provider.js';

const factories = {
  local: createLocalProvider,
  openai: createOpenAICompatibleProvider,
};

/**
 * Resolves the configured provider to a concrete adapter.
 *
 * Selection is explicit and happens once, at composition time. Adding a vendor
 * means adding a factory here and an entry in the AI_PROVIDER enum in
 * config/env.js — no caller ever imports a provider module directly.
 */
export function createProvider(overrides = {}) {
  const name = overrides.provider ?? config.ai.provider;
  const factory = factories[name];

  if (!factory) {
    throw ApiError.internal(
      'AI_PROVIDER_UNKNOWN',
      `Unknown AI provider "${name}".`,
    );
  }

  return factory(overrides);
}

export { createLocalProvider, createOpenAICompatibleProvider };
export default createProvider;