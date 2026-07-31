class RGA {
  constructor(siteId) {
    this.siteId = siteId;
    this.counter = 0;
    this.seq = [];
    this.index = new Map();
  }

  nextId() {
    this.counter += 1;
    return `${this.counter}:${this.siteId}`;
  }

  static parseId(id) {
    const [counter, site] = id.split(':');
    return { counter: Number(counter), site };
  }

  static idGreater(a, b) {
    const pa = RGA.parseId(a);
    const pb = RGA.parseId(b);
    if (pa.counter !== pb.counter) return pa.counter > pb.counter;
    return pa.site > pb.site;
  }

  positionOf(id) {
    if (id === null) return -1;
    return this.index.get(id) ?? -1;
  }

  reindex(fromPos) {
    for (let i = fromPos; i < this.seq.length; i += 1) {
      this.index.set(this.seq[i].id, i);
    }
  }

  visibleIndexToId(visibleIndex) {
    if (visibleIndex <= 0) return null;
    let seen = 0;
    for (let i = 0; i < this.seq.length; i += 1) {
      if (!this.seq[i].tomb) {
        seen += 1;
        if (seen === visibleIndex) return this.seq[i].id;
      }
    }
    return this.seq.length ? this.seq[this.seq.length - 1].id : null;
  }

  localInsert(visibleIndex, ch) {
    const leftId = this.visibleIndexToId(visibleIndex);
    const id = this.nextId();
    this.insert(leftId, id, ch);
    return { id, left: leftId, ch };
  }

  insert(leftId, id, ch) {
    if (this.index.has(id)) return;
    let pos = leftId === null ? 0 : this.positionOf(leftId) + 1;
    while (pos < this.seq.length) {
      const node = this.seq[pos];
      if (node.left === leftId && RGA.idGreater(node.id, id)) {
        pos += 1;
      } else {
        break;
      }
    }
    this.seq.splice(pos, 0, { id, left: leftId, ch, tomb: false });
    this.reindex(pos);
  }

  localDeleteRange(visibleStart, visibleEnd) {
    const ids = [];
    let seen = 0;
    for (let i = 0; i < this.seq.length; i += 1) {
      if (!this.seq[i].tomb) {
        seen += 1;
        if (seen > visibleStart && seen <= visibleEnd) {
          ids.push(this.seq[i].id);
        }
      }
    }
    ids.forEach((id) => this.delete(id));
    return ids;
  }

  delete(id) {
    const pos = this.positionOf(id);
    if (pos === -1) return;
    this.seq[pos].tomb = true;
  }

  toText() {
    let out = '';
    for (let i = 0; i < this.seq.length; i += 1) {
      if (!this.seq[i].tomb) out += this.seq[i].ch;
    }
    return out;
  }

  toSnapshot() {
    return { siteId: this.siteId, counter: this.counter, seq: this.seq };
  }

  loadSnapshot(snapshot) {
    this.seq = snapshot.seq.map((n) => ({ ...n }));
    this.index = new Map();
    this.reindex(0);
  }
}

if (typeof module !== 'undefined') module.exports = RGA;
