(() => {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      panels.forEach((p) => {
        p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab);
      });
    });
  });

  const errEl = document.getElementById('formError');

  function showError(message) {
    errEl.textContent = message;
  }

  function goToRoom(roomId, role, name) {
    const params = new URLSearchParams({ role, name });
    window.location.href = `/room.html?id=${roomId}&${params.toString()}`;
  }

  document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const name = document.getElementById('createName').value.trim();
    const role = document.querySelector('input[name="createRole"]:checked').value;
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      goToRoom(data.roomId, role, name);
    } catch {
      showError('Could not create a room. Try again in a moment.');
    }
  });

  document.getElementById('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const name = document.getElementById('joinName').value.trim();
    const role = document.querySelector('input[name="joinRole"]:checked').value;
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) {
        showError('No room with that code is open right now.');
        return;
      }
      goToRoom(code, role, name);
    } catch {
      showError('Could not reach that room. Check the code and try again.');
    }
  });
})();
