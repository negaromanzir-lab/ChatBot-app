CREATE EXTENSION IF NOT EXISTS vector;

CREATE UNIQUE INDEX conversations_user_id_id_unique
  ON conversations (user_id, id);

ALTER TABLE file_uploads
  ADD CONSTRAINT file_uploads_conversation_id_id_unique
  UNIQUE (conversation_id, id);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  embedding_model TEXT,
  chunk_size INTEGER CHECK (chunk_size IS NULL OR chunk_size > 0),
  chunk_overlap INTEGER CHECK (chunk_overlap IS NULL OR chunk_overlap >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_status_valid CHECK (status IN ('pending', 'ready', 'failed')),
  CONSTRAINT documents_upload_conversation_fk
    FOREIGN KEY (conversation_id, upload_id)
    REFERENCES file_uploads (conversation_id, id) ON DELETE CASCADE,
  CONSTRAINT documents_user_conversation_fk
    FOREIGN KEY (user_id, conversation_id)
    REFERENCES conversations (user_id, id) ON DELETE CASCADE
);

CREATE INDEX documents_user_conversation_idx
  ON documents (user_id, conversation_id, status);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (char_length(content) > 0),
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
  section_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE embeddings (
  chunk_id UUID PRIMARY KEY REFERENCES document_chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX embeddings_cosine_hnsw_idx
  ON embeddings USING hnsw (embedding vector_cosine_ops);
