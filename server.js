/**
 * Band hub — serves the app AND relays live-mode messages on one port.
 *
 * Run this on the laptop (or a Raspberry Pi / pocket box) at the gig, join
 * every device to the same Wi-Fi, and open the printed address on each
 * device. No internet is needed at any point.
 *
 *   npm run hub:build   build the app, then serve it (gig prep)
 *   npm run hub         serve an existing build (fast restart at a venue)
 *
 * This serves the production build on purpose. Next 14's custom-server
 * upgrade handler cannot route its own dev hot-reload socket (it calls
 * res.setHeader on what is a raw socket during an upgrade), so a dev-mode
 * hub would run with a broken, error-flooding websocket path right next to
 * the one the band depends on. Use `npm run dev` for ordinary UI work — the
 * Live page shows its "no hub found" state there, which is itself the state
 * worth designing against — and `npm run hub` to exercise real sync.
 *
 * The relay is a strict star: one leader per room broadcasts; followers only
 * receive (plus an invisible join/heartbeat). Rooms live in memory only —
 * the hub caches the latest snapshot and commit so that any device joining
 * or reconnecting mid-set is caught up instantly without leader involvement.
 *
 * Message shapes mirror src/lib/sync/protocol.ts (protocol v1). Unknown
 * message types are deliberately ignored for forward compatibility.
 */

const { createServer } = require('http');
const { parse } = require('url');
const os = require('os');
const next = require('next');
const { WebSocketServer } = require('ws');

const port = parseInt(process.env.PORT || '3000', 10);

const PROTOCOL_VERSION = 1;
const SYNC_PATH = '/sync';
const REAP_INTERVAL_MS = 15_000;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const IDLE_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

/** code -> room */
const rooms = new Map();

function makeRoom(code, name, leaderToken) {
  return {
    code,
    name: name || 'Live session',
    leaderWs: null,
    leaderToken,
    /** ws -> { name, instrument } */
    followers: new Map(),
    snapshot: null,
    lastCommit: null,
    lastActivity: Date.now(),
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...msg })); } catch (_) {}
  }
}

function sendError(ws, code, message) {
  send(ws, { type: 'error', code, message });
}

function broadcastToFollowers(room, msg) {
  for (const followerWs of room.followers.keys()) send(followerWs, msg);
}

function presenceOf(room) {
  return {
    type: 'presence',
    leaderPresent: !!room.leaderWs,
    followers: Array.from(room.followers.values()),
  };
}

function broadcastPresence(room) {
  const msg = presenceOf(room);
  send(room.leaderWs, msg);
  broadcastToFollowers(room, msg);
}

function sessionList() {
  return {
    type: 'sessions',
    sessions: Array.from(rooms.values()).map(room => ({
      code: room.code,
      name: room.name,
      leaderPresent: !!room.leaderWs,
      followerCount: room.followers.size,
    })),
  };
}

function detachSocket(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (room.leaderWs === ws) {
    // Non-explicit drop: keep the room so the leader can reclaim it with its
    // token after a Wi-Fi blip or iPad lock. Followers keep their chart up.
    room.leaderWs = null;
    broadcastPresence(room);
  } else if (room.followers.delete(ws)) {
    broadcastPresence(room);
  }
}

function handleJoin(ws, msg) {
  const code = String(msg.code || '').toUpperCase();
  if (!code) { sendError(ws, 'no-session', 'No session code given.'); return; }

  detachSocket(ws);

  if (msg.role === 'leader') {
    let room = rooms.get(code);
    if (room) {
      // Only the holder of the room's token may take the leader seat — this
      // is what makes leader reload/reconnect seamless and stops a second
      // device from hijacking a running session by guessing its code.
      if (msg.leaderToken !== room.leaderToken) {
        sendError(ws, 'code-taken', 'That session code is already in use.');
        return;
      }
      if (room.leaderWs && room.leaderWs !== ws) {
        try { room.leaderWs.terminate(); } catch (_) {}
        room.leaderWs = null;
      }
    } else {
      if (!msg.leaderToken) {
        sendError(ws, 'no-session', 'A leader needs a token to create a session.');
        return;
      }
      room = makeRoom(code, msg.setlistName, msg.leaderToken);
      rooms.set(code, room);
    }

    if (msg.setlistName) room.name = msg.setlistName;
    room.leaderWs = ws;
    room.lastActivity = Date.now();
    ws.room = room;

    send(ws, {
      type: 'joined',
      code: room.code,
      leaderPresent: true,
      followerCount: room.followers.size,
      leaderToken: room.leaderToken,
    });
    // A leader coming back from a dead battery or a locked screen has lost
    // its in-memory state. Tell it which song the band is actually on, so it
    // reopens on that song instead of offering to re-commit a stale one.
    if (room.lastCommit !== null) send(ws, { type: 'commit', position: room.lastCommit });
    broadcastPresence(room);
    return;
  }

  // Follower
  const room = rooms.get(code);
  if (!room) { sendError(ws, 'no-session', 'No session with that code.'); return; }

  room.followers.set(ws, {
    name: String(msg.name || 'Musician'),
    instrument: msg.instrument ?? null,
  });
  room.lastActivity = Date.now();
  ws.room = room;

  send(ws, {
    type: 'joined',
    code: room.code,
    leaderPresent: !!room.leaderWs,
    followerCount: room.followers.size,
  });
  // Replay the cached state so a mid-set joiner is current in one step.
  if (room.snapshot) send(ws, { type: 'snapshot', snapshot: room.snapshot });
  if (room.lastCommit !== null) send(ws, { type: 'commit', position: room.lastCommit });
  broadcastPresence(room);
}

