CREATE TABLE IF NOT EXISTS business_connections (
  connection_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 0,
  user_chat_id INTEGER NOT NULL DEFAULT 0,
  can_reply INTEGER NOT NULL DEFAULT 0,
  can_read_messages INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS secretary_drafts (
  token TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  source_message_id INTEGER NOT NULL,
  original_text TEXT NOT NULL DEFAULT '',
  draft_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secretary_drafts_expiry
  ON secretary_drafts(status, expires_at);
