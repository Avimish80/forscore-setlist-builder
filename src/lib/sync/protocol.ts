/**
 * Live-mode wire protocol — the single source of truth for what travels
 * between devices and the hub.
 *
 * Every message is a JSON envelope: { v: 1, type: '...', ...payload }.
 * Both the hub (server.js) and clients silently ignore unknown types, so
 * future kinds (page-change, transfer-*, annotation) can be added without
 * breaking older devices mid-gig.
 *
 * Cross-device identity: devices never exchange local database ids — every
 * device's autoincrement ids differ. The snapshot carries `forscorePath`,
 * which is the same filename on every device and is the key each device
 * uses to look up the PDF in its own storage.
 */

export const PROTOCOL_VERSION = 1;
export const SYNC_PATH = '/sync';

/** Charts a follower resolves for one song and one instrument. */
export interface SnapshotPart {
  /** pdf-store key on every device — the stable cross-device identifier. */
  forscorePath: string;
  displayTitle: string;
  /** How the part was resolved (manual/exact/family/generic/fallback). */
  source: string;
  detectedKey: string | null;
}

export interface SnapshotItem {
  /** 1-based position — stable within a session; commits reference it. */
  position: number;
  title: string;
  isSeparator: boolean;
  /** instrument -> resolved part, or null when nothing suits (shown honestly). */
  parts: Record<string, SnapshotPart | null>;
}

/** Everything a follower needs to render the whole set — no DB required. */
export interface SessionSnapshot {
  setlistName: string;
  instruments: string[];
  items: SnapshotItem[];
}

export interface FollowerInfo {
  name: string;
  instrument: string | null;
}

export interface SessionInfo {
  code: string;
  name: string;
  leaderPresent: boolean;
  followerCount: number;
}

// ── Client → hub ─────────────────────────────────────────────────────────────

export interface JoinMsg {
  v: number;
  type: 'join';
  role: 'leader' | 'follower';
  code: string;
  name: string;
  instrument?: string | null;
  /** Lets a leader reclaim its room after a disconnect, reload, or hub restart. */
  leaderToken?: string;
  setlistName?: string;
}

export interface SnapshotMsg {
  v: number;
  type: 'snapshot';
  snapshot: SessionSnapshot;
}

export interface CommitMsg {
  v: number;
  type: 'commit';
  position: number;
}

export interface ListSessionsMsg { v: number; type: 'list-sessions' }
export interface PingMsg { v: number; type: 'ping' }
export interface LeaveMsg { v: number; type: 'leave' }

// ── Hub → client ─────────────────────────────────────────────────────────────

export interface JoinedMsg {
  v: number;
  type: 'joined';
  code: string;
  leaderPresent: boolean;
  followerCount: number;
  /** Echoed back to the leader only. */
  leaderToken?: string;
}

export interface PresenceMsg {
  v: number;
  type: 'presence';
  leaderPresent: boolean;
  followers: FollowerInfo[];
}

export interface SessionsMsg { v: number; type: 'sessions'; sessions: SessionInfo[] }
export interface SessionEndedMsg { v: number; type: 'session-ended' }
export interface PongMsg { v: number; type: 'pong' }

export type SyncErrorCode = 'code-taken' | 'no-session' | 'bad-version' | 'not-leader';

export interface ErrorMsg {
  v: number;
  type: 'error';
  code: SyncErrorCode;
  message: string;
}

export type ClientMsg = JoinMsg | SnapshotMsg | CommitMsg | ListSessionsMsg | PingMsg | LeaveMsg;
export type HubMsg =
  | JoinedMsg | SnapshotMsg | CommitMsg | PresenceMsg
  | SessionsMsg | SessionEndedMsg | PongMsg | ErrorMsg;

// ── Identifiers ──────────────────────────────────────────────────────────────

/**
 * Unambiguous alphabet for the on-stage session code — no 0/O, 1/I/L, 2/Z,
 * 5/S, 8/B lookalikes, so it can be read across a stage and typed once.
 */
const CODE_ALPHABET = 'ACDEFHJKMNPRTWXY34679';

/**
 * Math.random rather than crypto: the hub origin is plain http on the LAN,
 * which is not a secure context, so crypto.randomUUID is unavailable there.
 * These are lobby codes among bandmates, not secrets.
 */
export function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function generateToken(): string {
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}
