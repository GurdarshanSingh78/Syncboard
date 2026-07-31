# SyncBoard

A no-framework, real-time shared whiteboard and code pad for running mock technical interviews — and the only one that can replay a session stroke-by-stroke afterward.

No React. No Vue. No Socket.IO. The sync layer, the CRDTs, and the rendering engine are all hand-built on raw WebSockets and the Canvas API, because the point of this project is to demonstrate what those frameworks are usually hiding.

## Why this exists

Mock interviews over a video call have no shared surface that persists. Paid tools like CoderPad don't give you a canvas; free whiteboards don't give you a code pad; nothing gives you a session recording you can scrub through afterward to see exactly where you froze. SyncBoard is both, plus the tape.

## Running it

```bash
npm install
npm start
```

Open `http://localhost:8080`, create a room, and open the room link in a second tab (or send the room code to a friend) to see two cursors live. Node 22+ is required — the event log runs on Node's built-in `node:sqlite`, so there's nothing to install or configure.

## Architecture

```
┌─────────────┐        WebSocket (/ws)        ┌──────────────┐
│   Browser    │ ───────────────────────────▶ │   Express +   │
│  (vanilla JS)│ ◀─────────────────────────── │  ws server    │
└─────────────┘        server-sequenced         └──────┬───────┘
                          op broadcast                  │
                                                  append-only
                                                  event log
                                                  (node:sqlite)
```

The server is deliberately "dumb": it doesn't understand CRDTs or canvas strokes. It assigns each incoming operation a monotonic per-room sequence number, persists it, and rebroadcasts it verbatim. All the merge logic lives in the browser, which means the server is just an ordered, durable pipe — the same shape as production systems like Figma's or Linear's sync layers.

### 1. The sync layer (`sync-client.js`)

- Every operation carries a server-assigned `seq`. Clients track `lastSeq` and, on reconnect, send `{type: 'resume', lastSeq}` instead of re-fetching the whole room — the server replays only what was missed.
- A `clientId:localId` pair is attached to every locally-generated op so an echoed broadcast from the server never gets applied twice.
- Reconnection uses exponential backoff (500 ms → 8 s), and an app-level ping/pong on top of the WebSocket measures live round-trip latency, shown in the status bar.

### 2. Conflict resolution — two different CRDTs for two different shapes of data

**Code pad (`rga.js`)** — a from-scratch **RGA (Replicated Growable Array)**. Every character is an immutable node with a unique `{counter, siteId}` id and a reference to the node it was inserted after. Concurrent inserts at the same position are ordered deterministically by comparing ids, so two people typing in the same spot converge to the same final string on every client, regardless of arrival order — verified in practice by the convergence test below. Deletes are tombstones, not removals, so they can never conflict with a concurrent insert anchored to that position.

