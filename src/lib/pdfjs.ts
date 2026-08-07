'use client';

/**
 * Shared PDF.js v3 UMD loader.
 *
 * Injected via a <script> tag rather than imported, exactly like sql.js —
 * this bypasses webpack entirely, which is what makes it work inside the
 * iPad PWA. Loaded once and reused by every viewer.
 */
export function loadPdfjs(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      const lib = (window as any).pdfjsLib;
      if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      resolve(lib);
      return;
    }
    const script = document.createElement('script');
    script.src = '/pdfjs.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) { reject(new Error('pdfjsLib not found on window after script load')); return; }
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load /pdfjs.min.js'));
    document.head.appendChild(script);
  });
}
