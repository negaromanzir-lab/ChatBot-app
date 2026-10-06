/**
 * Local persistence for conversations.
 *
 * Conversations live in `localStorage` only. There is no server-side storage
 * yet (that is Phase 5), so this is deliberately the single source of truth for
 * history — and the reason the app keeps working with no backend at all.
 *
 * The payload is versioned. On a version mismatch the store is discarded rather
 * than migrated: history is not worth a migration framework at this stage, and a
 * silent reset is more predictable than a half-understood shape.
 */

import { readJson, writeJson, removeKey } from './localStorage.js';

const STORAGE_KEY = 'chatbot.conversations.v1';
const SCHEMA_VERSION = 1;

/**
 * Upper bound on stored conversations. Prevents unbounded growth in
 * `localStorage`, which is a small quota and fails silently once exceeded.
 */
export const MAX_STORED_CONVERSATIONS = 100;

/**
 * Upper bound on messages kept per conversation, for the same reason. Must stay
 * at or below the server's `MAX_MESSAGES_PER_REQUEST`, otherwise a long
 * conversation would send a body the API rejects.
 */
export const MAX_STORED_MESSAGES = 200;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keeps only fields this app understands, so a hand-edited blob cannot inject shape. */
function sanitizeMessage(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.sender !== 'user' && raw.sender !== 'robot') return null;
  if (typeof raw.message !== 'string') return null;

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    sender: raw.sender,
    message: raw.message,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

function sanitizeConversation(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string') return null;

  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_STORED_MESSAGES)
    : [];

  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();

  return {
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title ? raw.title : 'New chat',
    messages,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt,
  };
}

export function loadConversations() {
  const stored = readJson(STORAGE_KEY, null);

  if (!isPlainObject(stored) || stored.version !== SCHEMA_VERSION) {
    if (stored) removeKey(STORAGE_KEY);
    return { conversations: [], activeId: null };
  }

  const conversations = Array.isArray(stored.conversations)
    ? stored.conversations.map(sanitizeConversation).filter(Boolean)
    : [];

  const activeId =
    typeof stored.activeId === 'string' &&
    conversations.some((conversation) => conversation.id === stored.activeId)
      ? stored.activeId
      : (conversations[0]?.id ?? null);

  return { conversations, activeId };
}

export function saveConversations({ conversations, activeId }) {
  // Newest first, and capped: the sidebar only ever shows recent history and a
  // long-tail list is noise rather than a feature at this scale.
  const trimmed = [...conversations]
    .filter((conversation) => conversation.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_CONVERSATIONS)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-MAX_STORED_MESSAGES),
    }));

  const nextActiveId = trimmed.some((conversation) => conversation.id === activeId)
    ? activeId
    : (trimmed[0]?.id ?? null);

  writeJson(STORAGE_KEY, { version: SCHEMA_VERSION, conversations: trimmed, activeId: nextActiveId });

  return { conversations: trimmed, activeId: nextActiveId };
}

export function clearConversations() {
  removeKey(STORAGE_KEY);
}