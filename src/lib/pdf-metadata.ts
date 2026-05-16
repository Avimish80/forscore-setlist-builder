import { PDFDocument } from 'pdf-lib';
import { getPdf, storePdf } from './pdf-store';

// Maps our key notation → forScore's keysf (-7..7) and keymi (0=major, 1=minor)
const KEY_MAP: Record<string, { keysf: number; keymi: number }> = {
  'C':   { keysf:  0, keymi: 0 }, 'G':   { keysf:  1, keymi: 0 },
  'D':   { keysf:  2, keymi: 0 }, 'A':   { keysf:  3, keymi: 0 },
  'E':   { keysf:  4, keymi: 0 }, 'B':   { keysf:  5, keymi: 0 },
  'F#':  { keysf:  6, keymi: 0 }, 'C#':  { keysf:  7, keymi: 0 },
  'F':   { keysf: -1, keymi: 0 }, 'Bb':  { keysf: -2, keymi: 0 },
  'Eb':  { keysf: -3, keymi: 0 }, 'Ab':  { keysf: -4, keymi: 0 },
  'Db':  { keysf: -5, keymi: 0 }, 'Gb':  { keysf: -6, keymi: 0 },
  'Cb':  { keysf: -7, keymi: 0 },
  'Am':  { keysf:  0, keymi: 1 }, 'Em':  { keysf:  1, keymi: 1 },
  'Bm':  { keysf:  2, keymi: 1 }, 'F#m': { keysf:  3, keymi: 1 },
  'C#m': { keysf:  4, keymi: 1 }, 'G#m': { keysf:  5, keymi: 1 },
  'D#m': { keysf:  6, keymi: 1 }, 'A#m': { keysf:  7, keymi: 1 },
  'Dm':  { keysf: -1, keymi: 1 }, 'Gm':  { keysf: -2, keymi: 1 },
  'Cm':  { keysf: -3, keymi: 1 }, 'Fm':  { keysf: -4, keymi: 1 },
  'Bbm': { keysf: -5, keymi: 1 }, 'Ebm': { keysf: -6, keymi: 1 },
  'Abm': { keysf: -7, keymi: 1 },
};

export interface PdfWriteOptions {
  forscore_path: string;
  display_title?: string;
  detected_key?: string;
  version_label?: string; // instrument — written to Author field
}

/**
 * Reads the PDF from IndexedDB, stamps forScore-compatible metadata into the
 * PDF document properties, and writes it back. Returns true on success.
 */
export async function writeMetadataToPdf(opts: PdfWriteOptions): Promise<boolean> {
  const bytes = await getPdf(opts.forscore_path);
  if (!bytes) return false;

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  if (opts.display_title) {
    pdfDoc.setTitle(opts.display_title);
  }

  if (opts.version_label) {
    pdfDoc.setAuthor(opts.version_label);
  }

  // Build forScore keyword string for key signature
  const keyEntry = opts.detected_key ? KEY_MAP[opts.detected_key] : undefined;
  if (keyEntry !== undefined) {
    const existing = pdfDoc.getKeywords() ?? '';
    // Remove any pre-existing keysf/keymi tags before adding fresh ones
    const cleaned = existing.replace(/keysf:-?\d+\s*/g, '').replace(/keymi:\d+\s*/g, '').trim();
    const keyTag = `keysf:${keyEntry.keysf} keymi:${keyEntry.keymi}`;
    pdfDoc.setKeywords([cleaned ? `${cleaned} ${keyTag}` : keyTag]);
  }

  const updated = await pdfDoc.save();
  await storePdf(opts.forscore_path, updated);
  return true;
}
