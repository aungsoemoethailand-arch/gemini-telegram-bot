CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  record_no INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(chat_id, message_id, record_no)
);

CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
