import logger from '../../config/logger.js';
import ApiError from '../../utils/ApiError.js';
import createProvider from './providers/index.js';

/**
 * Chat orchestration.
 *
 * Owns the provider instance and converts between the public API contract
 * (`{ role, content }`) and whatever the provider expects. Controllers stay
 * unaware of which provider is active, so swapping vendors never reaches the
 * HTTP layer.
 *
 * The provider is resolved lazily and memoised: constructing the OpenAI adapter
 * validates credentials, and that should not happen merely because this module
 * was imported.
 */
export function createChatService({ provider } = {}) {
  let resolvedProvider = provider;

  function getProvider() {
    if (!resolvedProvider) {
      resolvedProvider = createProvider();
      logger.info({ provider: resolvedProvider.name }, 'AI provider initialized');
    }
    return resolvedProvider;
  }

  async function generateAssistantReply(messages) {
    const activeProvider = getProvider();

    // Message contents are deliberately not logged — only shape metadata.
    // This keeps conversation content out of log sinks.
    logger.debug(
      {
        provider: activeProvider.name,
        messageCount: messages.length,
        roles: messages.map((message) => message.role),
      },
      'Generating assistant reply',
    );

    const generateResponse =
      activeProvider.generateResponse ?? activeProvider.generateReply;
    if (typeof generateResponse !== 'function') {
      logger.error({ provider: activeProvider.name }, 'AI provider does not implement generateResponse');
      throw ApiError.internal(
        'AI_PROVIDER_INVALID_IMPLEMENTATION',
        'The configured AI provider is not available.',
      );
    }

    const reply = await generateResponse.call(activeProvider, messages);

    if (!reply || typeof reply.content !== 'string' || reply.content.length === 0) {
      logger.error({ provider: activeProvider.name }, 'Provider returned an unusable reply');
      throw ApiError.badGateway(
        'AI_PROVIDER_INVALID_RESPONSE',
        'The AI provider returned an unusable response.',
      );
    }

    logger.info(
      { provider: activeProvider.name, contentLength: reply.content.length },
      'Assistant reply generated',
    );

    return { role: 'assistant', content: reply.content };
  }

  return { generateAssistantReply, getProvider };
}

export default createChatService;