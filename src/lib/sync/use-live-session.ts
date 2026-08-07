'use client';

/**
 * Leader side of live mode.
 *
 * Inert until start(). Once live it:
 *  - creates (or reclaims) a room on the hub with a code + private token,
 *  - broadcasts a full setlist snapshot so followers need nothing local,
 *  - broadcasts a commit only when the leader explicitly commits a song —
 *    browsing stays private,
 *  - re-joins and re-sends snapshot + last commit after every reconnect,
 *    which also makes a hub restart nearly transparent.
 *
 * The code and token persist in sessionStorage per setlist, so navigating
 * away and back (or an accidental reload) resumes the same session and
 * followers never have to re-join.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getScore, getSetlist, getSetlistInstruments } from '../data';
import { getInstrumentView } from '../parts';
import {
  FollowerInfo, PROTOCOL_VERSION, SessionSnapshot, SnapshotItem, SnapshotPart,
  generateSessionCode, generateToken,
} from './protocol';
import { SyncTransport } from './transport';
import { createWsTransport } from './ws-transport';

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting';

/** Followers pick from these; 'Main' is the setlist's own matched charts. */
export const MAIN_VIEW = 'Main';

export interface LiveSession {
  status: LiveStatus;
  code: string | null;
  followers: FollowerInfo[];
  committedPosition: number | null;
  error: string | null;
  start(): void;
  end(): void;
  commit(position: number): void;
}

interface SetlistItemLike {
  id: number;
  position: number;
  requested_title: string;
  match_status: string;
  matched_score_id: number | null;
  matched_display_title: string | null;
  matched_forscore_path: string | null;
}

function storageKey(setlistId: number) {
  return `live_leader_${setlistId}`;
}

function loadStored(setlistId: number): { code: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(storageKey(setlistId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === 'string' && typeof parsed?.token === 'string') return parsed;
  } catch (_) {}
  return null;
}

/**
 * Everything a follower needs, keyed by forscore_path (never local ids).
 * Uses the same resolution as the editor's instrument tabs, so what a
 * follower receives is exactly what the leader sees on that tab —
 * including manual per-song overrides.
 */
export function buildSnapshot(setlistId: number, fallbackName: string): SessionSnapshot | null {
  const data = getSetlist(setlistId) as
    | { name?: string; items: SetlistItemLike[] }
    | null;
  if (!data || !data.items) return null;

  const instruments = getSetlistInstruments(setlistId);
  const viewByInstrument = new Map<string, Map<number, SnapshotPart | null>>();
  for (const instrument of instruments) {
    const byPosition = new Map<number, SnapshotPart | null>();
    for (const part of getInstrumentView(setlistId, instrument)) {
      byPosition.set(part.position, part.forscore_path ? {
        forscorePath: part.forscore_path,
        displayTitle: part.display_title ?? part.requested_title,
        source: part.source,
        detectedKey: part.detected_key,
      } : null);
    }
    viewByInstrument.set(instrument, byPosition);
  }

  const items: SnapshotItem[] = data.items.map((item, index) => {
    const isSeparator = item.match_status === 'placeholder';
    const parts: Record<string, SnapshotPart | null> = {};

    if (!isSeparator) {
      let mainKey: string | null = null;
      if (item.matched_score_id) mainKey = getScore(item.matched_score_id)?.detected_key ?? null;
      parts[MAIN_VIEW] = item.matched_forscore_path ? {
        forscorePath: item.matched_forscore_path,
        displayTitle: item.matched_display_title ?? item.requested_title,
        source: 'exact',
        detectedKey: mainKey,
      } : null;
      for (const instrument of instruments) {
        parts[instrument] = viewByInstrument.get(instrument)?.get(item.position) ?? null;
      }
    }

    return {
      position: index + 1,
      title: item.requested_title,
      isSeparator,
      parts,
    };
  });

  return {
    setlistName: data.name ?? fallbackName,
    instruments: [MAIN_VIEW, ...instruments],
    items,
  };
}

