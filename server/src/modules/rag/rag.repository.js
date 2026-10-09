import { requirePool } from '../../db/pool.js';
import ApiError from '../../utils/ApiError.js';

function toVectorLiteral(vector) {
  return `[${vector.join(',')}]`;
}

export function createRagRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async ensureDocument({ userId, conversationId, uploadId }) {
      const result = await db.query(
        `INSERT INTO documents (upload_id, user_id, conversation_id)
         SELECT f.id, c.user_id, c.id
         FROM file_uploads f
         JOIN conversations c ON c.id = f.conversation_id
         WHERE f.id = $1 AND c.id = $2 AND c.user_id = $3
         ON CONFLICT (upload_id) DO UPDATE
         SET updated_at = NOW()
         WHERE documents.user_id = EXCLUDED.user_id
           AND documents.conversation_id = EXCLUDED.conversation_id
         RETURNING id, status, embedding_model, chunk_size, chunk_overlap`,
        [uploadId, conversationId, userId],
      );
      const document = result.rows[0];
      if (!document) {
        throw ApiError.notFound('UPLOAD_NOT_FOUND', 'Document not found.');
      }
      return document;
    },

    async replaceChunks({
      documentId,
      userId,
      conversationId,
      chunks,
      vectors,
      model,
      chunkSize,
      chunkOverlap,
    }) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const ownedDocument = await client.query(
          `UPDATE documents
           SET status = 'pending',
               embedding_model = $4,
               chunk_size = $5,
               chunk_overlap = $6,
               updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND conversation_id = $3
           RETURNING id`,
          [
            documentId,
            userId,
            conversationId,
            model,
            chunkSize,
            chunkOverlap,
          ],
        );
        if (!ownedDocument.rowCount) {
          throw ApiError.notFound('DOCUMENT_NOT_FOUND', 'Document not found.');
        }

        await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
        if (chunks.length) {
          const chunkData = chunks.map((chunk) => ({
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            start_offset: chunk.startOffset,
            end_offset: chunk.endOffset,
            page_number: chunk.pageNumber,
            section_title: chunk.sectionTitle,
          }));
          await client.query(
            `INSERT INTO document_chunks (
               document_id, chunk_index, content, start_offset, end_offset, page_number, section_title
             )
             SELECT $1, data.chunk_index, data.content, data.start_offset, data.end_offset,
                    data.page_number, data.section_title
             FROM jsonb_to_recordset($2::jsonb) AS data(
               chunk_index INTEGER,
               content TEXT,
               start_offset INTEGER,
               end_offset INTEGER,
               page_number INTEGER,
               section_title TEXT
             )`,
            [documentId, JSON.stringify(chunkData)],
          );
          const embeddingData = vectors.map((embedding, chunkIndex) => ({
            chunk_index: chunkIndex,
            embedding: toVectorLiteral(embedding),
          }));
          await client.query(
            `INSERT INTO embeddings (chunk_id, model, embedding)
             SELECT chunks.id, $2, data.embedding::vector
             FROM document_chunks chunks
             JOIN jsonb_to_recordset($3::jsonb) AS data(
               chunk_index INTEGER,
               embedding TEXT
             ) ON data.chunk_index = chunks.chunk_index
             WHERE chunks.document_id = $1`,
            [documentId, model, JSON.stringify(embeddingData)],
          );
        }
        await client.query(
          `UPDATE documents
           SET status = 'ready', updated_at = NOW()
           WHERE id = $1`,
          [documentId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async markFailed({ documentId, userId, conversationId }) {
      await db.query(
        `UPDATE documents
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND conversation_id = $3`,
        [documentId, userId, conversationId],
      );
    },

    async markPending({ documentId, userId, conversationId }) {
      await db.query(
        `UPDATE documents
         SET status = 'pending', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND conversation_id = $3`,
        [documentId, userId, conversationId],
      );
    },

    async searchSimilar({
      userId,
      conversationId,
      uploadIds,
      embedding,
      embeddingModel,
      topK,
      similarityThreshold,
    }) {
      if (!uploadIds.length) return [];
      const result = await db.query(
        `SELECT f.id AS upload_id,
                f.original_name,
                chunks.chunk_index,
                chunks.page_number,
                chunks.section_title,
                chunks.content,
                1 - (vectors.embedding <=> $4::vector) AS similarity
         FROM embeddings vectors
         JOIN document_chunks chunks ON chunks.id = vectors.chunk_id
         JOIN documents d ON d.id = chunks.document_id
         JOIN file_uploads f ON f.id = d.upload_id
         WHERE d.user_id = $1
           AND d.conversation_id = $2
           AND d.upload_id = ANY($3::uuid[])
           AND d.status = 'ready'
           AND vectors.model = $7
           AND 1 - (vectors.embedding <=> $4::vector) >= $6
         ORDER BY vectors.embedding <=> $4::vector ASC
         LIMIT $5`,
        [
          userId,
          conversationId,
          uploadIds,
          toVectorLiteral(embedding),
          topK,
          similarityThreshold,
          embeddingModel,
        ],
      );
      return result.rows.map((row) => ({
        uploadId: row.upload_id,
        fileName: row.original_name,
        chunkIndex: row.chunk_index,
        pageNumber: row.page_number,
        sectionTitle: row.section_title,
        content: row.content,
        similarity: Number(row.similarity),
      }));
    },
  };
}

export default createRagRepository;
