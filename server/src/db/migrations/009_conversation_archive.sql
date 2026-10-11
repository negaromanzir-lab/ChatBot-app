-- Archive support: a conversation can be hidden from the active list without
-- deleting its messages or files. NULL means active; a timestamp means archived.
ALTER TABLE conversations
  ADD COLUMN archived_at TIMESTAMPTZ;

-- Supports the common "list my active conversations, newest first" query and the
-- archived/unarchived filter without a sequential scan.
CREATE INDEX conversations_user_archived_idx
  ON conversations (user_id, archived_at);
