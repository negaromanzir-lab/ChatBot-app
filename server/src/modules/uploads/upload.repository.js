import { requirePool } from '../../db/pool.js';

function mapUpload(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.original_name,
    contentType: row.content_type,
    size: Number(row.size_bytes),
    createdAt: row.created_at,
  };
}

const PUBLIC_COLUMNS =
  'id, conversation_id, original_name, content_type, size_bytes, created_at';
const QUALIFIED_PUBLIC_COLUMNS =
  'f.id, f.conversation_id, f.original_name, f.content_type, f.size_bytes, f.created_at';

export function createUploadRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async ownsConversation(userId, conversationId) {
      const result = await db.query(
        'SELECT 1 FROM conversations WHERE user_id = $1 AND id = $2',
        [userId, conversationId],
      );
      return result.rowCount > 0;
    },

    async create(userId, conversationId, { id, name, contentType, size, extractedText }) {
      const result = await db.query(
        `INSERT INTO file_uploads (
           conversation_id, storage_key, original_name, content_type, size_bytes, extracted_text
         )
         SELECT c.id, $3, $4, $5, $6, $7
         FROM conversations c
         WHERE c.id = $1 AND c.user_id = $2
         RETURNING ${PUBLIC_COLUMNS}`,
        [conversationId, userId, id, name, contentType, size, extractedText],
      );
      return mapUpload(result.rows[0]);
    },

    async list(userId, conversationId) {
      const result = await db.query(
        `SELECT c.id AS owned_conversation_id,
                ${QUALIFIED_PUBLIC_COLUMNS}
         FROM conversations c
         LEFT JOIN file_uploads f ON f.conversation_id = c.id
         WHERE c.user_id = $1 AND c.id = $2
         ORDER BY f.created_at ASC, f.id ASC`,
        [userId, conversationId],
      );
      if (result.rows.length === 0) return null;
      return result.rows.filter((row) => row.id).map(mapUpload);
    },

    async find(userId, conversationId, uploadId) {
      const result = await db.query(
        `SELECT ${QUALIFIED_PUBLIC_COLUMNS}, f.storage_key
         FROM file_uploads f
         JOIN conversations c ON c.id = f.conversation_id
         WHERE c.user_id = $1 AND c.id = $2 AND f.id = $3`,
        [userId, conversationId, uploadId],
      );
      const row = result.rows[0];
      return row ? { ...mapUpload(row), storageKey: row.storage_key } : null;
    },

    async findForChat(userId, conversationId, uploadIds) {
      const result = await db.query(
        `SELECT ${QUALIFIED_PUBLIC_COLUMNS}, f.storage_key, f.extracted_text
         FROM file_uploads f
         JOIN conversations c ON c.id = f.conversation_id
         WHERE c.user_id = $1 AND c.id = $2 AND f.id = ANY($3::uuid[])
         ORDER BY f.created_at ASC, f.id ASC`,
        [userId, conversationId, uploadIds],
      );
      return result.rows.map((row) => ({
        ...mapUpload(row),
        storageKey: row.storage_key,
        extractedText: row.extracted_text,
      }));
    },

    async listStorageKeysForConversation(userId, conversationId) {
      const result = await db.query(
        `SELECT f.storage_key
         FROM file_uploads f
         JOIN conversations c ON c.id = f.conversation_id
         WHERE c.user_id = $1 AND c.id = $2`,
        [userId, conversationId],
      );
      return result.rows.map((row) => row.storage_key);
    },

    async delete(userId, conversationId, uploadId) {
      const result = await db.query(
        `DELETE FROM file_uploads f
         USING conversations c
         WHERE f.conversation_id = c.id
           AND c.user_id = $1 AND c.id = $2 AND f.id = $3
         RETURNING f.storage_key`,
        [userId, conversationId, uploadId],
      );
      return result.rows[0]?.storage_key ?? null;
    },
  };
}

export default createUploadRepository;
