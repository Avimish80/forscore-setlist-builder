'use client';

/**
 * LiveScoreView — the performance viewer.
 *
 * On stage the music is the whole interface: the chart fills the screen and
 * nothing sits on top of it. Everything else is one deliberate gesture away.
 *
 *   swipe left / right     previous and next song
 *   tap the left edge      previous song
 *   tap the right edge     next song
 *   tap the middle         a list of every song slides in from the left edge,
 *                          exactly like tapping the score in forScore
 *   swipe up / down        the pages of a multi-page chart, one screenful each
 *   arrow keys / page keys the same as tapping the edges, so a page pedal works
 *
 * The song list never lingers: picking a song, or tapping anywhere else,
 * closes it immediately and drops straight back into the chart — it is a
 * momentary detour for finding your place, not a screen of its own.
 *
 * The only thing that sits over the music on its own, uninvited, is the
 * notice bar: a thin translucent strip at the top, used when the leader has
 * moved on and the player may want to follow. It is readable at a glance,
 * ignorable mid-phrase, and one tap wide.
 */

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { getPdf } from '@/lib/pdf-store';
import { loadPdfjs } from '@/lib/pdfjs';

export interface LiveStripItem {
  position: number;
  title: string;
  isSeparator: boolean;
}

interface Props {
  /** forscore_path of the chart to show, or null when there is nothing to show. */
  filename: string | null;
  /** Song title — shown large whenever there is no chart to display. */
  title: string;
  /** Why there is no chart, e.g. "No Piano chart for this song". */
  emptyNote?: string;
  isSeparator?: boolean;
  items: LiveStripItem[];
  currentPosition: number;
  onSelect: (position: number) => void;
  /**
   * The one thing worth acting on right now, rendered as the top strip.
   * 'alert' breathes — news that just arrived, like the leader moving on.
   * 'action' sits still — a standing option, like the leader's own Commit,
   * which would be maddening if it pulsed for the whole gig.
   */
  notice?: { label: string; onTap: () => void; tone?: 'alert' | 'action' } | null;
  /** Session controls — they live in the menu, never over the music. */
  menuContent?: ReactNode;
}

type Status = 'idle' | 'loading' | 'notfound' | 'error' | 'done';

const SWIPE_MIN_PX = 55;
/** A swipe only counts as horizontal if it clearly beats the vertical drift. */
const SWIPE_DOMINANCE = 1.4;
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 400;
const EDGE_ZONE = 0.28;

