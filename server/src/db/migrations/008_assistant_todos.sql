CREATE TABLE assistant_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_todos_status_valid CHECK (status IN ('pending', 'completed')),
  CONSTRAINT assistant_todos_user_conversation_fk
    FOREIGN KEY (user_id, conversation_id)
    REFERENCES conversations (user_id, id) ON DELETE CASCADE
);

CREATE INDEX assistant_todos_user_status_created_idx
  ON assistant_todos (user_id, status, created_at DESC);
