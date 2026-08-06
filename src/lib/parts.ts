/**
 * Instrument views over a setlist.
 *
 * A view is derived on read, never stored as a copy of the setlist: the user
 * keeps exactly one main setlist, and every instrument view recomputes from it.
 * Adding, removing, reordering, or re-matching a song therefore shows up in
 * every view with no synchronisation step.
 *
 * Only manual overrides are persisted (setlist_item_parts).
 */

import { getClientDb } from './client-db';
import { coreTitleOf } from './data';
import { familyFallbacks, GENERIC_EQUIVALENTS, isGeneric } from './instruments';
import { Score } from './types';

export type PartSource =
  | 'manual'    // user picked this score for this instrument
  | 'exact'     // a score labelled with exactly this instrument
  | 'family'    // the section chart (Violin → Strings, Trumpet → Horns)
  | 'generic'   // an unlabelled score, shared by every instrument
  | 'fallback'  // a Lead Sheet / Full Score anyone can read
  | 'missing';  // nothing suitable — shown, never silently dropped

export interface ResolvedPart {
  item_id: number;
  position: number;
  requested_title: string;
  is_separator: boolean;
  instrument: string;
  score_id: number | null;
  display_title: string | null;
  forscore_path: string | null;
  detected_key: string | null;
  version_label: string | null;
  source: PartSource;
  reason: string;
}

/**
 * Pick between several candidates for the same instrument. Deterministic so a
 * view never reshuffles between renders: same key as the main score first, then
 * reviewed scores, then the shortest title, then the oldest record.
 */
function preferBest(candidates: Score[], anchor: Score | null): Score {
  const anchorKey = anchor?.detected_key ?? null;
  return [...candidates].sort((a, b) => {
    if (anchorKey) {
      const ak = a.detected_key === anchorKey ? 0 : 1;
      const bk = b.detected_key === anchorKey ? 0 : 1;
      if (ak !== bk) return ak - bk;
    }
    const ar = a.status === 'reviewed' ? 0 : 1;
    const br = b.status === 'reviewed' ? 0 : 1;
    if (ar !== br) return ar - br;
    if (a.display_title.length !== b.display_title.length) {
      return a.display_title.length - b.display_title.length;
    }
    return a.id - b.id;
  })[0];
}

/**
 * Choose the score an instrument should play for one song.
 *
 * Priority: manual override, then a part written for that exact instrument,
 * then the section chart, then a generic score, then a universally readable
 * chart. A dedicated part always beats a shared one — a trumpet player with
 * their own chart never receives the horns-section chart instead, and a
 * violinist never receives the cello part.
 */
export function resolveForInstrument(
  variations: Score[],
  instrument: string,
  anchor: Score | null,
  override: Score | null,
): { score: Score | null; source: PartSource; reason: string } {
  if (override) {
    return { score: override, source: 'manual', reason: 'Chosen by you' };
  }

  const exact = variations.filter(s => s.version_label === instrument);
  if (exact.length) {
    return { score: preferBest(exact, anchor), source: 'exact', reason: `${instrument} part` };
  }

  for (const section of familyFallbacks(instrument)) {
    const hits = variations.filter(s => s.version_label === section);
    if (hits.length) {
      return {
        score: preferBest(hits, anchor),
        source: 'family',
        reason: `No ${instrument} part — using the ${section} chart`,
      };
    }
  }

  const generic = variations.filter(s => isGeneric(s.version_label));
  if (generic.length) {
    return {
      score: preferBest(generic, anchor),
      source: 'generic',
      reason: 'Shared score (no instrument specified)',
    };
  }

  for (const kind of GENERIC_EQUIVALENTS) {
    const hits = variations.filter(s => s.version_label === kind);
    if (hits.length) {
      return { score: preferBest(hits, anchor), source: 'fallback', reason: `Using the ${kind}` };
    }
  }

  return { score: null, source: 'missing', reason: `No score for ${instrument}` };
}

interface RawItem {
  id: number;
  position: number;
  requested_title: string;
  matched_score_id: number | null;
  match_status: string;
}

/**
 * Resolve every song in a setlist for one instrument, in setlist order.
 * Separators pass straight through so section breaks survive in every view.
 */
export function getInstrumentView(setlistId: number, instrument: string): ResolvedPart[] {
  const db = getClientDb();

  const items = db.prepare(
    'SELECT id, position, requested_title, matched_score_id, match_status FROM setlist_items WHERE setlist_id = ? ORDER BY position'
  ).all(setlistId) as RawItem[];
  if (!items.length) return [];

  const allScores = db.prepare('SELECT * FROM scores WHERE status != ?').all('ignored') as Score[];
  const byId = new Map<number, Score>(allScores.map(s => [s.id, s]));

  // Group every score by its variation key once, then look songs up by key.
  const byCore = new Map<string, Score[]>();
  for (const s of allScores) {
    const key = coreTitleOf(s.normalized_title);
    const list = byCore.get(key);
    if (list) list.push(s); else byCore.set(key, [s]);
  }

  const overrideRows = db.prepare(`
    SELECT p.setlist_item_id, p.score_id FROM setlist_item_parts p
    JOIN setlist_items i ON i.id = p.setlist_item_id
    WHERE i.setlist_id = ? AND p.instrument = ?
  `).all(setlistId, instrument) as { setlist_item_id: number; score_id: number | null }[];
  const overrides = new Map(overrideRows.map(r => [r.setlist_item_id, r.score_id]));

  return items.map(item => {
    const base = {
      item_id: item.id,
      position: item.position,
      requested_title: item.requested_title,
      instrument,
    };

    if (item.match_status === 'placeholder') {
      return {
        ...base, is_separator: true,
        score_id: null, display_title: null, forscore_path: null,
        detected_key: null, version_label: null,
        source: 'generic' as PartSource, reason: 'Section separator',
      };
    }

    const anchor = item.matched_score_id ? byId.get(item.matched_score_id) ?? null : null;
    const overrideId = overrides.get(item.id);
    const override = overrideId ? byId.get(overrideId) ?? null : null;

    // Variations of this song: everything sharing the matched score's core
    // title. With no match yet, fall back to the requested title so the song
    // can still resolve once a matching file exists.
    const key = anchor
      ? coreTitleOf(anchor.normalized_title)
      : coreTitleOf(item.requested_title.toLowerCase());
    const variations = byCore.get(key) ?? (anchor ? [anchor] : []);

    const { score, source, reason } = resolveForInstrument(variations, instrument, anchor, override);

    return {
      ...base,
      is_separator: false,
      score_id: score?.id ?? null,
      display_title: score?.display_title ?? null,
      forscore_path: score?.forscore_path ?? null,
      detected_key: score?.detected_key ?? null,
      version_label: score?.version_label ?? null,
      source,
      reason,
    };
  });
}

/** Candidate scores for a song, so the override picker can offer them first. */
export function getVariationsForItem(itemId: number): Score[] {
  const db = getClientDb();
  const item = db.prepare(
    'SELECT requested_title, matched_score_id FROM setlist_items WHERE id = ?'
  ).get(itemId) as { requested_title: string; matched_score_id: number | null } | null;
  if (!item) return [];

  const anchor = item.matched_score_id
    ? db.prepare('SELECT * FROM scores WHERE id = ?').get(item.matched_score_id) as Score | null
    : null;

  const key = anchor
    ? coreTitleOf(anchor.normalized_title)
    : coreTitleOf(item.requested_title.toLowerCase());

  const all = db.prepare('SELECT * FROM scores WHERE status != ?').all('ignored') as Score[];
  return all.filter(s => coreTitleOf(s.normalized_title) === key);
}
