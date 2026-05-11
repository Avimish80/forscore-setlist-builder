/**
 * Parser for forScore .4sb backup files.
 *
 * Format (4SBV03):
 *   Header (75 bytes):
 *     - "<--4SBV03-->" magic (14 bytes)
 *     - padding + entry count + first-block size + archive name
 *   First gzip block: setlist/library plist metadata (we skip this)
 *   PDF entries (repeated):
 *     - 32-byte header: 16-char filename length + 16-char gzip size (right-aligned, space-padded)
 *     - filename (UTF-8, variable length — starts with {%DOCUMENTS_DIR%}/)
 *     - gzip-compressed PDF data
 */

import pako from 'pako';
import { storePdf } from './pdf-store';

const HEADER_SIZE = 75;
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
    throw new Error('Not a valid forScore backup file');
  }

  // Parse header: extract first gzip block size
  const headerText = decoder.decode(bytes.slice(0, HEADER_SIZE));
  // Format: "<--4SBV03-->              31         1997978Archive..."
  // The first-block size is the second number in the header
  const nums = headerText.match(/\d+/g);
  if (!nums || nums.length < 2) {
    throw new Error('Cannot parse backup header');
  }
  const firstBlockSize = parseInt(nums[1], 10);

  // Skip header + first gzip block to reach PDF entries
  let offset = HEADER_SIZE + firstBlockSize;

  // Count entries by scanning for {%DOCUMENTS_DIR%}
  // (faster than parsing everything twice)
  let total = 0;
  let scanOffset = offset;
  while (scanOffset + ENTRY_HEADER_SIZE < bytes.length) {
    const headerSlice = decoder.decode(bytes.slice(scanOffset, scanOffset + ENTRY_HEADER_SIZE));
    const fnLen = parseInt(headerSlice.slice(0, 16).trim(), 10);
    const gzSize = parseInt(headerSlice.slice(16).trim(), 10);
    if (isNaN(fnLen) || isNaN(gzSize) || fnLen <= 0 || gzSize <= 0) break;
    total++;
    scanOffset += ENTRY_HEADER_SIZE + fnLen + gzSize;
  }

  // Now parse and extract each entry
  let done = 0;
  while (offset + ENTRY_HEADER_SIZE < bytes.length) {
    // Read 32-byte entry header
    const headerSlice = decoder.decode(bytes.slice(offset, offset + ENTRY_HEADER_SIZE));
    const fnLen = parseInt(headerSlice.slice(0, 16).trim(), 10);
    const gzSize = parseInt(headerSlice.slice(16).trim(), 10);
    if (isNaN(fnLen) || isNaN(gzSize) || fnLen <= 0 || gzSize <= 0) break;
    offset += ENTRY_HEADER_SIZE;

    // Read filename
    const rawFilename = decoder.decode(bytes.slice(offset, offset + fnLen));
    offset += fnLen;

    // Strip {%DOCUMENTS_DIR%}/ prefix to get bare filename
    const filename = rawFilename.startsWith(PATH_PREFIX)
      ? rawFilename.slice(PATH_PREFIX.length)
      : rawFilename;

    // Read and decompress gzip data
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
      // Yield to UI thread
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Final progress callback
  if (onProgress) {
    onProgress({ total, done, currentFile: 'Done' });
  }

  return done;
}
