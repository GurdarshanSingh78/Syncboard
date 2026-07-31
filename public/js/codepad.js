class CodePad {
  constructor({ textarea, highlightEl, siteId, onOps }) {
    this.textarea = textarea;
    this.highlightEl = highlightEl;
    this.rga = new RGA(siteId);
    this.onOps = onOps;
    this.lastKnown = '';
    this.suppressInput = false;

    this.textarea.addEventListener('input', () => this.handleInput());
    this.textarea.addEventListener('scroll', () => this.syncScroll());
    this.textarea.addEventListener('keyup', () => this.reportCursor());
    this.textarea.addEventListener('click', () => this.reportCursor());
    this.onCursorMove = null;
    this.renderHighlight();
  }

  handleInput() {
    if (this.suppressInput) return;
    const next = this.textarea.value;
    const prev = this.lastKnown;
    const { start, end, inserted } = this.diff(prev, next);
    const ops = [];

    if (end > start) {
      const deletedIds = this.rga.localDeleteRange(start, end);
      ops.push({ kind: 'delete', data: { ids: deletedIds } });
    }
    if (inserted.length) {
      const items = [];
      for (let i = 0; i < inserted.length; i += 1) {
        const item = this.rga.localInsert(start + i, inserted[i]);
        items.push(item);
      }
      ops.push({ kind: 'insert', data: { items } });
    }

    this.lastKnown = this.rga.toText();
    this.renderHighlight();
    if (ops.length) this.onOps(ops);
    this.reportCursor();
  }

  diff(prev, next) {
    let start = 0;
    const minLen = Math.min(prev.length, next.length);
    while (start < minLen && prev[start] === next[start]) start += 1;
    let prevEnd = prev.length;
    let nextEnd = next.length;
    while (
      prevEnd > start &&
      nextEnd > start &&
      prev[prevEnd - 1] === next[nextEnd - 1]
    ) {
      prevEnd -= 1;
      nextEnd -= 1;
    }
    return { start, end: prevEnd, inserted: next.slice(start, nextEnd) };
  }

  applyRemoteOp(kind, data) {
    const cursor = this.textarea.selectionStart;
    const beforeLen = this.rga.toText().length;

    if (kind === 'insert') {
      data.items.forEach((item) => this.rga.insert(item.left, item.id, item.ch));
    } else if (kind === 'delete') {
      data.ids.forEach((id) => this.rga.delete(id));
    }

    const next = this.rga.toText();
    const delta = next.length - beforeLen;
    this.suppressInput = true;
    this.textarea.value = next;
    this.lastKnown = next;
    const newCursor = Math.max(0, cursor + (delta > 0 && cursor >= 0 ? delta : 0));
    this.textarea.selectionStart = this.textarea.selectionEnd = Math.min(newCursor, next.length);
    this.suppressInput = false;
    this.renderHighlight();
  }

  renderHighlight() {
    this.highlightEl.innerHTML = `${Lexer.highlight(this.textarea.value)}\n`;
    this.syncScroll();
  }

  syncScroll() {
    this.highlightEl.parentElement.scrollTop = this.textarea.scrollTop;
    this.highlightEl.parentElement.scrollLeft = this.textarea.scrollLeft;
  }

  reportCursor() {
    if (this.onCursorMove) this.onCursorMove(this.textarea.selectionStart);
  }

  loadSnapshot(snapshot) {
    this.rga.loadSnapshot(snapshot);
    this.lastKnown = this.rga.toText();
    this.suppressInput = true;
    this.textarea.value = this.lastKnown;
    this.suppressInput = false;
    this.renderHighlight();
  }

  setText(text) {
    this.suppressInput = true;
    this.textarea.value = text;
    this.lastKnown = text;
    this.suppressInput = false;
    this.renderHighlight();
  }
}
