class CanvasBoard {
  constructor(container, { onStroke, onStrokePoint, onStrokeEnd, onErase, readOnly } = {}) {
    this.container = container;
    this.onStroke = onStroke;
    this.onStrokePoint = onStrokePoint;
    this.onStrokeEnd = onStrokeEnd;
    this.onErase = onErase;
    this.readOnly = !!readOnly;

    this.gridCanvas = this.makeLayer();
    this.strokesCanvas = this.makeLayer();
    this.liveCanvas = this.makeLayer();

    this.strokes = new Map();
    this.erased = new Set();
    this.activeStroke = null;
    this.remoteLive = new Map();

    this.tool = 'pen';
    this.color = '#F2A93B';
    this.width = 3;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (!this.readOnly) this.bindInput();
    this.drawGrid();
  }

  makeLayer() {
    const canvas = document.createElement('canvas');
    canvas.className = 'board-layer';
    this.container.appendChild(canvas);
    return canvas;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    [this.gridCanvas, this.strokesCanvas, this.liveCanvas].forEach((c) => {
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    this.width0 = rect.width;
    this.height0 = rect.height;
    this.drawGrid();
    this.redrawStrokes();
  }

  drawGrid() {
    const ctx = this.gridCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    const style = getComputedStyle(document.documentElement);
    ctx.strokeStyle = style.getPropertyValue('--grid-line').trim() || 'rgba(128,128,128,0.06)';
    ctx.lineWidth = 1;
    const gap = 28;
    for (let x = 0; x < this.width0; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.height0);
      ctx.stroke();
    }
    for (let y = 0; y < this.height0; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.width0, y + 0.5);
      ctx.stroke();
    }
  }

  bindInput() {
    const canvas = this.liveCanvas;
    let drawing = false;

    const posFromEvent = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = posFromEvent(e);
      if (this.tool === 'eraser') {
        drawing = true;
        this.eraseAt(x, y);
        return;
      }
      drawing = true;
      const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.activeStroke = { id, color: this.color, width: this.width, points: [[x, y]] };
      this.strokes.set(id, this.activeStroke);
      this.onStroke && this.onStroke(this.activeStroke);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const [x, y] = posFromEvent(e);
      if (this.tool === 'eraser') {
        this.eraseAt(x, y);
        return;
      }
      if (!this.activeStroke) return;
      this.activeStroke.points.push([x, y]);
      this.drawLiveStroke(this.activeStroke);
      this.onStrokePoint && this.onStrokePoint(this.activeStroke.id, [x, y]);
    });

    const finish = () => {
      if (!drawing) return;
      drawing = false;
      if (this.activeStroke) {
        this.commitStroke(this.activeStroke);
        this.onStrokeEnd && this.onStrokeEnd(this.activeStroke.id);
        this.activeStroke = null;
      }
      this.clearLive();
    };

    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointerleave', finish);
  }

  eraseAt(x, y) {
    const hit = [];
    for (const [id, stroke] of this.strokes) {
      if (this.erased.has(id)) continue;
      for (const [px, py] of stroke.points) {
        if (Math.hypot(px - x, py - y) < 14) {
          hit.push(id);
          break;
        }
      }
    }
    if (hit.length) {
      hit.forEach((id) => this.erased.add(id));
      this.redrawStrokes();
      this.onErase && this.onErase(hit);
    }
  }

  applyRemoteErase(ids) {
    ids.forEach((id) => this.erased.add(id));
    this.redrawStrokes();
  }

  drawLiveStroke(stroke) {
    const ctx = this.liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    this.paintStroke(ctx, stroke);
    for (const [, live] of this.remoteLive) this.paintStroke(ctx, live);
  }

  clearLive() {
    const ctx = this.liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    for (const [, live] of this.remoteLive) this.paintStroke(ctx, live);
  }

  paintStroke(ctx, stroke) {
    if (stroke.points.length < 2) {
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.arc(stroke.points[0][0], stroke.points[0][1], stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
    }
    ctx.stroke();
  }

  commitStroke(stroke) {
    this.strokes.set(stroke.id, stroke);
    const ctx = this.strokesCanvas.getContext('2d');
    this.paintStroke(ctx, stroke);
  }

  redrawStrokes() {
    const ctx = this.strokesCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    for (const [id, stroke] of this.strokes) {
      if (this.erased.has(id)) continue;
      this.paintStroke(ctx, stroke);
    }
  }

  applyRemoteStrokeStart(stroke) {
    if (this.strokes.has(stroke.id)) return;
    this.strokes.set(stroke.id, { ...stroke, points: [...stroke.points] });
    this.remoteLive.set(stroke.id, this.strokes.get(stroke.id));
  }

  applyRemoteStrokePoint(id, point) {
    let stroke = this.strokes.get(id);
    if (!stroke) {
      stroke = { id, color: this.color, width: this.width, points: [] };
      this.strokes.set(id, stroke);
      this.remoteLive.set(id, stroke);
    }
    stroke.points.push(point);
    const ctx = this.liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    if (this.activeStroke) this.paintStroke(ctx, this.activeStroke);
    for (const [, live] of this.remoteLive) this.paintStroke(ctx, live);
  }

  applyRemoteStrokeEnd(id) {
    const stroke = this.strokes.get(id);
    if (stroke) this.commitStroke(stroke);
    this.remoteLive.delete(id);
    const ctx = this.liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width0, this.height0);
    if (this.activeStroke) this.paintStroke(ctx, this.activeStroke);
    for (const [, live] of this.remoteLive) this.paintStroke(ctx, live);
  }

  loadSnapshot(state) {
    this.strokes = new Map(state.strokes.map((s) => [s.id, s]));
    this.erased = new Set(state.erased);
    this.redrawStrokes();
  }

  toSnapshot() {
    return {
      strokes: Array.from(this.strokes.values()),
      erased: Array.from(this.erased),
    };
  }

  setTool(tool) {
    this.tool = tool;
    this.liveCanvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }

  setColor(color) {
    this.color = color;
  }

  setWidth(width) {
    this.width = width;
  }

  clearAll() {
    this.strokes.clear();
    this.erased.clear();
    this.redrawStrokes();
  }
}
