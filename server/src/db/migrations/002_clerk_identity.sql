ALTER TABLE users
  ADD COLUMN clerk_user_id TEXT UNIQUE,
  DROP COLUMN password_hash;

DROP TABLE sessions;
