'use client';

/**
 * Follower side of live mode.
 *
 * Connects to the hub as soon as the Live page opens, lists active sessions
 * so joining is one tap, and after joining receives the setlist snapshot
 * plus every commit. The follower sends nothing musical — only the join and
 * invisible heartbeats.
 *
 * Recovery is layered: the transport reconnects by itself; on every
 * reconnect this hook silently re-joins with the stored code; if the hub
 * restarted and the room is momentarily gone, it keeps polling the session
 * list and re-joins the moment the leader's session reappears (the leader
 * recreates it under the same code).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FollowerInfo, PROTOCOL_VERSION, SessionInfo, SessionSnapshot } from './protocol';
import { ConnState, SyncTransport } from './transport';
import { createWsTransport } from './ws-transport';

const SESSION_POLL_MS = 5_000;
const STORAGE_KEY = 'live_follower_session';

export interface FollowSession {
  conn: ConnState;
  sessions: SessionInfo[];
  joined: boolean;
  code: string | null;
  snapshot: SessionSnapshot | null;
  committedPosition: number | null;
  leaderPresent: boolean;
  followers: FollowerInfo[];
  /** Set when the joined room vanished (hub restart / leader ended it). */
  error: 'no-session' | 'session-ended' | null;
  join(code: string, name: string, instrument: string | null): void;
  leave(): void;
}

export function useFollowSession(): FollowSession {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [committedPosition, setCommittedPosition] = useState<number | null>(null);
  const [leaderPresent, setLeaderPresent] = useState(false);
  const [followers, setFollowers] = useState<FollowerInfo[]>([]);
  const [error, setError] = useState<'no-session' | 'session-ended' | null>(null);

  const transportRef = useRef<SyncTransport | null>(null);
  // The join we want to hold on to across reconnects and hub restarts.
  const targetRef = useRef<{ code: string; name: string; instrument: string | null } | null>(null);
  const joinedRef = useRef(false);

  const sendJoin = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    transportRef.current?.send({
      v: PROTOCOL_VERSION,
      type: 'join',
      role: 'follower',
      code: target.code,
      name: target.name,
      instrument: target.instrument,
    });
  }, []);

  useEffect(() => {
    const transport = createWsTransport();
    transportRef.current = transport;

    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (typeof stored?.code === 'string' && typeof stored?.name === 'string') {
          targetRef.current = {
            code: stored.code,
            name: stored.name,
            instrument: stored.instrument ?? null,
          };
        }
      }
    } catch (_) {}

    const offState = transport.onStateChange(state => {
      setConn(state);
      if (state === 'open') {
        sendJoin();
        // Ask for the lobby straight away rather than waiting out a poll
        // tick — on stage the list should be there the moment the page is.
        if (!joinedRef.current) transport.send({ v: PROTOCOL_VERSION, type: 'list-sessions' });
      }
      if (state !== 'open') setLeaderPresent(false);
    });

    const offMessage = transport.onMessage(msg => {
      switch (msg?.type) {
        case 'sessions':
          setSessions(Array.isArray(msg.sessions) ? msg.sessions : []);
          // While waiting out a hub restart: the room is back, walk in again.
          if (targetRef.current && !joinedRef.current &&
              msg.sessions?.some((s: SessionInfo) => s.code === targetRef.current!.code)) {
            sendJoin();
          }
          break;
        case 'joined':
          joinedRef.current = true;
          setJoined(true);
          setCode(msg.code ?? targetRef.current?.code ?? null);
          setLeaderPresent(!!msg.leaderPresent);
          setError(null);
          break;
        case 'snapshot':
          if (msg.snapshot) setSnapshot(msg.snapshot);
          break;
        case 'commit':
          if (typeof msg.position === 'number') setCommittedPosition(msg.position);
          break;
        case 'presence':
          setLeaderPresent(!!msg.leaderPresent);
          setFollowers(msg.followers ?? []);
          break;
        case 'session-ended':
          joinedRef.current = false;
          targetRef.current = null;
          try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
          setJoined(false);
          setError('session-ended');
          break;
        case 'error':
          if (msg.code === 'no-session') {
            // Hub lost the room; stay armed and let the poll re-join us.
            joinedRef.current = false;
            setJoined(false);
            setError('no-session');
          }
          break;
        default:
          break;
      }
    });

    if (transport.state === 'open') sendJoin();

    // Session list doubles as the lobby view and the hub-restart watchdog.
    const poll = setInterval(() => {
      if (!joinedRef.current) {
        transport.send({ v: PROTOCOL_VERSION, type: 'list-sessions' });
      }
    }, SESSION_POLL_MS);
    transport.send({ v: PROTOCOL_VERSION, type: 'list-sessions' });

    return () => {
      clearInterval(poll);
      offState();
      offMessage();
      transportRef.current = null;
      transport.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback((joinCode: string, name: string, instrument: string | null) => {
    const normalized = joinCode.trim().toUpperCase();
    if (!normalized) return;
    targetRef.current = { code: normalized, name, instrument };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(targetRef.current)); } catch (_) {}
    setError(null);
    sendJoin();
  }, [sendJoin]);

  const leave = useCallback(() => {
    transportRef.current?.send({ v: PROTOCOL_VERSION, type: 'leave' });
    targetRef.current = null;
    joinedRef.current = false;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    setJoined(false);
    setCode(null);
    setSnapshot(null);
    setCommittedPosition(null);
    setLeaderPresent(false);
    setError(null);
  }, []);

  return {
    conn, sessions, joined, code, snapshot, committedPosition,
    leaderPresent, followers, error, join, leave,
  };
}
