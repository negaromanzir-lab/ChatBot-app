import { createTodoRepository } from './todo.repository.js';

export function createTodoService({ repository = createTodoRepository() } = {}) {
  async function create({ userId, conversationId, title, description }) {
    return repository.create({ userId, conversationId, title, description });
  }
  return { create };
}

export default createTodoService;
