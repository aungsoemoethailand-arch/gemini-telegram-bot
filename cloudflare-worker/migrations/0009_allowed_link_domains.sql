CREATE TABLE IF NOT EXISTS allowed_link_domains (
  domain TEXT PRIMARY KEY,
  added_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO allowed_link_domains(domain, added_by, created_at)
VALUES
  ('wow-reviews.pages.dev', 'system', strftime('%s','now')),
  ('whispermmepub.github.io', 'system', strftime('%s','now'));
