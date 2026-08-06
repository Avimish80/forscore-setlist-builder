/**
 * Instrument vocabulary and detection.
 *
 * forScore's own backup metadata carries no instrument information (title is
 * just the filename, and genre/composer/keywords are populated on well under
 * 2% of a real library), so the app's own `scores.version_label` column is the
 * structured source of truth. This module supplies the vocabulary that fills
 * and interprets it.
 */

/** Canonical instrument names. `version_label` stores one of these, or '' for generic. */
export const INSTRUMENTS = [
  'Lead Sheet', 'Full Score', 'Rhythm',
  'Piano', 'Piano/Vocal', 'Keyboard', 'Organ',
  'Guitar', 'Bass', 'Drums',
  'Violin', 'Viola', 'Cello', 'Strings',
  'Flute', 'Clarinet',
  'Saxophone', 'Alto Sax', 'Tenor Sax',
  'Trumpet', 'Trombone', 'Horns',
  'Vocal', 'Other',
] as const;

export type Instrument = string;

/**
 * Fallback chain per instrument: a player without a dedicated part inherits
 * their *section* chart, never a sibling's part. A violinist may read the
 * Strings chart; they must never be handed the Cello part.
 *
 * Ordered most- to least-specific. An empty list means "generic only".
 */
const FAMILY: Record<string, string[]> = {
  'Violin': ['Strings'],
  'Viola': ['Strings'],
  'Cello': ['Strings'],
  'Flute': ['Strings'],
  'Strings': [],

  'Alto Sax': ['Saxophone', 'Horns'],
  'Tenor Sax': ['Saxophone', 'Horns'],
  'Saxophone': ['Horns'],
  'Trumpet': ['Horns'],
  'Trombone': ['Horns'],
  'Clarinet': ['Horns'],
  'Horns': [],

  // Keyboard instruments read each other's charts freely — same clefs, same
  // notes. This is deliberately two-way, unlike the string and horn families
  // where each part is genuinely different music.
  'Keyboard': ['Piano', 'Organ', 'Rhythm'],
  'Organ': ['Keyboard', 'Piano', 'Rhythm'],
  'Piano/Vocal': ['Piano', 'Keyboard', 'Rhythm'],
  'Piano': ['Keyboard', 'Piano/Vocal', 'Rhythm'],

  'Guitar': ['Rhythm'],
  'Bass': ['Rhythm'],
  'Drums': ['Rhythm'],
  'Rhythm': [],

  'Vocal': ['Lead Sheet'],
};

/** Charts any player can read once no dedicated or section part exists. */
export const GENERIC_EQUIVALENTS = ['Lead Sheet', 'Full Score'];

export function familyFallbacks(instrument: string): string[] {
  return FAMILY[instrument] ?? [];
}

/**
 * Synonyms and abbreviations → canonical name.
 * Keys are lowercase and matched on word boundaries.
 */
