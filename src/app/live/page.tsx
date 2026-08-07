'use client';

/**
 * Live — the musician's view during a performance.
 *
 * Join once, pick your instrument once, then the screen is your chart.
 * When the leader commits a new song a chip appears; tap it to jump there
 * (or switch on Follow automatically). Nothing here ever moves your chart
 * without you unless you asked it to.
 */

import { useEffect, useMemo, useState } from 'react';
import LiveScoreView from '@/components/LiveScoreView';
import { useFollowSession } from '@/lib/sync/use-follow-session';
import { useWakeLock } from '@/lib/sync/use-wake-lock';

const CONN_DOT: Record<string, string> = {
  open: 'bg-emerald-400',
  connecting: 'bg-amber-400 animate-pulse',
  closed: 'bg-red-400',
};

export default function LivePage() {
  const session = useFollowSession();

  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [instrument, setInstrument] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autoFollow, setAutoFollow] = useState(false);
  const [displayedPosition, setDisplayedPosition] = useState<number | null>(null);

  useWakeLock(session.joined);

  useEffect(() => {
    try {
      setName(localStorage.getItem('live_name') ?? '');
      setInstrument(localStorage.getItem('live_instrument'));
      setAutoFollow(localStorage.getItem('live_autofollow') === '1');
    } catch (_) {}
  }, []);

  // Follow the committed song: jump straight there on first arrival or when
  // auto-follow is on; otherwise the chip below offers the jump.
  useEffect(() => {
    if (session.committedPosition === null) return;
    setDisplayedPosition(prev =>
      prev === null || autoFollow ? session.committedPosition : prev);
  }, [session.committedPosition, autoFollow]);

  function handleJoin(code: string) {
    const trimmedName = name.trim() || 'Musician';
    try { localStorage.setItem('live_name', trimmedName); } catch (_) {}
    session.join(code, trimmedName, instrument);
  }

  function chooseInstrument(view: string) {
    setInstrument(view);
    try { localStorage.setItem('live_instrument', view); } catch (_) {}
    setPickerOpen(false);
  }

  function toggleAutoFollow() {
    setAutoFollow(prev => {
      const next = !prev;
      try { localStorage.setItem('live_autofollow', next ? '1' : '0'); } catch (_) {}
      if (next && session.committedPosition !== null) {
        setDisplayedPosition(session.committedPosition);
      }
      return next;
    });
  }

  const snapshot = session.snapshot;
  const instrumentValid = !!(instrument && snapshot?.instruments.includes(instrument));
  const needsPicker = session.joined && !!snapshot && (!instrumentValid || pickerOpen);

  const displayedItem = useMemo(() => {
    if (!snapshot || displayedPosition === null) return null;
    return snapshot.items.find(i => i.position === displayedPosition) ?? null;
  }, [snapshot, displayedPosition]);

  const part = displayedItem && instrumentValid && !displayedItem.isSeparator
    ? displayedItem.parts[instrument!] ?? null
    : null;

  const pendingCommit =
    session.committedPosition !== null && session.committedPosition !== displayedPosition
      ? snapshot?.items.find(i => i.position === session.committedPosition) ?? null
      : null;

  // ── Join screen ────────────────────────────────────────────────────────────
  if (!session.joined) {
    return (
      <div className="h-full overflow-y-auto bg-zinc-950">
        <div className="max-w-md mx-auto px-4 py-8">
          <h1 className="text-xl font-bold text-zinc-100 mb-1">Live</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Follow the leader&apos;s setlist during a performance.
          </p>

          {session.error === 'session-ended' && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-zinc-800/80 text-zinc-300 text-sm">
              The leader ended the session.
            </div>
          )}
          {session.error === 'no-session' && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-400/10 text-amber-300 text-sm flex items-center gap-2">
              <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin inline-block flex-shrink-0" />
              Session interrupted — rejoining as soon as it is back…
            </div>
          )}

          {session.conn !== 'open' ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              <div className="flex items-center gap-2 mb-2 text-amber-300">
                <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
                <span className="font-medium">Looking for the band hub…</span>
              </div>
              <p>
                Live mode needs the band hub. Join the hub&apos;s Wi-Fi and open the
                hub&apos;s address on this device — the leader can read it off the
                hub screen.
              </p>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full text-sm mb-5"
              />

              {session.sessions.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Sessions on this hub
                  </p>
                  {session.sessions.map(s => (
                    <button
                      key={s.code}
                      onClick={() => handleJoin(s.code)}
                      className="flex items-center gap-3 w-full text-left px-3 py-3 mb-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-amber-400/50 hover:bg-zinc-800/80"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-100 truncate">{s.name}</p>
                        <p className="text-xs text-zinc-500">
                          {s.followerCount} joined{s.leaderPresent ? '' : ' · leader offline'}
                        </p>
                      </div>
                      <span className="text-amber-300 font-bold tracking-[0.2em] text-sm flex-shrink-0">{s.code}</span>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Or enter a session code
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && codeInput.trim()) handleJoin(codeInput); }}
                  placeholder="CODE"
                  maxLength={6}
                  className="flex-1 text-base font-bold tracking-[0.25em] uppercase"
                />
                <button
                  onClick={() => handleJoin(codeInput)}
                  disabled={!codeInput.trim()}
                  className="btn-primary text-sm px-5 py-2 rounded-lg disabled:opacity-40"
                >
                  Join
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Instrument picker ──────────────────────────────────────────────────────
  if (needsPicker) {
    return (
      <div className="h-full overflow-y-auto bg-zinc-950">
        <div className="max-w-md mx-auto px-4 py-8">
          <h1 className="text-xl font-bold text-zinc-100 mb-1">
            {snapshot?.setlistName}
          </h1>
          <p className="text-sm text-zinc-500 mb-6">Which chart should you see?</p>

          <div className="flex flex-wrap gap-2 mb-8">
            {snapshot?.instruments.map(view => (
              <button
                key={view}
                onClick={() => chooseInstrument(view)}
                className={`text-sm px-4 py-2.5 rounded-xl ${
                  instrument === view
                    ? 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30'
                    : 'bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400/50'
                }`}
              >
                {view}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 mb-6">
            <div>
              <p className="text-sm font-medium text-zinc-200">Follow automatically</p>
              <p className="text-xs text-zinc-500">
                Jump to the leader&apos;s song the moment it is sent
              </p>
            </div>
            <button
              onClick={toggleAutoFollow}
              className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${autoFollow ? 'bg-amber-400' : 'bg-zinc-700'}`}
              title="When off, a tap-to-jump chip appears instead"
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-950 transition-transform ${autoFollow ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <button onClick={session.leave} className="btn-ghost text-xs px-3 py-1.5 rounded">
            Leave session
          </button>
        </div>
      </div>
    );
  }

  // ── Live chart view ────────────────────────────────────────────────────────
  return (
    <LiveScoreView
      filename={part?.forscorePath ?? null}
      title={displayedItem?.title ?? snapshot?.setlistName ?? 'Live'}
      emptyNote={
        displayedItem
          ? `No ${instrument} chart for this song`
          : 'The chart appears when the leader commits a song.'
      }
      isSeparator={displayedItem?.isSeparator}
      items={snapshot?.items ?? []}
      currentPosition={displayedPosition ?? -1}
      onSelect={setDisplayedPosition}
      notice={
        pendingCommit
          ? {
              // Reading ahead is allowed, so the bar has to say which way the
              // band is: "Next" only when they have genuinely moved past you.
              label: displayedPosition !== null && displayedPosition > pendingCommit.position
                ? `Band is on: ${pendingCommit.title}`
                : pendingCommit.isSeparator
                  ? pendingCommit.title
                  : `Next: ${pendingCommit.title}`,
              onTap: () => setDisplayedPosition(pendingCommit.position),
            }
          : null
      }
      menuContent={
        <>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CONN_DOT[session.conn]}`} />
          <span className="text-xs text-zinc-400 truncate flex-1 min-w-0">
            {session.leaderPresent
              ? snapshot?.setlistName
              : <span className="text-amber-300">Leader offline</span>}
          </span>
          <button
            onClick={() => setPickerOpen(true)}
            title="Change instrument or auto-follow"
            className="btn-secondary text-xs px-2.5 py-1.5 rounded-md flex-shrink-0"
          >
            {instrument}
          </button>
          <button
            onClick={session.leave}
            title="Leave this session"
            className="btn-ghost text-xs px-2 py-1.5 rounded flex-shrink-0"
          >
            Leave
          </button>
        </>
      }
    />
  );
}
