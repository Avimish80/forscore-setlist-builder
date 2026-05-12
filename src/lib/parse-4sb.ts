/**
 * Parser for forScore .4sb backup files (4SBV03 format).
 *
 * File layout:
 *   - 75-byte text header: magic + metadata
 *   - First gzip block: setlist/library plist (we skip this)
 *   - PDF entries (repeated), each:
 *       · 32-byte header: 16-char filename-length + 16-char gzip-size (space-padded, right-aligned)
 *       · filename bytes (UTF-8, starts with "{%DOCUMENTS_DIR%}/")
 *       · gzip-compressed PDF bytes
 *
 * For each entry we both decompress the PDF (→ IndexedDB) and create a row
 * in the scores table (→ SQLite) so the library is populated automatically.
 */

import pako from 'pako';
import { storePdf } from './pdf-store';
import { getClientDb } from './client-db';
import { guessCleanTitle, normalize, detectKey, detectVersionLabel } from './normalizer';

const ENTRY_HEADER_SIZE = 32;
const PATH_PREFIX = '{%DOCUMENTS_DIR%}/';

export interface ImportProgress {
  total: number;
  done: number;
  currentFile: string;
}

export interface ImportResult {
  pdfs: number;
  scoresAdded: number;
  scoresSkipped: number;
}

export async function import4sb(
  data: ArrayBuffer,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const bytes = new Uint8Array(data);
  const decoder = new TextDecoder('utf-8');

  // Validate magic
  const magic = decoder.decode(bytes.slice(0, 14));
  if (!magic.startsWith('<--4SBV0')) {
    throw new Error('Not a valid forScore backup file (.4sb)');
  }

  // Find the first PDF entry by scanning for the {%DOCUMENTS_DIR%}/ marker.
  // The marker is at the start of the filename, which sits exactly
  // ENTRY_HEADER_SIZE bytes after the start of each entry header.
  const markerBytes = new TextEncoder().encode(PATH_PREFIX);
  let firstMarkerPos = -1;
  outer: for (let i = 100; i < bytes.length - markerBytes.length; i++) {
    for (let j = 0; j < markerBytes.length; j++) {
      if (bytes[i + j] !== markerBytes[j]) continue outer;
    }
    firstMarkerPos = i;
    break;
  }

  if (firstMarkerPos === -1) {
    throw new Error('No PDF entries found in backup file');
  }

  let offset = firstMarkerPos - ENTRY_HEADER_SIZE;

  // Count entries for progress
  let total = 0;
  {
    let scan = offset;
    while (scan + ENTRY_HEADER_SIZE < bytes.length) {
      const hdr = decoder.decode(bytes.slice(scan, scan + ENTRY_HEADER_SIZE));
      const fnLen = parseInt(hdr.slice(0, 16).trim(), 10);
      const gzSize = parseInt(hdr.slice(16).trim(), 10);
      if (isNaN(fnLen) || isNaN(gzSize) || fnLen <= 0 || gzSize <= 0) break;
      total++;
      scan += ENTRY_HEADER_SIZE + fnLen + gzSize;
    }
  }

  // Pre-load existing score filenames so we can skip duplicates cheaply
  const db = getClientDb();
  const existing = db.prepare('SELECT forscore_path FROM scores').all() as { forscore_path: string }[];
  const existingPaths = new Set(existing.map(r => r.forscore_path));

  const insertStmt = db.prepare(`
    INSERT INTO scores (original_filename, original_relative_path, original_absolute_path,
      forscore_path, display_title, normalized_title, detected_key, version_label, file_size, status)
    VALUES (?, '', '', ?, ?, ?, ?, ?, ?, 'new')
  `);

  let pdfs = 0;
  let scoresAdded = 0;
  let scoresSkipped = 0;

  while (offset + ENTRY_HEADER_SIZE < bytes.length) {
    const hdr = decoder.decode(bytes.slice(offset, offset + ENTRY_HEADER_SIZE));
    const fnLen = parseInt(hdr.slice(0, 16).trim(), 10);
    const gzSize = parseInt(hdr.slice(16).trim(), 10);
    if (isNaN(fnLen) || isNaN(gzSize) || fnLen <= 0 || gzSize <= 0) break;
    offset += ENTRY_HEADER_SIZE;

    const rawFilename = decoder.decode(bytes.slice(offset, offset + fnLen));
    offset += fnLen;

    const filename = rawFilename.startsWith(PATH_PREFIX)
      ? rawFilename.slice(PATH_PREFIX.length)
      : rawFilename;

    const gzData = bytes.slice(offset, offset + gzSize);
    offset += gzSize;

    // Only treat .pdf entries as scores; skip annotations, MIDI, etc.
    const isPdf = filename.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      try {
        const pdf = pako.ungzip(gzData);
        await storePdf(filename, pdf);
        pdfs++;

        // Add a score row if we don't already have one for this file
        if (!existingPaths.has(filename)) {
          const cleanTitle = guessCleanTitle(filename);
          const normalizedTitle = normalize(filename);
          const key = detectKey(filename);
          const version = detectVersionLabel(filename);
          insertStmt.run(filename, filename, cleanTitle, normalizedTitle, key, version, pdf.length);
          existingPaths.add(filename);
          scoresAdded++;
        } else {
          scoresSkipped++;
        }
      } catch (e) {
        console.warn(`Failed to decompress ${filename}:`, e);
      }
    }

    if (onProgress && (pdfs + scoresSkipped) % 50 === 0) {
      onProgress({ total, done: pdfs + scoresSkipped, currentFile: filename });
      await new Promise(r => setTimeout(r, 0)); // yield to UI
    }
  }

  // Persist the database changes (scheduleSave in client-db handles this,
  // but force an immediate save by exporting + reimporting via the same path)
  // The scheduled save will pick it up automatically.

  if (onProgress) {
    onProgress({ total, done: total, currentFile: 'Done' });
  }

  return { pdfs, scoresAdded, scoresSkipped };
}
