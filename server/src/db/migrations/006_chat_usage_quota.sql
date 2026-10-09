CREATE TABLE chat_usage_daily (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX chat_usage_daily_date_idx ON chat_usage_daily (usage_date);
