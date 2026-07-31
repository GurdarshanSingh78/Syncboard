const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'syncboard.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    title TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    room_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    client_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (room_id, seq)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    room_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    surface TEXT NOT NULL,
    state TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (room_id, surface, seq)
  );
`);

const insertRoomStmt = db.prepare(
  'INSERT OR IGNORE INTO rooms (id, created_at, title) VALUES (?, ?, ?)'
);
const getRoomStmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
const insertEventStmt = db.prepare(
  'INSERT INTO events (room_id, seq, type, client_id, payload, ts) VALUES (?, ?, ?, ?, ?, ?)'
);
const maxSeqStmt = db.prepare(
  'SELECT MAX(seq) as maxSeq FROM events WHERE room_id = ?'
);
const eventsSinceStmt = db.prepare(
  'SELECT * FROM events WHERE room_id = ? AND seq > ? ORDER BY seq ASC'
);
const allEventsStmt = db.prepare(
  'SELECT * FROM events WHERE room_id = ? ORDER BY seq ASC'
);
const insertSnapshotStmt = db.prepare(
  'INSERT OR REPLACE INTO snapshots (room_id, seq, surface, state, ts) VALUES (?, ?, ?, ?, ?)'
);
const latestSnapshotStmt = db.prepare(
  'SELECT * FROM snapshots WHERE room_id = ? AND surface = ? ORDER BY seq DESC LIMIT 1'
);

function createRoom(id, title) {
  insertRoomStmt.run(id, Date.now(), title || null);
  return getRoomStmt.get(id);
}

function getRoom(id) {
  return getRoomStmt.get(id);
}

function nextSeq(roomId) {
  const row = maxSeqStmt.get(roomId);
  return (row.maxSeq || 0) + 1;
}

function appendEvent(roomId, type, clientId, payload) {
  const seq = nextSeq(roomId);
  const ts = Date.now();
  insertEventStmt.run(roomId, seq, type, clientId, JSON.stringify(payload), ts);
  return { roomId, seq, type, clientId, payload, ts };
}

function eventsSince(roomId, seq) {
  return eventsSinceStmt
    .all(roomId, seq)
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

function allEvents(roomId) {
  return allEventsStmt
    .all(roomId)
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

function saveSnapshot(roomId, surface, seq, state) {
  insertSnapshotStmt.run(roomId, seq, surface, JSON.stringify(state), Date.now());
}

function latestSnapshot(roomId, surface) {
  const row = latestSnapshotStmt.get(roomId, surface);
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state) };
}

module.exports = {
  createRoom,
  getRoom,
  appendEvent,
  eventsSince,
  allEvents,
  saveSnapshot,
  latestSnapshot,
};
