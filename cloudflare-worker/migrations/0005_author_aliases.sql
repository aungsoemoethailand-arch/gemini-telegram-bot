CREATE TABLE IF NOT EXISTS author_aliases (
  alias_key TEXT PRIMARY KEY,
  alias_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_author_aliases_group_id
  ON author_aliases(group_id, position);
