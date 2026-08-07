/**
 * WebSocket transport with the reliability plumbing a live gig needs:
 *
 * - Reconnects forever with exponential backoff plus jitter (500ms to 15s),
 *   resetting once a connection sticks.
 * - App-level heartbeat: a ping every 12s while open; a missing pong within
 *   5s force-closes the socket so a silently dead connection (locked iPad,
 *   dropped Wi-Fi) is detected and replaced instead of hanging.
 * - The moment the tab becomes visible again or the network returns, any
 *   pending backoff is cancelled and a reconnect is attempted immediately —
 *   this is the iPad sleep/wake path, so recovery feels instant on stage.
 *
 * The transport knows nothing about sessions. Re-joining a room after a
 * reconnect is the session layer's job: it listens for the state change to
 * 'open' and re-sends its join.
 */

import { SYNC_PATH } from './protocol';
import { ConnState, SyncTransport } from './transport';

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 12_000;
const PONG_TIMEOUT_MS = 5_000;

export function defaultSyncUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${SYNC_PATH}`;
}

export function createWsTransport(url?: string): SyncTransport {
  const target = url ?? defaultSyncUrl();

  let ws: WebSocket | null = null;
  let state: ConnState = 'connecting';
  let closed = false;
  let attempt = 0;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  const messageSubs = new Set<(msg: any) => void>();
  const stateSubs = new Set<(s: ConnState) => void>();

  function setState(next: ConnState) {
    if (state === next) return;
    state = next;
    stateSubs.forEach(cb => cb(next));
  }

  function clearTimers() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  }

  function startHeartbeat() {
    clearTimers();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify({ v: 1, type: 'ping' })); } catch (_) { return; }
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        // No pong: the connection is dead even though the socket looks open.
        try { ws?.close(); } catch (_) {}
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    attempt++;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }

  /** Cancel any pending backoff and try right now (wake/online fast path). */
  function reconnectNow() {
    if (closed || state === 'open') return;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws && ws.readyState === WebSocket.CONNECTING) return;
    connect();
  }

  function connect() {
    if (closed) return;
    setState('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(target);
    } catch (_) {
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      if (socket !== ws) return;
      attempt = 0;
      setState('open');
      startHeartbeat();
    };

    socket.onmessage = event => {
      if (socket !== ws) return;
      let msg: any;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg?.type === 'pong') {
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
        return;
      }
      messageSubs.forEach(cb => cb(msg));
    };

    socket.onclose = () => {
      if (socket !== ws) return;
      ws = null;
      clearTimers();
      if (closed) return;
      setState('connecting');
      scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose follows and handles the retry.
    };
  }

  function onWake() { reconnectNow(); }
  function onVisibility() {
    if (document.visibilityState === 'visible') reconnectNow();
  }
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onVisibility);

  connect();

  return {
    get state() { return state; },
    send(msg: object) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(msg)); } catch (_) {}
      }
    },
    onMessage(cb) {
      messageSubs.add(cb);
      return () => messageSubs.delete(cb);
    },
    onStateChange(cb) {
      stateSubs.add(cb);
      return () => stateSubs.delete(cb);
    },
    close() {
      closed = true;
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      clearTimers();
      const socket = ws;
      ws = null;
      try { socket?.close(); } catch (_) {}
      setState('closed');
    },
  };
}
