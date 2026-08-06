const KNOWN_KEYS = [
  'Ab', 'A', 'A#', 'Bb', 'B', 'C', 'C#', 'Db', 'D', 'D#',
  'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#',
  'Abm', 'Am', 'A#m', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dbm', 'Dm', 'D#m',
  'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m',
];

import { detectInstrument } from './instruments';

export function normalize(text: string): string {
  return text
    .replace(/\.pdf$/i, '')
    .replace(/^\d{3,}-/, '')
    .replace(/[_-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function detectKey(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '');
  for (const key of KNOWN_KEYS) {
    const pattern = new RegExp(`(?:^|[\\s_-])${key.replace('#', '\\#')}(?:$|[\\s_.-])`, 'i');
    if (pattern.test(name)) {
      const matched = KNOWN_KEYS.find(k => k.toLowerCase() === key.toLowerCase());
      return matched || key;
    }
  }
  const trailingKey = name.match(/[-_\s]([A-G][b#]?m?)$/);
  if (trailingKey) {
    const candidate = trailingKey[1];
    if (KNOWN_KEYS.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * The instrument a file is written for. Delegates to the shared instrument
 * vocabulary so imports, matching, and instrument views all agree.
 */
export function detectVersionLabel(filename: string): string | null {
  return detectInstrument(filename).instrument;
}

export function guessCleanTitle(filename: string): string {
  let title = filename
    .replace(/\.pdf$/i, '')
    .replace(/^\d{3,}-/, '');

  title = title.replace(/[_-]/g, ' ');
  title = title.replace(/\s+/g, ' ').trim();

  title = title.replace(/\b\w/g, c => c.toUpperCase());

  return title;
}
