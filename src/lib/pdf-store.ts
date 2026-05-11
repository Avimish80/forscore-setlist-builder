/**
 * IndexedDB store for PDF binary data.
 * Separate from the main SQLite database to keep memory usage low.
 * Key: forscore_path (e.g. "Angels-piano.pdf")
 * Value: Uint8Array of the decompressed PDF
 */

const PDF_DB_NAME = 'forscore-pdfs';
const PDF_DB_VERSION = 1;
const PDF_STORE = 'pdfs';

function openPdfDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storePdf(filename: string, data: Uint8Array): Promise<void> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, 'readwrite');
    tx.objectStore(PDF_STORE).put(data, filename);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPdf(filename: string): Promise<Uint8Array | null> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, 'readonly');
    const req = tx.objectStore(PDF_STORE).get(filename);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function getPdfCount(): Promise<number> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, 'readonly');
    const req = tx.objectStore(PDF_STORE).count();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function clearPdfs(): Promise<void> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, 'readwrite');
    tx.objectStore(PDF_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
