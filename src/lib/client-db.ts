const IDB_NAME = 'forscore-setlist-builder';
const IDB_STORE = 'database';
const IDB_KEY = 'main';

type SqlJsDatabase = any;
let sqlJsDb: SqlJsDatabase | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!sqlJsDb) return;
    saveToIDB(new Uint8Array(sqlJsDb.export()));
  }, 300);
}

// better-sqlite3–compatible wrapper over sql.js
class Statement {
  constructor(private db: SqlJsDatabase, private sql: string) {}

  get(...params: any[]): any {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : null;
    } finally {
      stmt.free();
    }
  }

  all(...params: any[]): any[] {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  run(...params: any[]): { lastInsertRowid: number; changes: number } {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const idResult = this.db.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = Number(idResult[0]?.values[0]?.[0] ?? 0);
    scheduleSave();
    return { lastInsertRowid, changes: this.db.getRowsModified() };
  }
}

export class ClientDb {
  constructor(private db: SqlJsDatabase) {}

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  exec(sql: string) {
    this.db.run(sql);
    scheduleSave();
  }

  pragma(_: string) {}

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      this.db.run('BEGIN');
      try {
        const result = fn(...args);
        this.db.run('COMMIT');
        scheduleSave();
        return result;
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
    }) as T;
  }

  exportData(): Uint8Array {
    return new Uint8Array(this.db.export());
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_filename TEXT NOT NULL,
    original_relative_path TEXT NOT NULL DEFAULT '',
    original_absolute_path TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS setlist_item_parts (
    setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
    instrument TEXT NOT NULL,
    score_id INTEGER REFERENCES scores(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (setlist_item_id, instrument)
  );

  CREATE INDEX IF NOT EXISTS idx_scores_normalized ON scores(normalized_title);
  CREATE INDEX IF NOT EXISTS idx_scores_status ON scores(status);
  CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON aliases(normalized_alias);
  CREATE INDEX IF NOT EXISTS idx_aliases_score ON aliases(score_id);
  CREATE INDEX IF NOT EXISTS idx_setlist_items_setlist ON setlist_items(setlist_id);
  CREATE INDEX IF NOT EXISTS idx_item_parts_item ON setlist_item_parts(setlist_item_id);
`;

/**
 * Bring an already-populated database up to the current schema.
 *
 * Existing installs load their database straight from IndexedDB and never run
 * SCHEMA, so new tables and columns have to be added explicitly. SCHEMA itself
 * is all CREATE ... IF NOT EXISTS, so replaying it is safe and backfills any
 * table added since that database was created.
 */
function migrate(db: SqlJsDatabase) {
  db.run(SCHEMA);

  const columns = (table: string): string[] => {
    try {
      return (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((r: any) => String(r[1]));
    } catch {
      return [];
    }
  };

  if (!columns('setlists').includes('instruments')) {
    db.run('ALTER TABLE setlists ADD COLUMN instruments TEXT');
  }
}

let clientDb: ClientDb | null = null;

function loadSqlJsScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).initSqlJs) {
      resolve((window as any).initSqlJs);
      return;
    }
    const script = document.createElement('script');
    script.src = '/sql-wasm.js';
    script.onload = () => resolve((window as any).initSqlJs);
    script.onerror = () => reject(new Error('Failed to load sql-wasm.js'));
    document.head.appendChild(script);
  });
}

export async function initClientDb(): Promise<void> {
  if (clientDb) return;
  if (typeof window === 'undefined') return;

  const initSqlJs = await loadSqlJsScript();
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  const saved = await loadFromIDB();
  if (saved) {
    sqlJsDb = new SQL.Database(saved);
  } else {
    // Try to load the bundled library on first install
    try {
      const res = await fetch('/library.db');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        sqlJsDb = new SQL.Database(new Uint8Array(buf));
      }
    } catch (_) {}
    if (!sqlJsDb) {
      sqlJsDb = new SQL.Database();
      sqlJsDb.run(SCHEMA);
    }
  }

  // Every path — restored, bundled, or fresh — is brought to the current schema.
  migrate(sqlJsDb);
  scheduleSave();

  clientDb = new ClientDb(sqlJsDb);
}

export function getClientDb(): ClientDb {
  if (!clientDb) throw new Error('Database not initialized — call initClientDb() first');
  return clientDb;
}

export async function importDatabaseFile(data: Uint8Array): Promise<void> {
  const initSqlJs = await loadSqlJsScript();
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  sqlJsDb = new SQL.Database(data);
  // An exported database may predate the current schema.
  migrate(sqlJsDb);
  clientDb = new ClientDb(sqlJsDb);
  await saveToIDB(new Uint8Array(sqlJsDb.export()));
}

export async function clearDatabase(): Promise<void> {
  const initSqlJs = await loadSqlJsScript();
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });
  sqlJsDb = new SQL.Database();
  sqlJsDb.run(SCHEMA);
  clientDb = new ClientDb(sqlJsDb);
  await saveToIDB(new Uint8Array(sqlJsDb.export()));
}

export function exportDatabaseFile(): Uint8Array | null {
  if (!sqlJsDb) return null;
  return new Uint8Array(sqlJsDb.export());
}

export function getDbStats() {
  if (!clientDb) return { scores: 0, setlists: 0, aliases: 0 };
  const scores = (clientDb.prepare('SELECT COUNT(*) as n FROM scores').get() as any)?.n ?? 0;
  const setlists = (clientDb.prepare('SELECT COUNT(*) as n FROM setlists').get() as any)?.n ?? 0;
  const aliases = (clientDb.prepare('SELECT COUNT(*) as n FROM aliases').get() as any)?.n ?? 0;
  return { scores, setlists, aliases };
}
