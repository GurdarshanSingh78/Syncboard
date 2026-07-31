(() => {
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('id') || '').toUpperCase();
  const role = params.get('role') || 'candidate';
  const name = params.get('name') || 'Guest';

  if (!roomId) {
    window.location.href = '/';
    return;
  }

  document.getElementById('roomCodeText').textContent = roomId;
  document.getElementById('roleText').textContent = `role ${role}`;
  document.getElementById('replayLink').href = `/replay.html?id=${roomId}`;
  document.title = `SyncBoard · ${roomId}`;

  const storageKey = `syncboard.client.${roomId}`;
  let clientId = sessionStorage.getItem(storageKey);
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, clientId);
  }

  const COLORS = ['#F2A93B', '#3ECFCF', '#E4587C', '#7C9CF2', '#8FD48A', '#C77DF2'];
  let myColor = '#F2A93B';

  const sync = new SyncClient({ roomId, clientId, role, name });

  const board = new CanvasBoard(document.getElementById('boardWrap'), {
    onStroke: (stroke) => {
      sync.sendOp('canvas', 'stroke_start', {
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        point: stroke.points[0],
      });
    },
    onStrokePoint: (id, point) => {
      sync.sendOp('canvas', 'stroke_point', { id, point });
    },
    onStrokeEnd: (id) => {
      sync.sendOp('canvas', 'stroke_end', { id });
    },
    onErase: (ids) => {
      sync.sendOp('canvas', 'erase', { ids });
    },
  });

  const codePad = new CodePad({
    textarea: document.getElementById('codeTextarea'),
    highlightEl: document.getElementById('highlightEl'),
    siteId: clientId,
    onOps: (ops) => {
      ops.forEach((op) => sync.sendOp('code', op.kind, op.data));
      document.getElementById('codeCount').textContent = `${codePad.rga.toText().length} chars`;
    },
  });

  const presence = new Presence({
    boardContainer: document.getElementById('boardWrap'),
    avatarList: document.getElementById('avatarList'),
  });

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const seqText = document.getElementById('seqText');
  const latencyText = document.getElementById('latencyText');
  const pulseLine = document.getElementById('pulseLine');
  const toast = document.getElementById('toast');

  const activity = new Array(40).fill(0);
  function bumpActivity() {
    activity[activity.length - 1] = 1;
  }
  function tickActivity() {
    activity.push(activity.shift() * 0.8);
    const pts = activity
      .map((v, i) => {
        const x = (i / (activity.length - 1)) * 160;
        const wobble = i % 2 === 0 ? 1 : -1;
        const y = 14 - v * 10 * wobble;
        return `${x},${y}`;
      })
      .join(' ');
    pulseLine.setAttribute('points', pts);
    setTimeout(tickActivity, 90);
  }
  tickActivity();

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  sync.addEventListener('status', (e) => {
    const state = e.detail.state;
    statusDot.className = `status-dot ${state}`;
    const labels = {
      connecting: 'connecting…',
      connected: 'connected',
      reconnecting: 're-syncing… reconnecting',
      not_found: 'room not found',
    };
    statusText.textContent = labels[state] || state;
  });

  sync.addEventListener('welcome', (e) => {
    myColor = e.detail.color;
    document.querySelector('.editor-input').style.caretColor = myColor;
    (e.detail.presence || []).forEach((p) => {
      if (p.clientId !== clientId) presence.upsertPeer(p.clientId, p);
    });
  });

  sync.addEventListener('resumed', () => {
    showToast('Caught up on missed changes');
  });

  sync.addEventListener('presence_join', (e) => {
    presence.upsertPeer(e.detail.clientId, e.detail);
    showToast(`${e.detail.name} joined as ${e.detail.role}`);
  });

  sync.addEventListener('presence_leave', (e) => {
    presence.removePeer(e.detail.clientId);
  });

  sync.addEventListener('latency', (e) => {
    latencyText.textContent = `${e.detail.latency} ms`;
  });

  sync.addEventListener('cursor', (e) => {
    const d = e.detail;
    if (typeof d.x === 'number' && d.x >= 0) {
      presence.moveCursor(d.clientId, d.color, d.name, d.x, d.y);
    }
  });

  sync.addEventListener('op', (e) => {
    const d = e.detail;
    seqText.textContent = `seq ${sync.lastSeq}`;
    bumpActivity();
    if (d.surface === 'code') {
      codePad.applyRemoteOp(d.kind, d.data);
      document.getElementById('codeCount').textContent = `${codePad.rga.toText().length} chars`;
      return;
    }
    if (d.surface === 'canvas') {
      if (d.kind === 'stroke_start') {
        board.applyRemoteStrokeStart({ id: d.data.id, color: d.data.color, width: d.data.width, points: [d.data.point] });
      } else if (d.kind === 'stroke_point') {
        board.applyRemoteStrokePoint(d.data.id, d.data.point);
      } else if (d.kind === 'stroke_end') {
        board.applyRemoteStrokeEnd(d.data.id);
      } else if (d.kind === 'erase') {
        board.applyRemoteErase(d.data.ids);
      }
    }
  });

  const boardWrap = document.getElementById('boardWrap');
  boardWrap.addEventListener('pointermove', (e) => {
    const rect = boardWrap.getBoundingClientRect();
    sync.sendCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  });
  boardWrap.addEventListener('pointerleave', () => {
    sync.sendCursor({ x: -1, y: -1 });
  });

  const swatchWrap = document.getElementById('swatches');
  COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = `swatch${i === 0 ? ' active' : ''}`;
    sw.style.background = c;
    sw.addEventListener('click', () => {
      board.setColor(c);
      swatchWrap.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
    });
    swatchWrap.appendChild(sw);
  });
  board.setColor(COLORS[0]);

  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      board.setTool(btn.dataset.tool);
    });
  });

  document.getElementById('widthRange').addEventListener('input', (e) => {
    board.setWidth(Number(e.target.value));
  });

  document.getElementById('clearBoard').addEventListener('click', () => {
    board.clearAll();
    showToast('Board cleared locally');
  });

  document.getElementById('roomCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => showToast('Room code copied'));
  });

  const divider = document.getElementById('divider');
  const workspace = document.getElementById('workspace');
  const codePane = document.getElementById('codePane');
  let dragging = false;

  divider.addEventListener('pointerdown', () => {
    dragging = true;
    divider.classList.add('active');
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const pct = Math.min(75, Math.max(25, ((e.clientX - rect.left) / rect.width) * 100));
    codePane.style.width = `${pct}%`;
    board.resize();
  });
  window.addEventListener('pointerup', () => {
    if (dragging) {
      dragging = false;
      divider.classList.remove('active');
      board.resize();
    }
  });

  let snapshotTick = 0;
  sync.addEventListener('op', () => {
    snapshotTick += 1;
    if (snapshotTick % 50 === 0) {
      sync.sendSnapshot('code', sync.lastSeq, codePad.rga.toSnapshot());
      sync.sendSnapshot('canvas', sync.lastSeq, board.toSnapshot());
    }
  });

  window.addEventListener('beforeunload', () => {
    sync.sendSnapshot('code', sync.lastSeq, codePad.rga.toSnapshot());
    sync.sendSnapshot('canvas', sync.lastSeq, board.toSnapshot());
  });
})();
