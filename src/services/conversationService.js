import { apiRequest } from './apiClient.js';
import {
  clearConversations,
  loadConversations,
} from './conversationStorage.js';
import { removeKey, readJson, writeJson } from './localStorage.js';

function toUiMessage(message) {
  return {
    id: message.id,
    sender: message.role === 'user' ? 'user' : 'robot',
    message: message.content,
    createdAt: new Date(message.createdAt).getTime(),
  };
}

function toUiConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: new Date(conversation.createdAt).getTime(),
    updatedAt: new Date(conversation.updatedAt).getTime(),
    messages: conversation.messages?.map(toUiMessage) ?? [],
  };
}

export async function listConversations() {
  const payload = await apiRequest('/conversations');
  return payload.conversations.map(toUiConversation);
}

export async function getConversation(id) {
  const payload = await apiRequest(`/conversations/${encodeURIComponent(id)}`);
  return toUiConversation(payload.conversation);
}

export async function createConversation(title) {
  const payload = await apiRequest('/conversations', {
    method: 'POST',
    body: title ? { title } : {},
  });
  return toUiConversation(payload.conversation);
}

export async function renameConversation(id, title) {
  const payload = await apiRequest(`/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { title },
  });
  return toUiConversation(payload.conversation);
}

export async function createConversationMessage(id, message) {
  return appendConversationMessage(id, message);
}

export function deleteConversation(id) {
  return apiRequest(`/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function appendConversationMessage(id, { sender, message }) {
  const payload = await apiRequest(
    `/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      body: {
        role: sender === 'user' ? 'user' : 'assistant',
        content: message,
      },
    },
  );
  return {
    conversation: {
      id: payload.conversation.id,
      title: payload.conversation.title,
      createdAt: new Date(payload.conversation.createdAt).getTime(),
      updatedAt: new Date(payload.conversation.updatedAt).getTime(),
    },
    message: toUiMessage(payload.message),
  };
}

const IMPORTED_USERS_KEY = 'chatbot.imported-users.v1';

/**
 * Move browser-only history into the signed-in account once. Local data is
 * preserved until every conversation and message has been accepted by the API.
 */
export async function importLocalHistory(userId) {
  const storedUsers = readJson(IMPORTED_USERS_KEY, []);
  const importedUsers = Array.isArray(storedUsers) ? storedUsers : [];
  if (importedUsers.includes(userId)) return null;

  const local = loadConversations();
  if (local.conversations.length === 0) {
    return null;
  }

  const idMap = new Map();
  for (const oldConversation of local.conversations) {
    const conversation = await createConversation(oldConversation.title);
    idMap.set(oldConversation.id, conversation.id);

    for (const oldMessage of oldConversation.messages) {
      await appendConversationMessage(conversation.id, oldMessage);
    }
    if (oldConversation.title !== conversation.title) {
      await renameConversation(conversation.id, oldConversation.title);
    }
  }

  const activeId = idMap.get(local.activeId) ?? null;
  if (!writeJson(IMPORTED_USERS_KEY, [...importedUsers, userId])) {
    throw new Error('Could not record the local conversation import status.');
  }
  clearConversations();
  return activeId;
}

export function clearImportMarker(userId) {
  const importedUsers = readJson(IMPORTED_USERS_KEY, []);
  writeJson(
    IMPORTED_USERS_KEY,
    importedUsers.filter((id) => id !== userId),
  );
}

export function clearLocalConversationCache() {
  clearConversations();
  removeKey(IMPORTED_USERS_KEY);
}
