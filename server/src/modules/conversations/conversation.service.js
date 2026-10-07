import { createConversationRepository } from './conversation.repository.js';
import { createUploadService } from '../uploads/upload.service.js';

const TITLE_MAX_LENGTH = 48;

export function deriveTitle(content) {
  const flattened = content.replace(/\s+/g, ' ').trim();
  if (!flattened) return 'New chat';
  return flattened.length > TITLE_MAX_LENGTH
    ? `${flattened.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : flattened;
}

export function createConversationService({
  repository = createConversationRepository(),
  uploadService,
} = {}) {
  let uploads = uploadService;
  async function create(userId, { title } = {}) {
    return repository.create(userId, normalizeTitle(title));
  }

  async function list(userId) {
    return repository.list(userId);
  }

  async function get(userId, conversationId) {
    return repository.findById(userId, conversationId);
  }

  async function rename(userId, conversationId, title) {
    return repository.rename(userId, conversationId, normalizeTitle(title));
  }

  async function remove(userId, conversationId) {
    uploads ??= createUploadService();
    const storageKeys = await uploads.listStorageKeysForConversation(userId, conversationId);
    const deleted = await repository.delete(userId, conversationId);
    if (deleted) await uploads.removeStorageKeys(storageKeys);
    return deleted;
  }

  async function addMessage(userId, conversationId, message) {
    return repository.addMessage(userId, conversationId, {
      ...message,
      title: message.role === 'user' ? deriveTitle(message.content) : undefined,
    });
  }

  return { create, list, get, rename, remove, addMessage };
}

function normalizeTitle(title) {
  if (typeof title !== 'string') return 'New chat';
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 200) : 'New chat';
}

export default createConversationService;
