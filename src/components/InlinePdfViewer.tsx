'use client';

/**
 * InlinePdfViewer — renders a PDF from IndexedDB directly into a panel.
 * Uses the same PDF.js v3 UMD approach as the old PdfModal (script-tag injection,
 * no webpack involvement), but renders into a flex div instead of a fullscreen overlay.
 *
 * Usage: <InlinePdfViewer filename="Angels-piano.pdf" />
 * Pass filename=null to show the placeholder.
 */

import { useEffect, useRef, useState, Component, ReactNode } from 'react';
import { getPdf } from '@/lib/pdf-store';

interface Props {
  filename: string | null;
  /** Optional content shown when no filename is selected */
  placeholder?: ReactNode;
}

// Load PDF.js v3 UMD bundle via a <script> tag.
// Exact same pattern as sql.js — bypasses webpack, works on iPad PWA.
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
      if (!lib) { reject(new Error('pdfjsLib not found on window after script load')); return; }
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load /pdfjs.min.js'));
    document.head.appendChild(script);
  });
}

// Error boundary — isolates PDF crashes from the rest of the app.
class ViewerErrorBoundary extends Component<
  { children: ReactNode },
  { msg: string | null }
> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(err: Error) { return { msg: err.message || 'Unknown error' }; }
  componentDidCatch(err: Error) { console.error('InlinePdfViewer crash:', err); }
  render() {
    if (this.state.msg) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-400 p-8 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-sm font-medium mb-1">Viewer error</p>
          <p className="text-xs text-gray-500 max-w-sm break-words">{this.state.msg}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

type Status = 'idle' | 'loading' | 'notfound' | 'error' | 'done';

function PdfCanvas({ filename, placeholder }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [pageCount, setPageCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filename) {
      setStatus('idle');
      setPageCount(0);
      if (containerRef.current) containerRef.current.innerHTML = '';
      return;
    }

    let cancelled = false;
    let pdfDoc: any = null;

    setStatus('loading');
    setPageCount(0);
    setErrorMsg(null);
    // Clear previous pages immediately so the loading state is obvious
    if (containerRef.current) containerRef.current.innerHTML = '';

    (async () => {
      try {
        const data = await getPdf(filename);
        if (cancelled) return;
        if (!data) { setStatus('notfound'); return; }

        const pdfjsLib = await loadPdfjs();
        if (cancelled) return;

        // Copy the buffer — pdfjs takes ownership and we want a clean copy
        const copy = new Uint8Array(data.length);
        copy.set(data);

        pdfDoc = await pdfjsLib.getDocument({ data: copy }).promise;
        if (cancelled || !pdfDoc) return;

        const numPages = pdfDoc.numPages;
        setPageCount(numPages);

        const container = containerRef.current;
        if (!container) return;

        const containerWidth = Math.max(200, container.clientWidth - 24);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          const unscaled = page.getViewport({ scale: 1 });
          const cssScale = Math.min(containerWidth / unscaled.width, 3);
          const cssViewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement('canvas');
          canvas.className = 'mx-auto mb-3 shadow bg-white block';
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

        if (!cancelled) setStatus('done');
      } catch (e: any) {
        console.error('InlinePdfViewer render error:', e);
        if (!cancelled) {
          setErrorMsg(e?.message ? String(e.message) : String(e));
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (_) {} }
    };
  }, [filename]);

  // ── No file selected ──────────────────────────────────────────────────────
  if (!filename || status === 'idle') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-800 text-gray-500">
        {placeholder ?? (
          <div className="text-center">
            <p className="text-4xl mb-3">🎵</p>
            <p className="text-sm">Select a score to view its chart</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Status strip */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 text-gray-400 text-xs flex-shrink-0 border-b border-gray-700">
        {status === 'loading' && (
          <>
            <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
            <span>Loading chart…</span>
          </>
        )}
        {status === 'done' && (
          <span>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
        )}
        {status === 'notfound' && <span className="text-amber-400">PDF not stored</span>}
        {status === 'error' && <span className="text-red-400">Error</span>}
      </div>

      {/* Canvas scroll area */}
      <div className="flex-1 overflow-y-auto bg-gray-800 p-3">
        {/* Loading spinner (before canvases appear) */}
        {status === 'loading' && (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Rendering pages…</p>
            </div>
          </div>
        )}

        {status === 'notfound' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
            <p className="text-4xl mb-3">📄</p>
            <p className="text-sm font-medium text-gray-300 mb-1">PDF not stored</p>
            <p className="text-xs max-w-xs">
              Import your forScore backup (.4sb) in Settings to view charts here.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full text-red-400 p-8 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="text-sm font-medium mb-1">Could not render PDF</p>
            <p className="text-xs text-gray-400 max-w-sm break-words">{errorMsg}</p>
          </div>
        )}

        {/* Canvases are appended directly into this div by the useEffect */}
        <div ref={containerRef} />
      </div>
    </div>
  );
}

export default function InlinePdfViewer({ filename, placeholder }: Props) {
  return (
    <ViewerErrorBoundary>
      <PdfCanvas filename={filename} placeholder={placeholder} />
    </ViewerErrorBoundary>
  );
}
