import { requirePool } from '../../db/pool.js';

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function createConversationRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async create(userId, title = 'New chat') {
      const result = await db.query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id, user_id, title, created_at, updated_at`,
        [userId, title],
      );
      return mapConversation(result.rows[0]);
    },

    async list(userId) {
      const result = await db.query(
        `SELECT c.id, c.user_id, c.title, c.created_at, c.updated_at,
                COUNT(m.id)::int AS message_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.user_id = $1
         GROUP BY c.id
         ORDER BY c.updated_at DESC, c.id DESC`,
        [userId],
      );
      return result.rows.map((row) => ({
        ...mapConversation(row),
        messageCount: row.message_count,
      }));
    },

    async findById(userId, conversationId) {
      const conversationResult = await db.query(
        `SELECT id, user_id, title, created_at, updated_at
         FROM conversations WHERE id = $1 AND user_id = $2`,
        [conversationId, userId],
      );
      const conversation = mapConversation(conversationResult.rows[0]);
      if (!conversation) return null;

      const messagesResult = await db.query(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC, id ASC`,
        [conversationId],
      );
      return {
        ...conversation,
        messages: messagesResult.rows.map(mapMessage),
      };
    },

    async rename(userId, conversationId, title) {
      const result = await db.query(
        `UPDATE conversations
         SET title = $3, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, title, created_at, updated_at`,
        [conversationId, userId, title],
      );
      return mapConversation(result.rows[0]);
    },

    async delete(userId, conversationId) {
      const result = await db.query(
        'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
        [conversationId, userId],
      );
      return result.rowCount > 0;
    },

    async addMessage(userId, conversationId, { role, content, title }) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const conversationResult = await client.query(
          `SELECT id, title FROM conversations
           WHERE id = $1 AND user_id = $2
           FOR UPDATE`,
          [conversationId, userId],
        );
        const conversation = conversationResult.rows[0];
        if (!conversation) {
          await client.query('ROLLBACK');
          return null;
        }

        const priorUserMessages =
          role === 'user'
            ? await client.query(
                `SELECT 1 FROM messages
                 WHERE conversation_id = $1 AND role = 'user'
                 LIMIT 1`,
                [conversationId],
              )
            : { rowCount: 1 };
        if (role === 'assistant') {
          await client.query(
            `DELETE FROM messages
             WHERE conversation_id = $1
               AND role = 'assistant'
               AND (created_at, id) > (
                 SELECT created_at, id
                 FROM messages
                 WHERE conversation_id = $1 AND role = 'user'
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
               )`,
            [conversationId],
          );
        }
        const messageResult = await client.query(
          `INSERT INTO messages (conversation_id, role, content)
           VALUES ($1, $2, $3)
           RETURNING id, conversation_id, role, content, created_at`,
          [conversationId, role, content],
        );
        const generatedTitle =
          role === 'user' && priorUserMessages.rowCount === 0 ? title : null;
        const updatedResult = await client.query(
          `UPDATE conversations
           SET title = COALESCE($3, title), updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING id, user_id, title, created_at, updated_at`,
          [conversationId, userId, generatedTitle],
        );
        await client.query('COMMIT');
        return {
          conversation: mapConversation(updatedResult.rows[0]),
          message: mapMessage(messageResult.rows[0]),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export default createConversationRepository;