const SYNONYMS: Record<string, string> = {
  'lead sheet': 'Lead Sheet', 'leadsheet': 'Lead Sheet', 'chord chart': 'Lead Sheet', 'chords': 'Lead Sheet',
  'full score': 'Full Score', 'conductor': 'Full Score', 'partitur': 'Full Score',
  'rhythm': 'Rhythm', 'rhythm section': 'Rhythm', 'rhythem': 'Rhythm',

  'piano': 'Piano', 'pno': 'Piano', 'pf': 'Piano',
  'piano vocal': 'Piano/Vocal', 'piano/vocal': 'Piano/Vocal', 'pianovocal': 'Piano/Vocal',
  'keyboard': 'Keyboard', 'keyboards': 'Keyboard', 'keys': 'Keyboard', 'kbd': 'Keyboard', 'rhodes': 'Keyboard', 'synth': 'Keyboard',
  'organ': 'Organ',

  'guitar': 'Guitar', 'gtr': 'Guitar', 'gt': 'Guitar',
  'electric guitar': 'Guitar', 'acoustic guitar': 'Guitar', 'nylon guitar': 'Guitar', 'classical guitar': 'Guitar',

  'bass': 'Bass', 'bass guitar': 'Bass', 'electric bass': 'Bass', 'upright bass': 'Bass',
  'double bass': 'Bass', 'contrabass': 'Bass', 'bs': 'Bass',

  'drums': 'Drums', 'drum': 'Drums', 'drum kit': 'Drums', 'drumkit': 'Drums', 'percussion': 'Drums', 'perc': 'Drums',

  'violin': 'Violin', 'violins': 'Violin', 'vln': 'Violin', 'vn': 'Violin', 'fiddle': 'Violin',
  'viola': 'Viola', 'vla': 'Viola',
  'cello': 'Cello', 'violoncello': 'Cello', 'vc': 'Cello', 'vlc': 'Cello',
  'strings': 'Strings', 'string section': 'Strings', 'str': 'Strings',

  'flute': 'Flute', 'fl': 'Flute', 'piccolo': 'Flute',
  'clarinet': 'Clarinet', 'cl': 'Clarinet',

  'saxophone': 'Saxophone', 'sax': 'Saxophone', 'sax section': 'Saxophone',
  'alto sax': 'Alto Sax', 'alto saxophone': 'Alto Sax', 'alto': 'Alto Sax', 'asax': 'Alto Sax',
  'tenor sax': 'Tenor Sax', 'tenor saxophone': 'Tenor Sax', 'tenor': 'Tenor Sax', 'tsax': 'Tenor Sax',

  'trumpet': 'Trumpet', 'trumpets': 'Trumpet', 'tpt': 'Trumpet', 'tp': 'Trumpet',
  'trombone': 'Trombone', 'trombones': 'Trombone', 'tbn': 'Trombone', 'tb': 'Trombone',
  'horns': 'Horns', 'horn section': 'Horns', 'brass': 'Horns', 'brass section': 'Horns', 'horn': 'Horns',

  'vocal': 'Vocal', 'vocals': 'Vocal', 'voice': 'Vocal', 'vox': 'Vocal',
  'singer': 'Vocal', 'lead vocal': 'Vocal', 'melody': 'Vocal',
};

/**
 * Abbreviations too short to be safe anywhere in a title — a song called
 * "TB or not TB" must not become a Trombone part. These are only honoured in a
 * clearly delimited trailing segment (" - TB", "(TB)", "_TB").
 */
const DELIMITED_ONLY = new Set([
  'gt', 'bs', 'vn', 'vc', 'fl', 'cl', 'tp', 'tb', 'pf', 'str', 'vla', 'vlc',
  'tpt', 'tbn', 'kbd', 'pno', 'gtr', 'perc', 'alto', 'tenor', 'keys', 'horn',
  'melody', 'chords',
]);

/** Longest synonyms first so "alto sax" wins over "sax", "bass guitar" over "guitar". */
const SYNONYM_KEYS = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

/**
 * Every instrument word, longest first — used to strip part names off a title
 * when grouping variations of the same song.
 */
export const INSTRUMENT_WORDS: readonly string[] = [
  ...SYNONYM_KEYS,
  // Arrangement descriptions that behave like part suffixes when grouping.
  'solo', 'band', 'quartet', 'trio', 'duo', 'orchestra', 'part', 'parts',
].sort((a, b) => b.length - a.length);

