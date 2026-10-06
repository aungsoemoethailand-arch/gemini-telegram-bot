CREATE TABLE IF NOT EXISTS delete_sessions (
  token TEXT PRIMARY KEY,
  requester_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delete_sessions_created_at ON delete_sessions(created_at);
