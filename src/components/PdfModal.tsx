'use client';

import { useEffect, useRef, useState } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface PdfModalProps {
  filename: string;
  title?: string;
  onClose: () => void;
}

export default function PdfModal({ filename, title, onClose }: PdfModalProps) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    async function load() {
      try {
        const data = await getPdf(filename);
        if (!data) { if (!cancelled) { setNotFound(true); setLoading(false); } return; }

        // Dynamic import so SSR doesn't break
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        // Copy data to a fresh Uint8Array — PDF.js takes ownership of the buffer
        const copy = new Uint8Array(data.length);
        copy.set(data);

        const loadingTask = pdfjsLib.getDocument({ data: copy });
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(pdfDoc.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Render each page to a canvas
        const containerWidth = container.clientWidth - 32; // account for padding
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(containerWidth / unscaledViewport.width, 2.5);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.className = 'mx-auto mb-4 shadow-lg bg-white';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          container.appendChild(canvas);

          await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        console.error('PDF render error:', e);
        if (!cancelled) { setError(e.message || 'Failed to render PDF'); setLoading(false); }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (_) {} }
    };
  }, [filename]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
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
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-white bg-transparent border-0 text-2xl leading-none p-0 ml-3"
        >
          ✕
        </button>
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
            <p className="text-sm text-gray-400">{error}</p>
            <button onClick={onClose} className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
