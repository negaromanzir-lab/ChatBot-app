import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import { chunkDocument } from './chunker.js';
import { createOpenAIEmbeddingProvider } from './openaiEmbeddingProvider.js';
import { createRagRepository } from './rag.repository.js';

export function createRagService({
  repository = createRagRepository(),
  embeddingProvider = createOpenAIEmbeddingProvider(),
  settings = config.rag,
} = {}) {
  async function indexDocument({ userId, conversationId, uploadId, text }) {
    const document = await repository.ensureDocument({
      userId,
      conversationId,
      uploadId,
    });
    const isCurrentIndex = (
      document.status === 'ready'
      && document.embedding_model === embeddingProvider.model
      && Number(document.chunk_size) === settings.chunkSize
      && Number(document.chunk_overlap) === settings.chunkOverlap
    );
    if (isCurrentIndex) return { status: 'ready' };
    if (document.status === 'ready') {
      await repository.markPending({ documentId: document.id, userId, conversationId });
    }

    const chunks = chunkDocument(text, settings);
    if (chunks.length === 0) {
      await repository.replaceChunks({
        documentId: document.id,
        userId,
        conversationId,
        chunks,
        vectors: [],
        model: embeddingProvider.model,
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
      });
      return { status: 'ready' };
    }
    if (!embeddingProvider.isConfigured) return { status: 'pending' };

    try {
      const vectors = await embeddingProvider.embedTexts(
        chunks.map(({ content }) => content),
      );
      if (vectors.length !== chunks.length) {
        throw ApiError.badGateway(
          'AI_EMBEDDINGS_INVALID_RESPONSE',
          'The document embedding provider returned incomplete vectors.',
        );
      }
      await repository.replaceChunks({
        documentId: document.id,
        userId,
        conversationId,
        chunks,
        vectors,
        model: embeddingProvider.model,
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
      });
      return { status: 'ready' };
    } catch (error) {
      await repository.markFailed({ documentId: document.id, userId, conversationId });
      throw error;
    }
  }

  async function retrieveContext({
    userId,
    conversationId,
    files,
    query,
    signal,
  }) {
    const documents = files.filter((file) => (
      file.extractedText && !file.contentType.startsWith('image/')
    ));
    if (!documents.length) return [];

    for (const file of documents) {
      const result = await indexDocument({
        userId,
        conversationId,
        uploadId: file.id,
        text: file.extractedText,
      });
      if (result.status !== 'ready') {
        throw ApiError.serviceUnavailable(
          'AI_EMBEDDINGS_NOT_CONFIGURED',
          'Document search is not ready. Configure OPENAI_API_KEY on the server to index and search documents.',
        );
      }
    }

    const queryEmbedding = await embeddingProvider.embedQuery(query, { signal });
    return repository.searchSimilar({
      userId,
      conversationId,
      uploadIds: documents.map(({ id }) => id),
      embedding: queryEmbedding,
      embeddingModel: embeddingProvider.model,
      topK: settings.topK,
      similarityThreshold: settings.similarityThreshold,
    });
  }

  return { indexDocument, retrieveContext };
}

export default createRagService;
