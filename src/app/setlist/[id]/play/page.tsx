'use client';

/**
 * Playing Mode — the leader's view during a performance.
 *
 * The same full-screen, gesture-driven viewer the band uses, so the leader
 * reads music the way everyone else does. Browsing here is private: moving
 * between songs sends nothing. Only the Commit strip does, and it sits
 * translucently over the top of the chart rather than taking a bar of screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LiveScoreView from '@/components/LiveScoreView';
import { getSetlist, getSetlistInstruments } from '@/lib/data';
import { resolvePartForItem } from '@/lib/parts';
import { MAIN_VIEW, useLiveSession } from '@/lib/sync/use-live-session';
import { useWakeLock } from '@/lib/sync/use-wake-lock';

interface ItemRow {
  id: number;
  position: number;
  requested_title: string;
  matched_score_id: number | null;
  matched_display_title: string | null;
  matched_forscore_path: string | null;
  match_status: string;
}

const STATUS_DOT: Record<string, string> = {
  off: 'bg-zinc-600',
  connecting: 'bg-amber-400 animate-pulse',
  reconnecting: 'bg-amber-400 animate-pulse',
  live: 'bg-emerald-400',
};

export default function PlayingModePage() {
  const params = useParams();
  const router = useRouter();
  const id = parseInt(params.id as string);

  const [name, setName] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [browsedPosition, setBrowsedPosition] = useState(1);
  const [myView, setMyView] = useState<string>(MAIN_VIEW);
  const [hubUrl, setHubUrl] = useState('');
  const [showLiveIntro, setShowLiveIntro] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const live = useLiveSession(id, name);
  useWakeLock(true);

  // The address every other device needs is simply the one this page is
  // already open on — a follower is never on a different machine's origin,
  // they're on THIS hub's. Read once the browser is available.
  useEffect(() => { setHubUrl(window.location.origin); }, []);

  // The moment the session actually goes live, show it once, clearly —
  // this is the single fact the whole band needs and the only place it was
  // previously visible was a terminal banner nobody performing ever sees.
  const introShown = useRef(false);
  useEffect(() => {
    if (live.status === 'live' && !introShown.current) {
      introShown.current = true;
      setShowLiveIntro(true);
    }
  }, [live.status]);

  function copyHubUrl() {
    const url = `${hubUrl}/live`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { setAddressCopied(true); setTimeout(() => setAddressCopied(false), 2000); },
        () => {}, // Clipboard is unavailable on plain-http origins in some browsers — the text is still on screen to read or select.
      );
    }
  }

  useEffect(() => {
    const data = getSetlist(id) as { name: string; items: ItemRow[] } | null;
    if (data) {
      setName(data.name);
      setItems(data.items);
      const first = data.items.find(i => i.match_status !== 'placeholder');
      setBrowsedPosition(first?.position ?? data.items[0]?.position ?? 1);
    }
    setInstruments(getSetlistInstruments(id));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('live_my_view');
      if (stored) setMyView(stored);
    } catch (_) {}
  }, []);

  // Resuming a session the hub still remembers: open on the song the band is
  // actually playing. Once only, so it never fights the leader browsing after.
  const landedOnCommitted = useRef(false);
  useEffect(() => {
    if (landedOnCommitted.current || live.committedPosition === null) return;
    landedOnCommitted.current = true;
    setBrowsedPosition(live.committedPosition);
  }, [live.committedPosition]);

  const chooseView = useCallback((view: string) => {
    setMyView(view);
    try { localStorage.setItem('live_my_view', view); } catch (_) {}
  }, []);

  const browsed = items.find(i => i.position === browsedPosition) ?? null;
  const isSeparator = browsed?.match_status === 'placeholder';

  // The leader's own chart follows their instrument choice, resolved exactly
  // as the editor's chart switcher does.
  const filename = useMemo(() => {
    if (!browsed || isSeparator) return null;
    if (myView === MAIN_VIEW || !instruments.includes(myView)) {
      return browsed.matched_forscore_path;
    }
    return resolvePartForItem(browsed.id, myView).forscore_path;
  }, [browsed, isSeparator, myView, instruments]);

  const strip = useMemo(
    () => items.map(i => ({
      position: i.position,
      title: i.requested_title,
      isSeparator: i.match_status === 'placeholder',
    })),
    [items],
  );

  if (loading) return <p className="text-zinc-500 p-6">Loading...</p>;
  if (!items.length) {
    return (
      <div className="p-6">
        <p className="text-zinc-400 mb-3">This setlist has no songs yet.</p>
        <button onClick={() => router.push(`/setlist/${id}`)} className="text-amber-300 text-sm bg-transparent border-0 p-0">
          Back to the setlist
        </button>
      </div>
    );
  }

  const isCommitted = live.committedPosition === browsedPosition;

  return (
    <>
    {showLiveIntro && (
      <div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5"
        onClick={() => setShowLiveIntro(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-zinc-900 shadow-2xl shadow-black/60 p-6 text-center"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-300 uppercase tracking-widest">You&apos;re live</span>
          </div>

          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Session code</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-amber-300 tabular-nums mb-5">{live.code}</p>

          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Musicians open this address</p>
          <p className="text-base font-mono text-zinc-100 break-all mb-1">{hubUrl || '…'}</p>
          <p className="text-xs text-zinc-500 mb-4">
            Same Wi-Fi, then the <span className="text-zinc-300">Live</span> tab — this session will already be listed.
          </p>

          <div className="flex gap-2">
            <button
              onClick={copyHubUrl}
              className="btn-secondary flex-1 text-sm py-2 rounded-lg"
            >
              {addressCopied ? 'Copied ✓' : 'Copy address'}
            </button>
            <button
              onClick={() => setShowLiveIntro(false)}
              className="btn-primary flex-1 text-sm py-2 rounded-lg"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    )}
    <LiveScoreView
      filename={filename}
      title={browsed?.requested_title ?? name}
      emptyNote={myView === MAIN_VIEW ? 'No chart matched for this song' : `No ${myView} chart for this song`}
      isSeparator={isSeparator}
      items={strip}
      currentPosition={browsedPosition}
      onSelect={setBrowsedPosition}
      notice={
        live.status !== 'off' && !isCommitted && browsed
          ? {
              label: `Commit: ${browsed.requested_title}`,
              onTap: () => live.commit(browsedPosition),
              tone: 'action',
            }
          : null
      }
      menuContent={
        <div className="flex items-center gap-2 w-full min-w-0 flex-wrap">
          <button
            onClick={() => router.push(`/setlist/${id}`)}
            title="Back to the setlist editor — a live session keeps running"
            className="btn-ghost text-xs px-2 py-1.5 rounded flex-shrink-0"
          >
            ‹ Exit
          </button>

          <span className="text-xs text-zinc-400 truncate min-w-0 flex-1">{name}</span>

          {live.status === 'off' ? (
            <button
              onClick={live.start}
              title="Start a live session — musicians join with this code from any device on the band Wi-Fi"
              className="btn-primary text-xs px-3 py-1.5 rounded-md flex-shrink-0"
            >
              Go Live
            </button>
          ) : (
            <>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[live.status]}`} />
              {live.code && (
                <button
                  onClick={() => setShowLiveIntro(true)}
                  title="Show the join code and address again"
                  className="text-sm font-bold tracking-[0.2em] text-amber-300 tabular-nums flex-shrink-0 bg-transparent border-0 p-0"
                >
                  {live.code}
                </button>
              )}
              <span className="text-xs text-zinc-400 tabular-nums flex-shrink-0">
                {live.followers.length} joined
              </span>
              {isCommitted && <span className="text-xs text-emerald-400 flex-shrink-0">Committed ✓</span>}
              <button
                onClick={() => { if (window.confirm('End the live session for everyone?')) live.end(); }}
                title="End the session for everyone"
                className="btn-ghost text-xs px-2 py-1.5 rounded flex-shrink-0"
              >
                End
              </button>
            </>
          )}

          {/* Which part the leader reads — their own screen only. */}
          <div className="flex items-center gap-1 flex-wrap w-full">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider flex-shrink-0">My chart:</span>
            {[MAIN_VIEW, ...instruments].map(view => (
              <button
                key={view}
                onClick={() => chooseView(view)}
                className={`text-[11px] px-2 py-1 rounded-md flex-shrink-0 ${
                  myView === view
                    ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      }
    />
    </>
  );
}
