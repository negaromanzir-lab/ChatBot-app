import { apiRequest } from '../shared/api/httpClient.js';
import { createId } from '../utils/id.js';

/**
 * Chat feature service: the only place that knows the chat endpoint exists.
 *
 * It also owns the translation between the UI's message shape
 * (`{ id, sender, message }`, where sender is 'user' | 'robot') and the API
 * contract (`{ role, content }`, where role is 'user' | 'assistant'). Keeping
 * the mapping here means the backend contract can evolve without touching any
 * component, and the view models stay untouched.
 */

/**
 * Maximum conversation length sent upstream.
 *
 * The server rejects a body with more than `MAX_MESSAGES_PER_REQUEST` messages
 * (50 by default). Because history now persists across reloads, a long
 * conversation could outgrow that limit, so the tail is trimmed here rather than
 * letting the request fail. Trimming oldest-first keeps the most recent context,
 * which is what matters for an answer.
 */
export const MAX_HISTORY_MESSAGES = 50;

/** UI sender -> API role. */
const SENDER_TO_ROLE = {
  user: 'user',
  robot: 'assistant',
};

/** API role -> UI sender. */
const ROLE_TO_SENDER = {
  user: 'user',
  assistant: 'robot',
};

export function toApiMessages(chatMessages) {
  return chatMessages.map((chatMessage) => ({
    role: SENDER_TO_ROLE[chatMessage.sender] ?? 'user',
    content: chatMessage.message,
  }));
}

export function toChatMessage(payload, id, createdAt = Date.now()) {
  return {
    id,
    sender: ROLE_TO_SENDER[payload.role] ?? 'robot',
    message: payload.content,
    createdAt,
  };
}

/**
 * Builds a UI message from local text. Used for the user's own turn, which never
 * round-trips through the API.
 */
export function createUserMessage(text, { id = createId(), createdAt = Date.now() } = {}) {
  return { id, sender: 'user', message: text, createdAt };
}

/**
 * Sends the conversation to the backend and returns the assistant reply as a
 * UI-shaped message. Rejects with `ApiClientError` when the call fails, so the
 * caller can surface a real error instead of inventing a reply.
 *
 * @param {{ messages: Array<{sender: string, message: string}>, signal?: AbortSignal }} params
 */
export async function requestAssistantReply({ messages, signal } = {}) {
  const history = Array.isArray(messages) ? messages.slice(-MAX_HISTORY_MESSAGES) : [];

  const payload = await apiRequest('/chat', {
    method: 'POST',
    body: { messages: toApiMessages(history) },
    signal,
  });

  if (!payload?.message || typeof payload.message.content !== 'string') {
    throw new Error('The server returned a malformed reply.');
  }

  return toChatMessage(payload.message, createId());
}