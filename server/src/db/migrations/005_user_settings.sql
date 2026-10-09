CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  display_name TEXT,
  selected_model_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_theme_valid CHECK (theme IN ('system', 'light', 'dark')),
  CONSTRAINT user_settings_display_name_length CHECK (
    display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40
  ),
  CONSTRAINT user_settings_model_id_valid CHECK (
    selected_model_id IS NULL OR selected_model_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'
  )
);