export default function LiveScoreView({
  filename, title, emptyNote, isSeparator, items,
  currentPosition, onSelect, notice, menuContent,
}: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const drawerListRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);

  const index = items.findIndex(i => i.position === currentPosition);

  const step = useCallback((delta: number) => {
    if (!items.length) return;
    const from = index < 0 ? 0 : index;
    const next = Math.min(items.length - 1, Math.max(0, from + delta));
    if (next !== from) onSelect(items[next].position);
  }, [index, items, onSelect]);

  // Measure the scroll container itself, not the frame around it — that is
  // the box a page actually has to fit inside.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize(prev =>
        Math.abs(prev.w - w) > 16 || Math.abs(prev.h - h) > 16 ? { w, h } : prev);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Render the chart, each page fitted to one screenful ──────────────────
  useEffect(() => {
    const clear = () => { if (pagesRef.current) pagesRef.current.innerHTML = ''; };

    if (!filename || isSeparator) { clear(); setStatus('idle'); return; }
    if (size.w < 50 || size.h < 50) return;

    let cancelled = false;
    let pdfDoc: any = null;
    setStatus('loading');
    clear();

    (async () => {
      try {
        const data = await getPdf(filename);
        if (cancelled) return;
        if (!data) { setStatus('notfound'); return; }

        const pdfjsLib = await loadPdfjs();
        if (cancelled) return;

        const copy = new Uint8Array(data.length);
        copy.set(data);
        pdfDoc = await pdfjsLib.getDocument({ data: copy }).promise;
        if (cancelled || !pdfDoc) return;

        const container = pagesRef.current;
        if (!container) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          const unscaled = page.getViewport({ scale: 1 });

          // Fit the whole page on screen — a player should never have to
          // scroll to read the music that is in front of them.
          const scale = Math.min(size.w / unscaled.width, size.h / unscaled.height);
          const viewport = page.getViewport({ scale });

          const wrap = document.createElement('div');
          wrap.className = 'snap-start flex items-center justify-center';
          wrap.style.width = '100%';
          wrap.style.height = size.h + 'px';

          const canvas = document.createElement('canvas');
          canvas.className = 'bg-white block';
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = viewport.width + 'px';
          canvas.style.height = viewport.height + 'px';

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          wrap.appendChild(canvas);
          container.appendChild(wrap);

          await page.render({
            canvasContext: ctx,
            viewport: page.getViewport({ scale: scale * dpr }),
          }).promise;
        }
        if (!cancelled) setStatus('done');
      } catch (e: any) {
        // Changing song mid-render cancels the one in flight. That is the
        // normal path here, not a failure — never log it as one.
        if (cancelled || e?.name === 'RenderingCancelledException') return;
        console.error('LiveScoreView render error:', e);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDoc) { try { pdfDoc.destroy(); } catch (_) {} }
    };
  }, [filename, isSeparator, size.w, size.h]);

  // A new song always starts at its first page.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [filename, currentPosition]);

  // Bring the current song into view whenever the list slides in.
  useEffect(() => {
    if (!menuOpen) return;
    const t = setTimeout(() => {
      activeRowRef.current?.scrollIntoView({ block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [menuOpen, currentPosition]);

  // Arrow and page keys — also what most Bluetooth page pedals send.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  // ── Gestures ─────────────────────────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      // Swiping left pulls the next song in from the right, like turning a page.
      suppressClick.current = true;
      setMenuOpen(false);
      step(dx < 0 ? 1 : -1);
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    const start = touchRef.current;
    if (start && Date.now() - start.t > TAP_MAX_MS) return;

    if (menuOpen) { setMenuOpen(false); return; }

    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    if (frac < EDGE_ZONE) step(-1);
    else if (frac > 1 - EDGE_ZONE) step(1);
    else setMenuOpen(true);
  }

  const showTitleCard = isSeparator || !filename || status === 'notfound' || status === 'error';

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 bg-zinc-950 overflow-hidden select-none touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* ── The music ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="live-scroll absolute inset-0 overflow-y-auto overscroll-contain snap-y snap-mandatory"
      >
        <div ref={pagesRef} />
      </div>

      {/* ── Title card: separators, missing charts, un-imported PDFs ────── */}
      {showTitleCard && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center pointer-events-none">
          <p className={`font-bold tracking-tight ${isSeparator ? 'text-4xl md:text-6xl text-zinc-300' : 'text-3xl md:text-5xl text-zinc-100'}`}>
            {title}
          </p>
          {!isSeparator && (
            <p className="mt-4 text-sm md:text-base text-zinc-500 max-w-md">
              {status === 'notfound'
                ? 'This chart is not on this device yet — import your forScore backup (.4sb) in Settings.'
                : status === 'error'
                  ? 'This chart could not be opened.'
                  : emptyNote ?? 'No chart for this song'}
            </p>
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-7 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Notice bar — the only thing ever allowed over the music ─────── */}
      {notice && (
        <button
          onClick={e => { e.stopPropagation(); notice.onTap(); }}
          title="Tap to move to this song"
          className={`live-notice-base absolute top-0 inset-x-0 z-20 flex items-center justify-center
                      gap-2 px-4 py-2.5 backdrop-blur-md border-0 border-b-2 border-amber-400/60
                      text-amber-200 text-sm font-semibold rounded-none
                      pt-[max(0.625rem,env(safe-area-inset-top))]
                      ${notice.tone === 'action'
                        ? 'shadow-[0_0_22px_rgba(251,191,36,0.3)]'
                        : 'live-notice'}`}
        >
          <span className="truncate">{notice.label}</span>
          <span aria-hidden className="opacity-80">→</span>
        </button>
      )}

      {/* ── Backdrop — dims the chart while the list is out; any tap on it
          bubbles to the root handler below and closes the list ─────────── */}
      <div
        aria-hidden
        className={`absolute inset-0 z-30 bg-black/50 transition-opacity duration-300
                    ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Song list — slides in from the left, like tapping the score in
          forScore. A momentary detour: picking a song, or tapping anywhere
          outside it, drops straight back into the chart. ──────────────── */}
      <div
        className={`absolute inset-y-0 left-0 z-40 w-[85%] max-w-sm flex flex-col
                    bg-zinc-950/95 backdrop-blur-md border-r border-zinc-800
                    transition-transform duration-300 ease-out
                    ${menuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}`}
        onClick={e => e.stopPropagation()}
      >
        {menuContent && (
          <div className="flex-shrink-0 flex flex-col gap-2 px-3 py-3 border-b border-zinc-800
                           pt-[max(0.75rem,env(safe-area-inset-top))]">
            {menuContent}
          </div>
        )}

        <div ref={drawerListRef} className="live-scroll flex-1 overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {items.map(item => {
            const active = item.position === currentPosition;
            return (
              <button
                key={item.position}
                ref={active ? activeRowRef : undefined}
                onClick={() => { onSelect(item.position); setMenuOpen(false); }}
                className={`flex items-center gap-2 w-full text-left px-3 py-2.5 border-b border-l-2 border-zinc-800/60 transition-colors ${
                  active
                    ? 'bg-amber-400/15 border-l-amber-400 text-amber-200'
                    : item.isSeparator
                      ? 'bg-zinc-900/60 border-l-transparent text-zinc-400 italic'
                      : 'border-l-transparent text-zinc-100 hover:bg-zinc-900'
                }`}
              >
                {!item.isSeparator && (
                  <span className="text-zinc-500 text-xs w-6 flex-shrink-0 text-right tabular-nums">{item.position}</span>
                )}
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