export function useLiveSession(setlistId: number, setlistName: string): LiveSession {
  const [status, setStatus] = useState<LiveStatus>('off');
  const [code, setCode] = useState<string | null>(null);
  const [followers, setFollowers] = useState<FollowerInfo[]>([]);
  const [committedPosition, setCommittedPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<SyncTransport | null>(null);
  const codeRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const committedRef = useRef<number | null>(null);
  const retriedCodeRef = useRef(false);
  const nameRef = useRef(setlistName);
  nameRef.current = setlistName;

  const sendJoin = useCallback(() => {
    transportRef.current?.send({
      v: PROTOCOL_VERSION,
      type: 'join',
      role: 'leader',
      code: codeRef.current,
      name: 'Leader',
      leaderToken: tokenRef.current,
      setlistName: nameRef.current,
    });
  }, []);

  const sendSnapshot = useCallback(() => {
    const snapshot = buildSnapshot(setlistId, nameRef.current);
    if (snapshot) {
      transportRef.current?.send({ v: PROTOCOL_VERSION, type: 'snapshot', snapshot });
    }
  }, [setlistId]);

  const start = useCallback(() => {
    if (transportRef.current) return;
    setError(null);
    retriedCodeRef.current = false;

    const stored = loadStored(setlistId);
    codeRef.current = stored?.code ?? generateSessionCode();
    tokenRef.current = stored?.token ?? generateToken();
    try {
      sessionStorage.setItem(
        storageKey(setlistId),
        JSON.stringify({ code: codeRef.current, token: tokenRef.current }),
      );
    } catch (_) {}

    setStatus('connecting');
    const transport = createWsTransport();
    transportRef.current = transport;

    transport.onStateChange(state => {
      if (transportRef.current !== transport) return;
      if (state === 'open') {
        sendJoin();
      } else if (state === 'connecting') {
        setStatus(prev => (prev === 'live' || prev === 'reconnecting' ? 'reconnecting' : 'connecting'));
      }
    });

    transport.onMessage(msg => {
      if (transportRef.current !== transport) return;
      switch (msg?.type) {
        case 'joined':
          setStatus('live');
          setCode(codeRef.current);
          setError(null);
          // The hub may have restarted and lost everything; re-sending the
          // full state after every join costs a few KB and heals all cases.
          sendSnapshot();
          if (committedRef.current !== null) {
            transport.send({ v: PROTOCOL_VERSION, type: 'commit', position: committedRef.current });
          }
          break;
        case 'commit':
          // Only ever a replay from the hub when this leader (re)joins a
          // session it had already been driving.
          if (typeof msg.position === 'number' && committedRef.current === null) {
            committedRef.current = msg.position;
            setCommittedPosition(msg.position);
          }
          break;
        case 'presence':
          setFollowers(msg.followers ?? []);
          break;
        case 'error':
          if (msg.code === 'code-taken' && !retriedCodeRef.current) {
            retriedCodeRef.current = true;
            codeRef.current = generateSessionCode();
            try {
              sessionStorage.setItem(
                storageKey(setlistId),
                JSON.stringify({ code: codeRef.current, token: tokenRef.current }),
              );
            } catch (_) {}
            sendJoin();
          } else if (msg.code === 'code-taken') {
            setError('Could not claim a session code. End and try again.');
          }
          break;
        default:
          break;
      }
    });
  }, [setlistId, sendJoin, sendSnapshot]);

  const end = useCallback(() => {
    const transport = transportRef.current;
    transportRef.current = null;
    if (transport) {
      transport.send({ v: PROTOCOL_VERSION, type: 'leave' });
      transport.close();
    }
    try { sessionStorage.removeItem(storageKey(setlistId)); } catch (_) {}
    codeRef.current = null;
    tokenRef.current = null;
    committedRef.current = null;
    setStatus('off');
    setCode(null);
    setFollowers([]);
    setCommittedPosition(null);
  }, [setlistId]);

  const commit = useCallback((position: number) => {
    committedRef.current = position;
    setCommittedPosition(position);
    transportRef.current?.send({ v: PROTOCOL_VERSION, type: 'commit', position });
  }, []);

  // Leaving the page keeps the session alive on the hub (no 'leave') so the
  // leader can hop to the editor and back; start() then reclaims by token.
  useEffect(() => {
    return () => {
      const transport = transportRef.current;
      transportRef.current = null;
      transport?.close();
    };
  }, []);

  // A session left running for this setlist resumes automatically.
  useEffect(() => {
    if (loadStored(setlistId)) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistId]);

  return { status, code, followers, committedPosition, error, start, end, commit };
}
