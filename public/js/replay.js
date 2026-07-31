(() => {
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('id') || '').toUpperCase();
  if (!roomId) {
    window.location.href = '/';
    return;
  }
  document.getElementById('roomCodeText').textContent = roomId;
  document.getElementById('backLink').href = `/room.html?id=${roomId}&role=candidate&name=Guest`;

  const board = new CanvasBoard(document.getElementById('boardWrap'), { readOnly: true });
  const codePad = new CodePad({
    textarea: document.getElementById('codeTextarea'),
    highlightEl: document.getElementById('highlightEl'),
    siteId: 'replay',
    onOps: () => {},
  });

  let events = [];
  let cursor = 0;
  let playing = false;
  let speed = 1;
  let timer = null;
  let duration = 0;
  let startTs = 0;

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const timeLabel = document.getElementById('timeLabel');
  const scrubRange = document.getElementById('scrubRange');
  const densitySvg = document.getElementById('densitySvg');

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function resetSurfaces() {
    codePad.rga = new RGA('replay');
    codePad.setText('');
    board.clearAll();
  }

  function applyEvent(e) {
    if (e.surface === 'code') {
      codePad.applyRemoteOp(e.kind, e.data);
      document.getElementById('codeCount').textContent = `${codePad.rga.toText().length} chars`;
      return;
    }
    if (e.surface === 'canvas') {
      if (e.kind === 'stroke_start') {
        board.applyRemoteStrokeStart({ id: e.data.id, color: e.data.color, width: e.data.width, points: [e.data.point] });
      } else if (e.kind === 'stroke_point') {
        board.applyRemoteStrokePoint(e.data.id, e.data.point);
      } else if (e.kind === 'stroke_end') {
        board.applyRemoteStrokeEnd(e.data.id);
      } else if (e.kind === 'erase') {
        board.applyRemoteErase(e.data.ids);
      }
    }
  }

  function jumpTo(index) {
    pause();
    resetSurfaces();
    for (let i = 0; i < index; i += 1) applyEvent(events[i]);
    cursor = index;
    updateTransport();
  }

  function updateTransport() {
    const elapsed = events.length && cursor > 0 ? events[Math.min(cursor, events.length - 1)].ts - startTs : 0;
    timeLabel.textContent = `${fmt(elapsed)} / ${fmt(duration)}`;
    if (duration > 0) scrubRange.value = String(Math.round((elapsed / duration) * 1000));
  }

  function step() {
    if (!playing) return;
    if (cursor >= events.length) {
      pause();
      return;
    }
    applyEvent(events[cursor]);
    cursor += 1;
    updateTransport();
    if (cursor >= events.length) {
      pause();
      return;
    }
    const gap = Math.max(0, events[cursor].ts - events[cursor - 1].ts);
    const delay = Math.min(gap, 1400) / speed;
    timer = setTimeout(step, delay);
  }

  function play() {
    if (cursor >= events.length) jumpTo(0);
    playing = true;
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
    step();
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
  }

  playBtn.addEventListener('click', () => (playing ? pause() : play()));

  scrubRange.addEventListener('input', () => {
    if (!duration) return;
    const targetTs = startTs + (Number(scrubRange.value) / 1000) * duration;
    let idx = events.findIndex((e) => e.ts > targetTs);
    if (idx === -1) idx = events.length;
    jumpTo(idx);
  });

  document.getElementById('speedGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-speed]');
    if (!btn) return;
    speed = Number(btn.dataset.speed);
    document.querySelectorAll('#speedGroup button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });

  function computeSummary() {
    document.getElementById('statEvents').textContent = events.length;
    if (!events.length) return;
    startTs = events[0].ts;
    const endTs = events[events.length - 1].ts;
    duration = endTs - startTs;
    document.getElementById('statDuration').textContent = fmt(duration);

    const firstCode = events.find((e) => e.surface === 'code' && e.kind === 'insert');
    document.getElementById('statFirstCode').textContent = firstCode ? fmt(firstCode.ts - startTs) : '—';

    const PAUSE_MS = 12000;
    const pauses = [];
    for (let i = 1; i < events.length; i += 1) {
      const gap = events[i].ts - events[i - 1].ts;
      if (gap >= PAUSE_MS) pauses.push({ start: events[i - 1].ts, end: events[i].ts, gap });
    }
    document.getElementById('statPauses').textContent = pauses.length;

    const thrash = [];
    let deleteBurst = [];
    for (const e of events) {
      if (e.surface === 'code' && e.kind === 'delete') {
        deleteBurst.push(e.ts);
        deleteBurst = deleteBurst.filter((t) => e.ts - t < 4000);
        if (deleteBurst.length >= 3) {
          thrash.push({ ts: e.ts });
          deleteBurst = [];
        }
      }
    }
    document.getElementById('statThrash').textContent = thrash.length;

    renderDensity(pauses, thrash);
  }

  function renderDensity(pauses, thrash) {
    const buckets = 100;
    const counts = new Array(buckets).fill(0);
    events.forEach((e) => {
      const b = Math.min(buckets - 1, Math.floor(((e.ts - startTs) / duration) * buckets) || 0);
      counts[b] += 1;
    });
    const max = Math.max(1, ...counts);
    let svg = '';
    const barW = 1000 / buckets;
    counts.forEach((c, i) => {
      const h = Math.max(2, (c / max) * 26);
      svg += `<rect class="bar" x="${i * barW}" y="${30 - h}" width="${barW - 1}" height="${h}"></rect>`;
    });
    pauses.forEach((p) => {
      const x = ((p.start - startTs) / duration) * 1000;
      svg += `<rect class="pause" x="${x}" y="0" width="3" height="34"></rect>`;
    });
    thrash.forEach((t) => {
      const x = ((t.ts - startTs) / duration) * 1000;
      svg += `<rect class="thrash" x="${x}" y="0" width="3" height="34"></rect>`;
    });
    densitySvg.innerHTML = svg;
  }

  const divider = document.getElementById('divider');
  let dragging = false;
  divider.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    board.resize();
  });
  window.addEventListener('pointerup', () => (dragging = false));

  fetch(`/api/rooms/${roomId}/events`)
    .then((res) => {
      if (!res.ok) throw new Error('not_found');
      return res.json();
    })
    .then((data) => {
      events = data.events;
      computeSummary();
      updateTransport();
      if (!events.length) {
        timeLabel.textContent = 'No activity recorded yet';
      }
    })
    .catch(() => {
      timeLabel.textContent = 'Could not load this session';
    });
})();