**Whiteboard (`canvas-board.js`)** — strokes are append-only by nature (nobody edits someone else's stroke), so it's modeled as a grow-only set with a tombstone set for erasing. Simpler than a full OT/CRDT text merge, and provably correct for this shape of data — using RGA-grade machinery here would be solving a problem the data doesn't have.

```
node public/js/rga.js   # run directly to sanity-check convergence:
# two replicas type concurrently at the same cursor position,
# insert at the same index from both sides, delete concurrently —
# final state is byte-identical on both sides every time.
```

### 3. Event sourcing, not state storage

Every stroke point and every character insert/delete is appended to `events` as its own row with a server timestamp — nothing is ever overwritten. `room.html` calls this the same log a fresh joiner replays to catch up, and `replay.html` re-runs it from scratch to reconstruct and animate the entire session afterward: same code path, two purposes.

Clients also periodically push a full-state **snapshot** (`sendSnapshot`) so a very late joiner doesn't have to replay thousands of events — the server serves the latest snapshot plus the delta since it. The snapshot is computed client-side; the server just stores whatever blob it's handed, keeping it opinion-free about what a "state" even is.

### 4. Replay (`replay.js`)

The replay viewer re-runs the exact event stream through the exact same `RGA` and `CanvasBoard` classes used live — there is no separate "playback renderer" to keep in sync with the real one. It adds:

- A **variable-speed scrubber** (0.5×–8×) with a density timeline showing where events clustered.
- **Session summary**: total duration, time-to-first-code, count of pauses over 12s, and "thrash" detection (three-plus deletes inside a 4-second window — a proxy for someone rewriting the same line repeatedly under pressure). These are the numbers that actually make a replay useful for reviewing your own interview performance, not just a neat demo.

### 5. Canvas performance

The whiteboard is three stacked canvases, not one:

- a **grid layer**, painted once and left alone,
- a **committed-strokes layer**, repainted only when a stroke finishes — not on every pointer move,
- a **live layer**, repainted every frame but holding only the in-progress stroke and remote cursors.

That split is what keeps the board smooth with several people drawing at once: the expensive "everything ever drawn" surface is touched as rarely as possible.

## Deploying it

SyncBoard needs a platform that keeps a **long-running Node process** alive (not serverless functions) — it holds WebSocket connections and in-memory room state, so a request/response-only host like Vercel or Netlify won't work for the server. A `Dockerfile` and a `render.yaml` blueprint are included so the two easiest options are copy-paste:

### Option A — Render (free tier, easiest)

1. Push this repo to GitHub.
2. In Render, **New → Blueprint**, point it at the repo. It reads `render.yaml` automatically and provisions a web service on the included `Dockerfile` plus a 1GB persistent disk mounted at `/app/data`, so the SQLite event log survives redeploys.
3. Deploy. Render gives you a `https://<name>.onrender.com` URL with TLS and WebSocket support already handled — no extra config needed.

### Option B — Railway

1. Push to GitHub, then **New Project → Deploy from GitHub repo** in Railway.
2. Railway auto-detects the `Dockerfile` and builds from it (this is what pins Node 22, which `node:sqlite` requires).
3. Add a volume in the service settings mounted at `/app/data` if you want the event log to persist across redeploys, and set the env var `DATA_DIR=/app/data` to match. Without a volume the app still works — sessions just don't survive a redeploy, since the filesystem resets.
4. Railway assigns a public domain automatically; no separate WebSocket configuration is needed since it's the same HTTP server upgrading the connection, not a separate service.

### Option C — Any VPS (Fly.io, a DigitalOcean droplet, etc.)

The `Dockerfile` runs anywhere Docker does:

```bash
docker build -t syncboard .
docker run -p 8080:8080 -v $(pwd)/data:/app/data syncboard
```

Put a reverse proxy (Caddy, Nginx, or the platform's own TLS layer) in front for HTTPS — the app itself just needs its `PORT` and, optionally, `DATA_DIR` env vars.

### What to know before sharing a public URL

- **There's no auth.** Anyone with a 6-character room code can join. That's an intentional MVP tradeoff (see "What's intentionally out of scope" above), but it means a public deploy is a demo instrument, not something to hand real interview content to yet.
- **Rooms are unbounded in the in-memory registry** (`server/rooms.js`) — fine for a demo or portfolio link, but a next step before any real traffic would be evicting rooms with no connected clients for a while, which the code doesn't currently do (idle empty rooms are only cleared when the last client's socket closes, not on a timer).
- **The disk is what makes replay durable.** If you deploy without a persistent volume, replay only works for sessions that happened since the last restart.

## What's intentionally out of scope

- **No auth, ephemeral rooms only** — a 6-character code is the whole access model, on purpose, to keep the surface area of a portfolio project honest.
- **No production-grade persistence** — `node:sqlite` is used because it ships with Node and needs zero setup; swapping in Postgres would mean changing `server/store.js` and nothing else, since every other module only talks to that file's exported functions.
- **The RGA is a teaching-grade implementation**, not Yjs. It's `O(n)` per insert rather than using a skip-list/tree index, which is the honest tradeoff for something meant to be read and understood end-to-end rather than vendored.

## Stack

Vanilla JS (ES2022 classes, no build step) · Express · `ws` · `node:sqlite` · Canvas API. Two typefaces, no icon library — every icon in the UI is a hand-drawn inline SVG.
