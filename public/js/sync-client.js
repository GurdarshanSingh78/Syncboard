class SyncClient extends EventTarget {
  constructor({ roomId, clientId, role, name }) {
    super();
    this.roomId = roomId;
    this.clientId = clientId;
    this.role = role;
    this.name = name;
    this.ws = null;
    this.lastSeq = 0;
    this.backoff = 500;
    this.maxBackoff = 8000;
    this.applied = new Set();
    this.connected = false;
    this.reconnectTimer = null;
    this.connect();
  }

  wsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({
      room: this.roomId,
      client: this.clientId,
      role: this.role,
      name: this.name,
    });
    return `${proto}://${window.location.host}/ws?${params.toString()}`;
  }

  connect() {
    this.dispatchEvent(new CustomEvent('status', { detail: { state: 'connecting' } }));
    const ws = new WebSocket(this.wsUrl());
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.connected = true;
      this.backoff = 500;
      this.dispatchEvent(new CustomEvent('status', { detail: { state: 'connected' } }));
      this.startPinging();
      if (this.lastSeq > 0) {
        ws.send(JSON.stringify({ type: 'resume', lastSeq: this.lastSeq }));
      }
    });

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      this.handleMessage(msg);
    });

    ws.addEventListener('close', (evt) => {
      this.connected = false;
      if (evt.code === 4404) {
        this.dispatchEvent(new CustomEvent('status', { detail: { state: 'not_found' } }));
        return;
      }
      this.dispatchEvent(new CustomEvent('status', { detail: { state: 'reconnecting' } }));
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.backoff = Math.min(this.backoff * 1.7, this.maxBackoff);
      this.connect();
    }, this.backoff);
  }

  handleMessage(msg) {
    if (msg.type === 'welcome') {
      this.color = msg.color;
      this.dispatchEvent(new CustomEvent('welcome', { detail: msg }));
      return;
    }
    if (msg.type === 'event') {
      this.applyEvent(msg);
      return;
    }
    if (msg.type === 'resume_data') {
      msg.events.forEach((e) => this.applyEvent(e));
      this.dispatchEvent(new CustomEvent('resumed'));
      return;
    }
    if (msg.type === 'cursor') {
      this.dispatchEvent(new CustomEvent('cursor', { detail: msg }));
      return;
    }
    if (msg.type === 'presence_join') {
      this.dispatchEvent(new CustomEvent('presence_join', { detail: msg }));
      return;
    }
    if (msg.type === 'presence_leave') {
      this.dispatchEvent(new CustomEvent('presence_leave', { detail: msg }));
      return;
    }
    if (msg.type === 'pong') {
      const latency = Date.now() - msg.t;
      this.dispatchEvent(new CustomEvent('latency', { detail: { latency } }));
      return;
    }
  }

  startPinging() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', t: Date.now() });
    }, 4000);
  }

  applyEvent(e) {
    if (e.seq) this.lastSeq = Math.max(this.lastSeq, e.seq);
    const dedupeKey = `${e.clientId}:${e.localId}`;
    if (e.localId && e.clientId === this.clientId && this.applied.has(dedupeKey)) {
      return;
    }
    this.dispatchEvent(new CustomEvent('op', { detail: e }));
  }

  sendOp(surface, kind, data) {
    const localId = `${this.clientId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    this.applied.add(`${this.clientId}:${localId}`);
    this.send({ type: 'op', surface, kind, data, localId });
    return localId;
  }

  sendCursor(payload) {
    this.send({ type: 'cursor', ...payload });
  }

  sendSnapshot(surface, seq, state) {
    this.send({ type: 'snapshot', surface, seq, state });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}
