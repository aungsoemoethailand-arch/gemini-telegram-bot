CREATE TABLE IF NOT EXISTS secretary_rate_limits (
  connection_id TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  last_replied_at INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(connection_id, chat_id)
);
