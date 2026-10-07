CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_key UUID NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT file_uploads_name_length CHECK (char_length(original_name) BETWEEN 1 AND 255),
  CONSTRAINT file_uploads_size_positive CHECK (size_bytes > 0)
);

CREATE INDEX file_uploads_conversation_created_idx
  ON file_uploads (conversation_id, created_at ASC, id ASC);
