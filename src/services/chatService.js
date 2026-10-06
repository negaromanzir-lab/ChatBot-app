import { apiRequest, apiStream, ApiClientError } from './apiClient.js';
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

/**
 * Streams the assistant response and reports each text delta to the caller.
 * The final message uses the same stable id as streamed updates so UI state
 * replaces the partial message instead of appending a duplicate.
 */
export async function streamAssistantReply({
  messages,
  signal,
  onDelta = () => {},
} = {}) {
  const history = Array.isArray(messages) ? messages.slice(-MAX_HISTORY_MESSAGES) : [];
  const response = await apiStream('/chat', {
    method: 'POST',
    body: { messages: toApiMessages(history), stream: true },
    signal,
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const replyId = createId();
  let buffer = '';
  let receivedDone = false;
  let fullContent = '';
  let streamEnded = false;

  function processLine(line) {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;

    let event;
    try {
      event = JSON.parse(data);
    } catch (error) {
      throw new ApiClientError('The server returned malformed streaming data.', {
        code: 'INVALID_RESPONSE',
        cause: error,
      });
    }

    if (event.type === 'delta' && typeof event.content === 'string') {
      fullContent += event.content;
      onDelta(event.content, {
        id: replyId,
        sender: 'robot',
        message: fullContent,
        createdAt: Date.now(),
        status: 'streaming',
      });
      return;
    }

    if (event.type === 'error') {
      throw new ApiClientError(
        event.error?.message ?? 'The assistant could not complete the response.',
        {
          status: 200,
          code: event.error?.code ?? 'STREAM_ERROR',
          details: event.error?.requestId,
        },
      );
    }

    if (
      event.type === 'done' &&
      event.message?.role === 'assistant' &&
      typeof event.message.content === 'string'
    ) {
      fullContent = event.message.content;
      receivedDone = true;
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
      if (done) {
        streamEnded = true;
        break;
      }
    }

    if (buffer) processLine(buffer);
  } catch (error) {
    if (signal?.aborted) {
      throw new ApiClientError('Request cancelled.', { code: 'CANCELLED' });
    }
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('The response stream was interrupted. Please retry.', {
      code: 'STREAM_INTERRUPTED',
      cause: error,
    });
  } finally {
    if (!streamEnded) {
      try {
        await reader.cancel();
      } catch {
        // The reader can already be errored or aborted; release it regardless.
      }
    }
    reader.releaseLock();
  }

  if (!receivedDone) {
    throw new ApiClientError('The response stream ended before the reply was complete.', {
      code: 'STREAM_INTERRUPTED',
    });
  }
  if (!fullContent) {
    throw new ApiClientError('The assistant returned an empty response.', {
      code: 'AI_PROVIDER_EMPTY_RESPONSE',
    });
  }

  return {
    id: replyId,
    sender: 'robot',
    message: fullContent,
    createdAt: Date.now(),
    status: 'complete',
  };
}