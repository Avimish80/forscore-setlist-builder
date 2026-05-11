import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'forscore.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL,
      original_relative_path TEXT NOT NULL,
      original_absolute_path TEXT NOT NULL,
      forscore_path TEXT NOT NULL,
      display_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      detected_key TEXT,
      version_label TEXT,
      file_size INTEGER,
      modified_at TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      preferred_duplicate_group_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias_text TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duplicate_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT,
      preferred_score_id INTEGER REFERENCES scores(id),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS score_tags (
      score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (score_id, tag)
    );

    CREATE TABLE IF NOT EXISTS setlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS setlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      requested_title TEXT NOT NULL,
      matched_score_id INTEGER REFERENCES scores(id),
      match_status TEXT NOT NULL DEFAULT 'missing',
      confidence REAL DEFAULT 0,
      match_reason TEXT,
      approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scores_normalized ON scores(normalized_title);
    CREATE INDEX IF NOT EXISTS idx_scores_status ON scores(status);
    CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON aliases(normalized_alias);
    CREATE INDEX IF NOT EXISTS idx_aliases_score ON aliases(score_id);
    CREATE INDEX IF NOT EXISTS idx_setlist_items_setlist ON setlist_items(setlist_id);
  `);
}
