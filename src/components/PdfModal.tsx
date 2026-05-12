'use client';

import { useEffect, useRef, useState, Component, ReactNode } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface PdfModalProps {
  filename: string;
  title?: string;
  onClose: () => void;
}

// Load pdfjs UMD bundle via a <script> tag (same pattern as sql.js).
// Bypasses webpack and reliably exposes window.pdfjsLib on iPad PWA.
function loadPdfjs(): Promise<any> {
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
      if (!lib) { reject(new Error('pdfjsLib not on window after load')); return; }
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load /pdfjs.min.js'));
    document.head.appendChild(script);
  });
}

// Error boundary so a render-time exception inside the modal never
// blows up the whole app.
class ModalErrorBoundary extends Component<{ onClose: () => void; children: ReactNode }, { msg: string | null }> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(err: Error) { return { msg: err.message || 'Unknown error' }; }
  componentDidCatch(err: Error) { console.error('PdfModal crash:', err); }
  render() {
    if (this.state.msg) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 text-white p-8 text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-lg mb-2">Something went wrong showing the chart.</p>
          <p className="text-sm text-gray-400 mb-6 max-w-md">{this.state.msg}</p>
          <button onClick={this.props.onClose} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded">Close</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Inner({ filename, title, onClose }: PdfModalProps) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    (async () => {
      try {
        const data = await getPdf(filename);
        if (!data) { if (!cancelled) { setNotFound(true); setLoading(false); } return; }

        const pdfjsLib = await loadPdfjs();
        if (cancelled) return;

        const copy = new Uint8Array(data.length);
        copy.set(data);

        pdfDoc = await pdfjsLib.getDocument({ data: copy }).promise;
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
          canvas.width = Math.floor(cssViewport.width * dpr);
          canvas.height = Math.floor(cssViewport.height * dpr);
          canvas.style.width = cssViewport.width + 'px';
          canvas.style.height = cssViewport.height + 'px';
          canvas.style.maxWidth = '100%';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          container.appendChild(canvas);

          const renderViewport = page.getViewport({ scale: cssScale * dpr });
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        console.error('PdfModal render error:', e);
        if (!cancelled) {
          setError(e?.message ? String(e.message) : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (_) {} }
    };
  }, [filename]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        <button onClick={onClose} className="text-gray-300 hover:text-white bg-transparent border-0 text-2xl leading-none p-0 ml-3">
          ✕
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-800 p-4">
        {loading && !notFound && !error && (
          <div className="flex items-center justify-center h-full text-gray-400">Loading chart…</div>
        )}
        {notFound && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center">
            <p className="text-4xl">📄</p>
            <p className="text-lg font-medium text-gray-200">PDF not stored yet</p>
            <p className="text-sm">Import your forScore backup (.4sb) in Settings to view charts here.</p>
            <button onClick={onClose} className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded">Close</button>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-full text-red-300 gap-4 p-8 text-center">
            <p className="text-4xl">⚠️</p>
            <p className="text-lg font-medium">Could not render PDF</p>
            <p className="text-sm text-gray-400 max-w-md break-words">{error}</p>
            <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded text-sm">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdfModal(props: PdfModalProps) {
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <Inner {...props} />
    </ModalErrorBoundary>
  );
}
