class Presence {
  constructor({ boardContainer, avatarList }) {
    this.boardContainer = boardContainer;
    this.avatarList = avatarList;
    this.peers = new Map();
    this.cursorEls = new Map();
  }

  upsertPeer(clientId, info) {
    const existing = this.peers.get(clientId) || {};
    this.peers.set(clientId, { ...existing, ...info });
    this.renderAvatars();
  }

  removePeer(clientId) {
    this.peers.delete(clientId);
    const el = this.cursorEls.get(clientId);
    if (el) el.remove();
    this.cursorEls.delete(clientId);
    this.renderAvatars();
  }

  renderAvatars() {
    this.avatarList.innerHTML = '';
    for (const [, peer] of this.peers) {
      const chip = document.createElement('div');
      chip.className = 'avatar-chip';
      chip.style.setProperty('--peer-color', peer.color);
      chip.title = `${peer.name} · ${peer.role}`;
      chip.textContent = (peer.name || '?').slice(0, 1).toUpperCase();
      this.avatarList.appendChild(chip);
    }
  }

  moveCursor(clientId, color, name, x, y) {
    let el = this.cursorEls.get(clientId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `<svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1L1 15L5 11.5L7.5 17L10 16L7.5 10.5L13 10.5Z"/></svg><span></span>`;
      this.boardContainer.appendChild(el);
      this.cursorEls.set(clientId, el);
    }
    el.style.setProperty('--peer-color', color);
    el.querySelector('span').textContent = name;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }
}
