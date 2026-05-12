'use client';

import { useEffect, useRef, useState } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface PdfModalProps {
  filename: string;
  title?: string;
  onClose: () => void;
}

// Memoize pdfjs-dist + worker setup so we only do it once per session.
let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    // Use the legacy build — same API, broader browser support (iOS Safari, older WebKit).
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const lib = mod.GlobalWorkerOptions ? mod : (mod.default ?? mod);
    if (!lib || typeof lib.getDocument !== 'function') {
      throw new Error('PDF.js library did not load correctly');
    }
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return lib;
  })().catch(e => {
    pdfjsPromise = null; // allow retry on next mount
    throw e;
  });
  return pdfjsPromise;
}

export default function PdfModal({ filename, title, onClose }: PdfModalProps) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [blobUrlForDownload, setBlobUrlForDownload] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;
    let blobUrl: string | null = null;

    (async () => {
      try {
        const data = await getPdf(filename);
        if (!data) { if (!cancelled) { setNotFound(true); setLoading(false); } return; }

        // Make a downloadable blob URL as a fallback ("Open in browser")
        blobUrl = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'application/pdf' }));
        if (!cancelled) setBlobUrlForDownload(blobUrl);

        const pdfjsLib = await loadPdfjs();
        if (cancelled) return;

        // PDF.js takes ownership of the buffer; pass a fresh copy.
        const copy = new Uint8Array(data.length);
        copy.set(data);

        const loadingTask = pdfjsLib.getDocument({ data: copy });
        pdfDoc = await loadingTask.promise;
        if (cancelled || !pdfDoc) return;
        setPageCount(pdfDoc.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const containerWidth = Math.max(200, container.clientWidth - 32);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);

          const unscaled = page.getViewport({ scale: 1 });
          const cssScale = Math.min(containerWidth / unscaled.width, 2.5);
          const cssViewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement('canvas');
          canvas.className = 'mx-auto mb-4 shadow-lg bg-white';
          // Internal resolution for crispness on high-DPR screens
          canvas.width = Math.floor(cssViewport.width * dpr);
          canvas.height = Math.floor(cssViewport.height * dpr);
          // CSS display size
          canvas.style.width = cssViewport.width + 'px';
          canvas.style.height = cssViewport.height + 'px';
          canvas.style.maxWidth = '100%';

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          container.appendChild(canvas);

          const renderViewport = page.getViewport({ scale: cssScale * dpr });
          await page.render({
            canvasContext: ctx,
            viewport: renderViewport,
          }).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        console.error('PdfModal render error:', e);
        if (!cancelled) {
          setError(e?.message || String(e) || 'Unknown error');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (_) {} }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [filename]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white border-b border-gray-700 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{title || filename}</p>
          {pageCount > 0 && <p className="text-xs text-gray-400">{pageCount} page{pageCount !== 1 ? 's' : ''}</p>}
        </div>
        <div className="flex items-center gap-3 ml-3">
          {blobUrlForDownload && (
            <a
              href={blobUrlForDownload}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-300 hover:text-blue-100"
            >
              Open ↗
            </a>
          )}
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white bg-transparent border-0 text-2xl leading-none p-0"
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-800 p-4">
        {loading && !notFound && !error && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading chart…
          </div>
        )}
        {notFound && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center">
            <p className="text-4xl">📄</p>
            <p className="text-lg font-medium text-gray-200">PDF not stored yet</p>
            <p className="text-sm">Import your forScore backup (.4sb) in Settings to view charts here.</p>
            <button onClick={onClose} className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded">
              Close
            </button>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-full text-red-300 gap-4 p-8 text-center">
            <p className="text-4xl">⚠️</p>
            <p className="text-lg font-medium">Could not render PDF</p>
            <p className="text-sm text-gray-400 max-w-md">{error}</p>
            {blobUrlForDownload && (
              <a
                href={blobUrlForDownload}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm"
              >
                Open in browser instead
              </a>
            )}
            <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded text-sm">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