function cleanSegment(raw: string): string {
  return raw
    .toLowerCase()
    // forScore part numbering and duplicate suffixes: "Violin I", "Flute 2", "Viola II"
    .replace(/\b(i{1,3}|iv|v)\b\s*$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\bin\s+(?:bb|eb|f|c|a|d|g)\b/gi, '') // "Trumpet in Bb"
    .replace(/[^\p{L}\p{N}/\s]/gu, ' ')
    // "piano1" / "Guitar2" — a copy number glued to the part name
    .replace(/(\p{L})(\d+)/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve one delimited segment to a canonical instrument, or null. */
function resolveSegment(raw: string, allowShort: boolean): string | null {
  const seg = cleanSegment(raw);
  if (!seg) return null;

  if (SYNONYMS[seg] && (allowShort || !DELIMITED_ONLY.has(seg))) return SYNONYMS[seg];

  let best: { name: string; end: number; len: number } | null = null;
  for (const key of SYNONYM_KEYS) {
    if (!allowShort && DELIMITED_ONLY.has(key)) continue;
    const re = new RegExp(`(?:^|\\s)${key.replace(/[/]/g, '\\/')}(?:$|\\s)`, 'g');
    let m: RegExpExecArray | null;
    let start = -1;
    while ((m = re.exec(seg)) !== null) {
      // The pattern's (?:^|\s) prefix consumes a leading space, so step past it
      // to get the term's own offset.
      start = m.index + (m[0].length > key.length ? 1 : 0);
      re.lastIndex = m.index + 1;
    }
    if (start < 0) continue;
    // Compare where the term *ends*, then prefer the longer term: "Bass Guitar"
    // and "Guitar" end together, so the more specific one wins. Right-most-ends
    // also makes "STRINGS - Viola" a Viola part rather than a Strings part.
    const end = start + key.length;
    if (!best || end > best.end || (end === best.end && key.length > best.len)) {
      best = { name: SYNONYMS[key], end, len: key.length };
    }
  }
  if (!best) return null;

  // An undelimited title mention is only trusted near the end, where a part
  // name belongs. Otherwise a song called "Bass Rock Anthem" becomes a bass part.
  if (!allowShort) {
    // Copy numbers and scan ids ("piano 1 800") aren't words for this purpose.
    const trailingWords = seg.slice(best.end).trim().split(/\s+/)
      .filter(w => w && !/^\d+$/.test(w)).length;
    if (trailingWords > 1) return null;
  }
  return best.name;
}

export interface InstrumentDetection {
  instrument: string | null;
  /** How it was found — surfaced in the UI so an odd result is explainable. */
  source: 'segment' | 'parenthetical' | 'title' | null;
}

/**
 * Detect the instrument a file is written for, from its filename or title.
 *
 * Reads right-to-left and trusts delimited trailing segments first, which is
 * the shape forScore's own part extraction produces
 * ("A MILLION DREAMS-STRINGS - Violin I.pdf" is a Violin part).
 * Returns null rather than guessing when nothing matches cleanly.
 */
export function detectInstrument(filename: string): InstrumentDetection {
  const name = filename.replace(/\.pdf$/i, '').trim();

  // 1. Delimited segments, right to left: " - Violin I", "_GTR".
  // Only when a delimiter actually exists — otherwise the whole title would be
  // treated as a part name and short abbreviations would fire anywhere in it.
  const segments = name.split(/\s+-\s+|\s+[–—]\s+|_/).map(s => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    for (let i = segments.length - 1; i >= 0; i--) {
      const hit = resolveSegment(segments[i], true);
      if (hit) return { instrument: hit, source: 'segment' };
    }
  }

  // 2. Parenthetical: "Purple Rain (Piano)"
  const parens = Array.from(name.matchAll(/\(([^)]+)\)/g)).map(m => m[1]);
  for (let i = parens.length - 1; i >= 0; i--) {
    const hit = resolveSegment(parens[i], true);
    if (hit) return { instrument: hit, source: 'parenthetical' };
  }

  // 3. Anywhere in the title — full words only, right-most wins.
  const hit = resolveSegment(name, false);
  if (hit) return { instrument: hit, source: 'title' };

  return { instrument: null, source: null };
}

/** A score with no label, or one labelled with a universally readable chart type. */
export function isGeneric(versionLabel: string | null | undefined): boolean {
  return !versionLabel || versionLabel.trim() === '';
}
