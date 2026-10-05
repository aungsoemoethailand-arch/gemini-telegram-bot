CREATE TABLE IF NOT EXISTS guardian_settings (
  group_chat_id INTEGER PRIMARY KEY,
  rules TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
