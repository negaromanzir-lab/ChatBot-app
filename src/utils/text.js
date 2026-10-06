/**
 * Text helpers for conversation labelling.
 */

const TITLE_MAX_LENGTH = 48;

/**
 * Derives a sidebar title from the first thing the user actually said.
 *
 * Falls back to a neutral label for a conversation with no user message yet,
 * rather than showing an empty row.
 */
export function deriveConversationTitle(messages) {
  const firstUserMessage = messages?.find((message) => message.sender === 'user');

  if (!firstUserMessage?.message) {
    return 'New chat';
  }

  // Collapse newlines so a multi-line prompt does not break the single-line row.
  const flattened = firstUserMessage.message.replace(/\s+/g, ' ').trim();

  if (!flattened) {
    return 'New chat';
  }

  return flattened.length > TITLE_MAX_LENGTH
    ? `${flattened.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : flattened;
}

/** Plain-text rendering of a message, used for clipboard copy. */
export function toPlainText(markdown) {
  return typeof markdown === 'string' ? markdown : '';
}