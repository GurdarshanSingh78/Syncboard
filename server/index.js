const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const store = require('./store');
const roomsRegistry = require('./rooms');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function generateRoomId() {
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/api/rooms', (req, res) => {
  let id = generateRoomId();
  while (store.getRoom(id)) id = generateRoomId();
  const room = store.createRoom(id, req.body?.title);
  res.json({ roomId: room.id, createdAt: room.created_at });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = store.getRoom(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json({ roomId: room.id, createdAt: room.created_at });
});

app.get('/api/rooms/:id/events', (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const room = store.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const raw = store.allEvents(roomId);
  const events = raw.map((e) => ({
    seq: e.seq,
    surface: e.type,
    clientId: e.client_id,
    ts: e.ts,
    kind: e.payload.kind,
    data: e.payload.data,
    localId: e.payload.localId,
  }));
  const canvasSnap = store.latestSnapshot(roomId, 'canvas');
  const codeSnap = store.latestSnapshot(roomId, 'code');
  res.json({ roomId, events, snapshots: { canvas: canvasSnap, code: codeSnap } });
});

const server = app.listen(PORT, () => {
  console.log(`SyncBoard listening on :${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = (url.searchParams.get('room') || '').toUpperCase();
  const clientId = url.searchParams.get('client') || crypto.randomUUID();
  const role = url.searchParams.get('role') || 'candidate';
  const name = url.searchParams.get('name') || 'Guest';

  if (!roomId || !store.getRoom(roomId)) {
    ws.close(4404, 'room_not_found');
    return;
  }

  const client = roomsRegistry.addClient(roomId, clientId, ws, role, name);
  let alive = true;

  ws.send(
    JSON.stringify({
      type: 'welcome',
      clientId,
      color: client.color,
      presence: roomsRegistry.presenceList(roomId),
    })
  );

  roomsRegistry.broadcast(
    roomId,
    {
      type: 'presence_join',
      clientId,
      role,
      name,
      color: client.color,
    },
    clientId
  );

  ws.on('pong', () => {
    alive = true;
  });

  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 15000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'op') {
      const event = store.appendEvent(roomId, msg.surface, clientId, {
        localId: msg.localId,
        kind: msg.kind,
        data: msg.data,
      });
      roomsRegistry.broadcast(roomId, {
        type: 'event',
        surface: event.type,
        seq: event.seq,
        clientId: event.clientId,
        ts: event.ts,
        localId: msg.localId,
        kind: msg.kind,
        data: msg.data,
      });
      return;
    }

    if (msg.type === 'cursor') {
      roomsRegistry.broadcast(
        roomId,
        {
          type: 'cursor',
          clientId,
          color: client.color,
          name,
          x: msg.x,
          y: msg.y,
          codeIndex: msg.codeIndex,
        },
        clientId
      );
      return;
    }

    if (msg.type === 'snapshot') {
      store.saveSnapshot(roomId, msg.surface, msg.seq, msg.state);
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
      return;
    }

    if (msg.type === 'resume') {
      const since = store.eventsSince(roomId, msg.lastSeq || 0);
      ws.send(
        JSON.stringify({
          type: 'resume_data',
          events: since.map((e) => ({
            surface: e.type,
            seq: e.seq,
            clientId: e.client_id,
            ts: e.ts,
            kind: e.payload.kind,
            data: e.payload.data,
            localId: e.payload.localId,
          })),
        })
      );
      return;
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    roomsRegistry.removeClient(roomId, clientId);
    roomsRegistry.broadcast(roomId, { type: 'presence_leave', clientId });
  });
});
