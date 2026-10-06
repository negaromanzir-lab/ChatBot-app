/**
 * Deterministic offline provider.
 *
 * This exists so the project is runnable and testable with zero credentials. It
 * is NOT a language model and does not pretend to be one: it never fabricates a
 * convincing-sounding answer. It reports that no model is wired up and echoes
 * the caller's turn count so the local round-trip is visibly working.
 *
 * Choosing it is explicit (`AI_PROVIDER=local`, the default) rather than a
 * silent fallback, so a misconfigured `openai` provider surfaces as a real error
 * instead of being masked by a fake successful reply.
 */
export function createLocalProvider() {
  async function generateResponse(messages) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');

    const content =
      'Offline provider active: no AI model is configured, so this reply was ' +
      'generated locally without calling a model. Set AI_PROVIDER=openai and ' +
      'OPENAI_API_KEY on the server to enable real replies.' +
      (lastUserMessage
        ? ` (Received ${messages.length} message(s); last one had ${lastUserMessage.content.length} characters.)`
        : '');

    return { role: 'assistant', content };
  }

  async function* streamResponse(messages) {
    const response = await generateResponse(messages);
    yield response.content;
  }

  return {
    name: 'local',
    generateResponse,
    streamResponse,
    generateReply: generateResponse,
  };
}

export default createLocalProvider;