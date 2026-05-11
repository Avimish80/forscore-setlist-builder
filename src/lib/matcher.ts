import Fuse from 'fuse.js';
import { getDb } from './db';
import { normalize } from './normalizer';
import { Score, MatchResult } from './types';

export function matchTitle(requestedTitle: string): MatchResult | null {
  const db = getDb();
  const normalizedInput = normalize(requestedTitle);

  // 1. Confirmed alias exact match
  const alias = db.prepare(`
    SELECT a.*, s.* FROM aliases a
    JOIN scores s ON a.score_id = s.id
    WHERE a.normalized_alias = ? AND s.status != 'ignored'
    ORDER BY a.confidence DESC
    LIMIT 1
  `).get(normalizedInput) as any;

  if (alias) {
    return {
      score: rowToScore(alias),
      confidence: 1.0,
      reason: `Alias match: "${alias.alias_text}"`,
    };
  }

  const allScores = db.prepare(`
    SELECT * FROM scores WHERE status != 'ignored'
  `).all() as Score[];

  // 2. Exact filename match
  const exactFilename = allScores.find(
    s => s.original_filename.replace(/\.pdf$/i, '').toLowerCase() === requestedTitle.toLowerCase()
  );
  if (exactFilename) {
    return { score: exactFilename, confidence: 1.0, reason: 'Exact filename match' };
  }

  // 3. Exact display title match
  const exactTitle = allScores.find(
    s => s.display_title.toLowerCase() === requestedTitle.toLowerCase()
  );
  if (exactTitle) {
    return { score: exactTitle, confidence: 1.0, reason: 'Exact display title match' };
  }

  // 4. Case-insensitive match
  const caseInsensitive = allScores.find(
    s => s.display_title.toLowerCase() === requestedTitle.toLowerCase()
      || s.forscore_path.replace(/\.pdf$/i, '').toLowerCase() === requestedTitle.toLowerCase()
  );
  if (caseInsensitive) {
    return { score: caseInsensitive, confidence: 0.95, reason: 'Case-insensitive match' };
  }

  // 5. Normalized match
  const normalizedMatch = allScores.find(s => s.normalized_title === normalizedInput);
  if (normalizedMatch) {
    return { score: normalizedMatch, confidence: 0.85, reason: 'Normalized title match' };
  }

  // 6. Fuzzy match
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
      return {
        score: best.item,
        confidence,
        reason: `Fuzzy match (score: ${confidence})`,
      };
    }
  }

  return null;
}

export function searchScores(query: string, limit: number = 20): Score[] {
  const db = getDb();
  const allScores = db.prepare(`SELECT * FROM scores WHERE status != 'ignored'`).all() as Score[];

  if (!query.trim()) return allScores.slice(0, limit);

  const fuse = new Fuse(allScores, {
    keys: ['display_title', 'original_filename', 'normalized_title'],
    threshold: 0.4,
    includeScore: true,
  });

  return fuse.search(query, { limit }).map(r => r.item);
}

function rowToScore(row: any): Score {
  return {
    id: row.score_id || row.id,
    original_filename: row.original_filename,
    original_relative_path: row.original_relative_path,
    original_absolute_path: row.original_absolute_path,
    forscore_path: row.forscore_path,
    display_title: row.display_title,
    normalized_title: row.normalized_title,
    detected_key: row.detected_key,
    version_label: row.version_label,
    file_size: row.file_size,
    modified_at: row.modified_at,
    status: row.status,
    preferred_duplicate_group_id: row.preferred_duplicate_group_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
