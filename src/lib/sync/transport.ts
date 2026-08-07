/**
 * Transport abstraction for live mode.
 *
 * Session logic (the leader and follower hooks) never touches WebSocket
 * directly — it talks to this interface. That keeps the door open for other
 * transports later (WebRTC for hub-less sessions, a secure cloud relay, a
 * native bridge once the app ships through the App Store) without changing
 * any session or UI code.
 */

export type ConnState = 'connecting' | 'open' | 'closed';

export interface SyncTransport {
  /** Fire-and-forget; silently dropped while the connection is down. */
  send(msg: object): void;
  /** Subscribe to inbound messages. Returns an unsubscribe function. */
  onMessage(cb: (msg: any) => void): () => void;
  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onStateChange(cb: (state: ConnState) => void): () => void;
  readonly state: ConnState;
  /** Stop reconnecting and release the connection for good. */
  close(): void;
}