function handleMessage(ws, msg) {
  if (typeof msg !== 'object' || msg === null) return;
  if (msg.v !== PROTOCOL_VERSION) {
    sendError(ws, 'bad-version', `This hub speaks protocol v${PROTOCOL_VERSION}.`);
    return;
  }

  switch (msg.type) {
    case 'ping':
      send(ws, { type: 'pong' });
      return;

    case 'list-sessions':
      send(ws, sessionList());
      return;

    case 'join':
      handleJoin(ws, msg);
      return;

    case 'snapshot': {
      const room = ws.room;
      if (!room || room.leaderWs !== ws) return;
      if (!msg.snapshot || !Array.isArray(msg.snapshot.items)) return;
      room.snapshot = msg.snapshot;
      if (msg.snapshot.setlistName) room.name = msg.snapshot.setlistName;
      room.lastActivity = Date.now();
      broadcastToFollowers(room, { type: 'snapshot', snapshot: room.snapshot });
      return;
    }

    case 'commit': {
      const room = ws.room;
      if (!room || room.leaderWs !== ws) return;
      if (typeof msg.position !== 'number') return;
      room.lastCommit = msg.position;
      room.lastActivity = Date.now();
      broadcastToFollowers(room, { type: 'commit', position: msg.position });
      return;
    }

    case 'leave': {
      const room = ws.room;
      if (!room) return;
      if (room.leaderWs === ws) {
        // An explicit end (unlike a drop) tears the session down for everyone.
        ws.room = null;
        room.leaderWs = null;
        broadcastToFollowers(room, { type: 'session-ended' });
        rooms.delete(room.code);
      } else {
        detachSocket(ws);
      }
      return;
    }

    default:
      // Unknown types are ignored on purpose — newer clients may speak them.
      return;
  }
}

/**
 * The /sync upgrade never passes through Next middleware, so re-apply the
 * same gate here: with SITE_PASSWORD set, the browser's own cookie on the
 * upgrade request must match, exactly as it must for every page.
 */
function authorized(req) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return true;
  const cookies = req.headers.cookie || '';
  return cookies.split(';').some(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return false;
    return part.slice(0, idx).trim() === 'auth' &&
      decodeURIComponent(part.slice(idx + 1).trim()) === password;
  });
}

function printBanner() {
  const found = [];
  for (const [iface, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push({ iface, address: entry.address });
    }
  }

  console.log('');
  console.log('  Band hub is up.');
  console.log('');

  if (found.length === 0) {
    console.log(`  No network address found — is Wi-Fi on? Local only: http://localhost:${port}`);
    console.log('');
    return;
  }

  console.log('  Open on every device (all on the same Wi-Fi):');
  console.log('');
  for (const { iface, address } of found) {
    console.log(`    ${iface.padEnd(6)} http://${address}:${port}`);
  }
  console.log('');
  console.log(`  Musicians open the same address with /live on the end.`);
  if (found.length > 1) {
    // Picking the wrong interface is the classic way this fails at a venue:
    // the hub answers on all of them, but only one is the band's Wi-Fi.
    console.log('  More than one address here — use the one whose first three');
    console.log('  numbers match the phone or iPad you are joining from.');
  }
  console.log('');
}

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Next attaches its OWN 'upgrade' listener to whatever server it sees, the
  // first time it handles a request — it finds it via req.socket.server in
  // NextCustomServer.setupWebSocketHandler. It would then write an HTTP
  // response into a socket we had already upgraded to a WebSocket, corrupting
  // every frame after the handshake (the symptom is "RSV1 must be clear" and
  // sockets dying seconds after the first page load). Claiming that setup
  // here, passing no server, makes Next skip attaching anything and leaves
  // upgrades entirely to the handler below.
  if (typeof app.setupWebSocketHandler === 'function') app.setupWebSocketHandler();

  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname !== SYNC_PATH) { socket.destroy(); return; }
    if (!authorized(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', ws => {
    ws.isAlive = true;
    ws.room = null;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', data => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }
      try { handleMessage(ws, msg); } catch (err) {
        console.error('hub: message handling failed:', err);
      }
    });
    ws.on('close', () => detachSocket(ws));
    ws.on('error', () => {});
  });

  // Reap dead sockets (locked iPads, vanished Wi-Fi) and stale rooms.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { try { ws.terminate(); } catch (_) {} continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
    }
    const now = Date.now();
    for (const [code, room] of rooms) {
      const empty = !room.leaderWs && room.followers.size === 0;
      if ((empty && now - room.lastActivity > EMPTY_ROOM_TTL_MS) ||
          now - room.lastActivity > IDLE_ROOM_TTL_MS) {
        rooms.delete(code);
      }
    }
  }, REAP_INTERVAL_MS);

  server.listen(port, '0.0.0.0', printBanner);
});
