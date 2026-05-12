/**
 * Parser for forScore .4sb backup files (4SBV03 format).
 *
 * File layout:
 *   - 75-byte text header: magic + metadata
 *   - First gzip block: setlist/library plist (we skip this)
 *   - PDF entries (4,768 of them), each:
 *       · 32-byte header: 16-char filename-length + 16-char gzip-size (space-padded, right-aligned)
 *       · filename bytes (UTF-8, starts with "{%DOCUMENTS_DIR%}/")
 *       · gzip-compressed PDF bytes
 *
 * Strategy: locate the first entry by scanning for the "{%DOCUMENTS_DIR%}" marker,
 * then walk forward entry-by-entry using the size fields.
 */

import pako from 'pako';
import { storePdf } from './pdf-store';

const ENTRY_HEADER_SIZE = 32;
const PATH_PREFIX = '{%DOCUMENTS_DIR%}/';

export interface ImportProgress {
  total: number;
  done: number;
  currentFile: string;
}

export async function import4sb(
  data: ArrayBuffer,
  onProgress?: (p: ImportProgress) => void,
): Promise<number> {
  const bytes = new Uint8Array(data);
  const decoder = new TextDecoder('utf-8');

  // Validate magic
  const magic = decoder.decode(bytes.slice(0, 14));
  if (!magic.startsWith('<--4SBV0')) {
    throw new Error('Not a valid forScore backup file (.4sb)');
  }

  // Find first entry by scanning for the {%DOCUMENTS_DIR%} marker.
  // The marker sits at the start of the filename, which is exactly
  // ENTRY_HEADER_SIZE (32) bytes after the start of each entry header.
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

  // The 32-byte entry header precedes the filename.
  let offset = firstMarkerPos - ENTRY_HEADER_SIZE;

  // First pass: count entries so we can show accurate progress.
  let total = 0;
  let scanOffset = offset;
  while (scanOffset + ENTRY_HEADER_SIZE < bytes.length) {
    const hdr = decoder.decode(bytes.slice(scanOffset, scanOffset + ENTRY_HEADER_SIZE));
    const fnLen = parseInt(hdr.slice(0, 16).trim(), 10);
    const gzSize = parseInt(hdr.slice(16).trim(), 10);
    if (isNaN(fnLen) || isNaN(gzSize) || fnLen <= 0 || gzSize <= 0) break;
    total++;
    scanOffset += ENTRY_HEADER_SIZE + fnLen + gzSize;
  }

  // Second pass: extract and store each PDF.
  let done = 0;
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

    try {
      const pdf = pako.ungzip(gzData);
      await storePdf(filename, pdf);
    } catch (e) {
      console.warn(`Failed to decompress ${filename}:`, e);
    }

    done++;
    if (onProgress && done % 50 === 0) {
      onProgress({ total, done, currentFile: filename });
      await new Promise(r => setTimeout(r, 0)); // yield to UI
    }
  }

  if (onProgress) {
    onProgress({ total, done, currentFile: 'Done' });
  }

  return done;
}
