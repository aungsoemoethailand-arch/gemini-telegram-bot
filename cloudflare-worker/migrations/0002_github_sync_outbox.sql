CREATE TABLE IF NOT EXISTS github_sync_outbox (
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  record_no INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  synced_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(chat_id, message_id, record_no)
);

CREATE INDEX IF NOT EXISTS idx_github_sync_pending
  ON github_sync_outbox(sync_state, created_at);
