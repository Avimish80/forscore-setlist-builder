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
import { loadPdfjs } from '@/lib/pdfjs';

interface Props {
  filename: string | null;
  /** Optional content shown when no filename is selected */
  placeholder?: ReactNode;
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mb-3">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <p className="text-sm font-medium mb-1">Viewer error</p>
          <p className="text-xs text-zinc-500 max-w-sm break-words">{this.state.msg}</p>
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
  // Reactive container width — keeps the PDF sized correctly when the panel is
  // revealed (mobile single-pane toggle), when the device rotates, or when the
  // desktop split is resized. Without this the pages would be locked to whatever
  // width the container happened to have at first render (often 0 while hidden).
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      // Ignore sub-pixel jitter; only re-render on a meaningful width change.
      setWidth(prev => (w > 0 && Math.abs(prev - w) > 24 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!filename) {
      setStatus('idle');
      setPageCount(0);
      if (containerRef.current) containerRef.current.innerHTML = '';
      return;
    }
    // Wait until we know the real container width (see the width effect above).
    if (width < 50) return;

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

        const containerWidth = Math.max(200, width - 24);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          const unscaled = page.getViewport({ scale: 1 });
          const cssScale = Math.min(containerWidth / unscaled.width, 3);
          const cssViewport = page.getViewport({ scale: cssScale });

          const canvas = document.createElement('canvas');
          canvas.className = 'mx-auto mb-3 shadow-lg shadow-black/40 rounded-sm bg-white block';
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
  }, [filename, width]);

  const showPlaceholder = !filename || status === 'idle';

  // ── Render ────────────────────────────────────────────────────────────────
  // The scroll area and the canvas container are ALWAYS mounted so the
  // ResizeObserver can measure the panel even before a score is selected.
  // All other states (placeholder, loading, not-found, error) render as
  // overlays on top of it.
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Status strip — only once a file is chosen */}
      {!showPlaceholder && (
        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 text-zinc-500 text-xs flex-shrink-0 border-b border-zinc-800">
          {status === 'loading' && (
            <>
              <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin inline-block" />
              <span>Loading chart…</span>
            </>
          )}
          {status === 'done' && (
            <span>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
          )}
          {status === 'notfound' && <span className="text-amber-400">PDF not stored</span>}
          {status === 'error' && <span className="text-red-400">Error</span>}
        </div>
      )}

      {/* Canvas scroll area */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 relative">
        {/* Canvases are appended directly into this div by the useEffect */}
        <div ref={containerRef} className="p-3" />

        {/* No file selected */}
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            {placeholder ?? (
              <div className="text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto mb-3 text-zinc-700">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <p className="text-sm">Select a score to view its chart</p>
              </div>
            )}
          </div>
        )}

        {/* Loading spinner (before canvases appear) */}
        {!showPlaceholder && status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-amber-400 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Rendering pages…</p>
            </div>
          </div>
        )}

        {status === 'notfound' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mb-3 text-zinc-600">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <p className="text-sm font-medium text-zinc-300 mb-1">PDF not stored</p>
            <p className="text-xs max-w-xs">
              Import your forScore backup (.4sb) in Settings to view charts here.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-8 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mb-3">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            <p className="text-sm font-medium mb-1">Could not render PDF</p>
            <p className="text-xs text-zinc-500 max-w-sm break-words">{errorMsg}</p>
          </div>
        )}
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
