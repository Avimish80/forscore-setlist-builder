import { getClientDb } from './client-db';
import { normalize, detectKey, detectVersionLabel, guessCleanTitle } from './normalizer';
import { generateSetlistXml } from './generator';
import { Score, MatchResult } from './types';
import Fuse from 'fuse.js';

// ── Scores ──

export function queryScores(params: {
  search?: string;
  status?: string;
  letter?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getClientDb();
  const { search = '', status = '', letter = '', page = 1, pageSize: ps } = params;
  const pageSize = letter || search ? 2000 : (ps || 100);
  const offset = letter || search ? 0 : (page - 1) * pageSize;

  const conditions: string[] = [];
  const args: any[] = [];

  if (status) {
    conditions.push('status = ?');
    args.push(status);
  }
  if (search) {
    conditions.push('(display_title LIKE ? OR original_filename LIKE ? OR normalized_title LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  if (letter === '#') {
    conditions.push("(upper(substr(display_title,1,1)) NOT BETWEEN 'A' AND 'Z' AND unicode(display_title) NOT BETWEEN 1488 AND 1514)");
  } else if (letter === 'he') {
    conditions.push('unicode(display_title) BETWEEN 1488 AND 1514');
  } else if (letter) {
    conditions.push("upper(substr(display_title,1,1)) = upper(?)");
    args.push(letter);
  }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM scores${where}`).get(...args) as any)?.n ?? 0;
  const scores = db.prepare(`SELECT * FROM scores${where} ORDER BY display_title ASC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);

  return {
    scores: scores as Score[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function getScore(id: number): Score | null {
  return getClientDb().prepare('SELECT * FROM scores WHERE id = ?').get(id) as Score | null;
}

export function updateScore(id: number, fields: Record<string, any>): Score | null {
  const db = getClientDb();
  const allowed = ['display_title', 'forscore_path', 'status', 'notes', 'detected_key', 'version_label'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowed) {
    if (field in fields) {
      updates.push(`${field} = ?`);
      values.push(fields[field]);
    }
  }
  if ('display_title' in fields) {
    updates.push('normalized_title = ?');
    values.push(normalize(fields.display_title));
  }
  if (updates.length === 0) return null;

  updates.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE scores SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM scores WHERE id = ?').get(id) as Score;
}

export function importScoresFromFiles(files: { name: string; size: number }[]): { added: number; skipped: number } {
  const db = getClientDb();
  const existing = db.prepare('SELECT original_filename FROM scores').all() as { original_filename: string }[];
  const existingNames = new Set(existing.map(r => r.original_filename));

  let added = 0;
  let skipped = 0;

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    if (existingNames.has(file.name)) {
      skipped++;
      continue;
    }

    const cleanTitle = guessCleanTitle(file.name);
    const normalizedTitle = normalize(file.name);
    const key = detectKey(file.name);
    const version = detectVersionLabel(file.name);

    db.prepare(`
      INSERT INTO scores (original_filename, original_relative_path, original_absolute_path,
        forscore_path, display_title, normalized_title, detected_key, version_label, file_size, status)
      VALUES (?, '', '', ?, ?, ?, ?, ?, ?, 'new')
    `).run(file.name, file.name, cleanTitle, normalizedTitle, key, version, file.size);
    added++;
  }

  return { added, skipped };
}

// ── Score groups (Workbench) ──

const INSTRUMENT_SUFFIXES = [
  'full score', 'lead sheet', 'piano vocal', 'alto sax', 'tenor sax',
  'piano', 'guitar', 'bass', 'violin', 'viola', 'cello', 'drums',
  'saxophone', 'trumpet', 'trombone', 'flute', 'clarinet', 'horns',
  'strings', 'vocal', 'singer', 'solo',
];

const MULTI_KEY_SUFFIX =
  /\s+(?:abm|a#m|bbm|bm|c#m|dbm|dm|d#m|ebm|em|f#m|fm|gbm|gm|g#m|am|cm|ab|a#|bb|c#|db|d#|eb|f#|gb|g#)$/i;

function coreTitle(normalizedTitle: string): string {
  let t = normalizedTitle;
  for (const inst of INSTRUMENT_SUFFIXES) {
    t = t.replace(new RegExp(`\\s+${inst}$`), '');
  }
  t = t.replace(MULTI_KEY_SUFFIX, '');
  t = t.replace(/\s+[a-g]$/i, '');
  return t.replace(/\s+/g, ' ').trim() || normalizedTitle;
}

export function getScoreGroups() {
  const db = getClientDb();
  const rows = db.prepare(`
    SELECT id, display_title, normalized_title, detected_key, version_label, status, original_filename
    FROM scores ORDER BY display_title COLLATE NOCASE
  `).all() as any[];

  const map = new Map<string, any[]>();
  for (const row of rows) {
    const core = coreTitle(row.normalized_title);
    if (!map.has(core)) map.set(core, []);
    map.get(core)!.push(row);
  }

  return Array.from(map.entries())
    .map(([core_title, members]) => ({
      core_title,
      count: members.length,
      members,
      all_reviewed: members.every((m: any) => m.status === 'reviewed'),
    }))
    .sort((a, b) => b.count - a.count || a.core_title.localeCompare(b.core_title));
}

// ── Search & Matching ──

export function searchScores(query: string, limit: number = 20): Score[] {
  const db = getClientDb();
  const allScores = db.prepare('SELECT * FROM scores WHERE status != ?').all('ignored') as Score[];
  if (!query.trim()) return allScores.slice(0, limit);

  const fuse = new Fuse(allScores, {
    keys: ['display_title', 'original_filename', 'normalized_title'],
    threshold: 0.4,
    includeScore: true,
  });

  return fuse.search(query, { limit }).map(r => r.item);
}

export function matchTitle(requestedTitle: string): MatchResult | null {
  const db = getClientDb();
  const normalizedInput = normalize(requestedTitle);

  const alias = db.prepare(`
    SELECT a.score_id, s.* FROM aliases a
    JOIN scores s ON a.score_id = s.id
    WHERE a.normalized_alias = ? AND s.status != 'ignored'
    ORDER BY a.confidence DESC LIMIT 1
  `).get(normalizedInput) as any;

  if (alias) {
    return { score: alias as Score, confidence: 1.0, reason: `Alias match` };
  }

  const allScores = db.prepare('SELECT * FROM scores WHERE status != ?').all('ignored') as Score[];

  const exactFilename = allScores.find(
    s => s.original_filename.replace(/\.pdf$/i, '').toLowerCase() === requestedTitle.toLowerCase()
  );
  if (exactFilename) return { score: exactFilename, confidence: 1.0, reason: 'Exact filename match' };

  const exactTitle = allScores.find(
    s => s.display_title.toLowerCase() === requestedTitle.toLowerCase()
  );
  if (exactTitle) return { score: exactTitle, confidence: 1.0, reason: 'Exact display title match' };

  const normalizedMatch = allScores.find(s => s.normalized_title === normalizedInput);
  if (normalizedMatch) return { score: normalizedMatch, confidence: 0.85, reason: 'Normalized title match' };

  const fuse = new Fuse(allScores, {
    keys: ['display_title', 'normalized_title', 'original_filename'],
    threshold: 0.4,
    includeScore: true,
  });
  const fuzzyResults = fuse.search(requestedTitle);
  if (fuzzyResults.length > 0) {
    const best = fuzzyResults[0];
    const confidence = Math.round((1 - (best.score || 0.5)) * 100) / 100;
    if (confidence >= 0.4) {
      return { score: best.item, confidence, reason: `Fuzzy match (${confidence})` };
    }
  }

  return null;
}

// ── Aliases ──

export function getAliases() {
  return getClientDb().prepare(`
    SELECT a.*, s.display_title as score_display_title, s.forscore_path as score_forscore_path
    FROM aliases a JOIN scores s ON a.score_id = s.id
    ORDER BY a.alias_text ASC
  `).all();
}

export function createAlias(aliasText: string, scoreId: number, source = 'manual') {
  const db = getClientDb();
  const norm = normalize(aliasText);
  const existing = db.prepare('SELECT id FROM aliases WHERE normalized_alias = ? AND score_id = ?').get(norm, scoreId);
  if (existing) return null;

  const result = db.prepare(`
    INSERT INTO aliases (alias_text, normalized_alias, score_id, source, confidence) VALUES (?, ?, ?, ?, 1.0)
  `).run(aliasText, norm, scoreId, source);
  return db.prepare('SELECT * FROM aliases WHERE id = ?').get(result.lastInsertRowid);
}

export function deleteAlias(id: number) {
  getClientDb().prepare('DELETE FROM aliases WHERE id = ?').run(id);
}

// ── Setlists ──

export function getSetlists() {
  return getClientDb().prepare('SELECT * FROM setlists ORDER BY created_at DESC').all();
}

export function createSetlist(text: string) {
  const db = getClientDb();
  const lines = text.trim().split('\n').filter(l => l.trim());
  const name = lines[0] || 'Untitled Setlist';
  const items = lines.slice(1).map(l => l.trim()).filter(Boolean);

  const result = db.prepare('INSERT INTO setlists (name, source_text) VALUES (?, ?)').run(name, text);
  const setlistId = result.lastInsertRowid;

  for (let i = 0; i < items.length; i++) {
    const title = items[i];
    const match = matchTitle(title);
    db.prepare(`
      INSERT INTO setlist_items (setlist_id, position, requested_title, matched_score_id, match_status, confidence, match_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      setlistId, i + 1, title,
      match ? match.score.id : null,
      match ? (match.confidence >= 0.85 ? 'matched' : 'needs_review') : 'missing',
      match ? match.confidence : 0,
      match ? match.reason : null,
    );
  }

  return getSetlist(setlistId);
}

export function getSetlist(id: number) {
  const db = getClientDb();
  const setlist = db.prepare('SELECT * FROM setlists WHERE id = ?').get(id);
  if (!setlist) return null;
  const items = db.prepare(`
    SELECT si.*, s.display_title as matched_display_title, s.forscore_path as matched_forscore_path,
           s.original_filename as matched_original_filename
    FROM setlist_items si
    LEFT JOIN scores s ON si.matched_score_id = s.id
    WHERE si.setlist_id = ?
    ORDER BY si.position
  `).all(id);
  return { ...(setlist as object), items };
}

export function deleteSetlist(id: number) {
  const db = getClientDb();
  db.prepare('DELETE FROM setlist_items WHERE setlist_id = ?').run(id);
  db.prepare('DELETE FROM setlists WHERE id = ?').run(id);
}

export function addSetlistItem(setlistId: number, payload: { score_id?: number; requested_title?: string }) {
  const db = getClientDb();
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),0) as max FROM setlist_items WHERE setlist_id = ?').get(setlistId) as any)?.max ?? 0;
  const nextPos = maxPos + 1;

  if (payload.score_id) {
    const score = db.prepare('SELECT * FROM scores WHERE id = ?').get(payload.score_id) as any;
    if (!score) return null;
    const result = db.prepare(`
      INSERT INTO setlist_items (setlist_id, position, requested_title, matched_score_id, match_status, confidence, match_reason)
      VALUES (?, ?, ?, ?, 'matched', 1.0, 'Manually added')
    `).run(setlistId, nextPos, score.display_title, payload.score_id);
    return db.prepare(`
      SELECT si.*, s.display_title as matched_display_title, s.forscore_path as matched_forscore_path
      FROM setlist_items si LEFT JOIN scores s ON si.matched_score_id = s.id WHERE si.id = ?
    `).get(result.lastInsertRowid);
  }

  if (payload.requested_title) {
    const match = matchTitle(payload.requested_title);
    const result = db.prepare(`
      INSERT INTO setlist_items (setlist_id, position, requested_title, matched_score_id, match_status, confidence, match_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      setlistId, nextPos, payload.requested_title,
      match ? match.score.id : null,
      match ? (match.confidence >= 0.85 ? 'matched' : 'needs_review') : 'missing',
      match ? match.confidence : 0,
      match ? match.reason : null,
    );
    return db.prepare(`
      SELECT si.*, s.display_title as matched_display_title, s.forscore_path as matched_forscore_path
      FROM setlist_items si LEFT JOIN scores s ON si.matched_score_id = s.id WHERE si.id = ?
    `).get(result.lastInsertRowid);
  }

  return null;
}

export function deleteSetlistItem(setlistId: number, itemId: number) {
  getClientDb().prepare('DELETE FROM setlist_items WHERE id = ? AND setlist_id = ?').run(itemId, setlistId);
}

export function reorderSetlistItems(setlistId: number, itemIds: number[]) {
  const db = getClientDb();
  for (let i = 0; i < itemIds.length; i++) {
    db.prepare("UPDATE setlist_items SET position = ?, updated_at = datetime('now') WHERE id = ? AND setlist_id = ?")
      .run(i + 1, itemIds[i], setlistId);
  }
}

export function exportSetlistXml(setlistId: number): { xml: string; name: string } | null {
  const setlist = getSetlist(setlistId) as any;
  if (!setlist) return null;

  const exportItems = setlist.items.map((item: any) => ({
    requested_title: item.requested_title,
    match_status: item.match_status,
    matched_score: item.matched_score_id ? {
      display_title: item.matched_display_title,
      forscore_path: item.matched_forscore_path,
    } : null,
  }));

  return { xml: generateSetlistXml(setlist.name, exportItems), name: setlist.name };
}

export function rebuildLibraryFromFilenames(filenames: string[]): { added: number; skipped: number } {
  const db = getClientDb();
  const existing = db.prepare('SELECT forscore_path FROM scores').all() as { forscore_path: string }[];
  const existingPaths = new Set(existing.map(r => r.forscore_path));

  const insertStmt = db.prepare(`
    INSERT INTO scores (original_filename, original_relative_path, original_absolute_path,
      forscore_path, display_title, normalized_title, detected_key, version_label, file_size, status)
    VALUES (?, '', '', ?, ?, ?, ?, ?, ?, 'new')
  `);

  let added = 0, skipped = 0;
  for (const filename of filenames) {
    if (!filename.toLowerCase().endsWith('.pdf')) continue;
    if (existingPaths.has(filename)) { skipped++; continue; }
    const cleanTitle = guessCleanTitle(filename);
    const normalizedTitle = normalize(filename);
    const key = detectKey(filename);
    const version = detectVersionLabel(filename);
    insertStmt.run(filename, filename, cleanTitle, normalizedTitle, key, version, 0);
    existingPaths.add(filename);
    added++;
  }
  return { added, skipped };
}

// ── Setlist updates ──

export function renameSetlist(setlistId: number, name: string) {
  const db = getClientDb();
  db.prepare("UPDATE setlists SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name.trim(), setlistId);
}

// ── Setlist item updates ──

export function updateSetlistItem(itemId: number, fields: { matched_score_id?: number | null; match_status?: string }) {
  const db = getClientDb();
  const updates: string[] = [];
  const values: any[] = [];

  if ('matched_score_id' in fields) {
    updates.push('matched_score_id = ?');
    values.push(fields.matched_score_id);
  }
  if ('match_status' in fields) {
    updates.push('match_status = ?');
    values.push(fields.match_status);
  }
  if (updates.length === 0) return;
  updates.push("updated_at = datetime('now')");
  values.push(itemId);
  db.prepare(`UPDATE setlist_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function rematchSetlist(setlistId: number) {
  const db = getClientDb();
  const items = db.prepare('SELECT * FROM setlist_items WHERE setlist_id = ? ORDER BY position').all(setlistId) as any[];

  for (const item of items) {
    if (item.approved) continue;
    const match = matchTitle(item.requested_title);
    if (match) {
      const status = match.confidence >= 0.85 ? 'matched' : 'needs_review';
      db.prepare("UPDATE setlist_items SET matched_score_id = ?, match_status = ?, confidence = ?, match_reason = ?, updated_at = datetime('now') WHERE id = ?")
        .run(match.score.id, status, match.confidence, match.reason, item.id);
    } else {
      db.prepare("UPDATE setlist_items SET matched_score_id = NULL, match_status = 'missing', confidence = 0, match_reason = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(item.id);
    }
  }
}

// ── Settings ──

export function getSettings(): Record<string, string> {
  const rows = getClientDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function updateSettings(settings: Record<string, string>) {
  const db = getClientDb();
  for (const [key, value] of Object.entries(settings)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
  }
}
