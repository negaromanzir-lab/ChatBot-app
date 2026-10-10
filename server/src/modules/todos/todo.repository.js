import { requirePool } from '../../db/pool.js';
import ApiError from '../../utils/ApiError.js';

function mapTodo(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createTodoRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async create({ userId, conversationId, title, description }) {
      const result = await db.query(
        `INSERT INTO assistant_todos (user_id, conversation_id, title, description)
         SELECT c.user_id, c.id, $3, $4
         FROM conversations c
         WHERE c.id = $1 AND c.user_id = $2
         RETURNING id, title, description, status, created_at`,
        [conversationId, userId, title, description],
      );
      if (!result.rows[0]) {
        throw ApiError.notFound('TODO_CONVERSATION_NOT_FOUND', 'The active conversation was not found.');
      }
      return mapTodo(result.rows[0]);
    },
  };
}

export default createTodoRepository;
