const PALETTE = [
  '#F2A93B',
  '#3ECFCF',
  '#E4587C',
  '#7C9CF2',
  '#8FD48A',
  '#C77DF2',
];

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Map(), colorCursor: 0 });
  }
  return rooms.get(roomId);
}

function assignColor(room) {
  const color = PALETTE[room.colorCursor % PALETTE.length];
  room.colorCursor += 1;
  return color;
}

function addClient(roomId, clientId, ws, role, name) {
  const room = getRoom(roomId);
  const color = assignColor(room);
  const client = { ws, role, name, color, cursor: null };
  room.clients.set(clientId, client);
  return client;
}

function removeClient(roomId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.clients.delete(clientId);
  if (room.clients.size === 0) rooms.delete(roomId);
}

function presenceList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.clients.entries()).map(([clientId, c]) => ({
    clientId,
    role: c.role,
    name: c.name,
    color: c.color,
  }));
}

function broadcast(roomId, message, excludeClientId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const [clientId, client] of room.clients) {
    if (clientId === excludeClientId) continue;
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(data);
    }
  }
}

module.exports = { getRoom, addClient, removeClient, presenceList, broadcast };
