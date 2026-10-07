CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email)),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions (expire);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_title_length CHECK (char_length(title) BETWEEN 1 AND 200)
);
CREATE INDEX conversations_user_updated_idx ON conversations (user_id, updated_at DESC);
CREATE INDEX conversations_created_idx ON conversations (created_at DESC);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_role_valid CHECK (role IN ('user', 'assistant')),
  CONSTRAINT messages_content_nonempty CHECK (char_length(content) > 0)
);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at ASC, id ASC);
