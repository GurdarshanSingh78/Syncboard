<div align="center">

# SyncBoard

**A real-time whiteboard + code pad for mock interviews — that replays itself, stroke by stroke.**

No React. No Socket.IO. Raw WebSockets, a hand-built CRDT, and an event-sourced replay engine.

[![Node](https://img.shields.io/badge/node-22%2B-3ECFCF?style=flat-square)](.)
[![Vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-F2A93B?style=flat-square)](.)
[![No Framework](https://img.shields.io/badge/react-none-E4587C?style=flat-square)](.)
[![License](https://img.shields.io/badge/license-MIT-8890A4?style=flat-square)](.)

<br/>

<!-- 📸 drop a screenshot or demo GIF here — e.g. ![demo](docs/demo.gif) -->

</div>

---

## Why

Mock interviews over Zoom have no shared surface that persists. CoderPad has no canvas. Excalidraw has no code pad. Nothing lets you scrub back through a session afterward to see exactly where you froze.

SyncBoard is both — plus the tape.

## Quick start

```bash
npm install
npm start
```

Open `localhost:8080`, create a room, open the link in a second tab. Two cursors, one canvas, live. Requires **Node 22+** — the event log runs on Node's built-in `node:sqlite`, zero install.

## Engineering highlights

| | |
|---|---|
| 🔌 **Sync layer** | Raw WebSockets — sequence numbers, resumable reconnects (`resume since seq N`), exponential backoff, live latency ping. No socket.io. |
| 🔀 **Conflict resolution** | A from-scratch **RGA CRDT** for the code pad — concurrent edits at the same cursor converge byte-identical, proven with a convergence test in `rga.js`. Whiteboard strokes use a tombstoned grow-only set. |
| 🎞️ **Event sourcing** | Every keystroke and stroke point is an immutable, timestamped row — never overwritten. `replay.html` re-runs the exact log through the exact same CRDT classes used live. |
| 📊 **Session summary** | Replay auto-detects long pauses and "thrash" (rapid delete bursts) — the numbers that make a replay useful for reviewing *your own* interview, not just a demo. |
| ⚡ **Canvas performance** | Three stacked layers — static grid, committed strokes, live overlay — so only the cheap layer repaints every frame. |
| 🎨 **UI** | Hand-tuned dark/light themes, zero icon libraries (every icon is inline SVG), zero code comments by design. |

## Architecture

```
Browser (vanilla JS)  ⇄  WebSocket /ws  ⇄  Express + ws server  ⇄  node:sqlite event log
      RGA + canvas         server-sequenced           "dumb pipe":
      CRDTs live here      op broadcast               orders, persists,
                                                        rebroadcasts — no
                                                        merge logic on the
                                                        server at all
```

Same shape as production sync systems (Figma, Linear): a thin, ordered, durable relay — all the interesting logic lives in the client.

## Deploy

Needs a platform that keeps a **long-running process** alive (WebSockets + in-memory room state) — not Vercel/Netlify-style serverless.

```bash
docker build -t syncboard .
docker run -p 8080:8080 -v $(pwd)/data:/app/data syncboard
```

A `render.yaml` blueprint is included — Render → **New → Blueprint** → point at the repo → done, with a persistent disk for the event log. Railway works the same way via the included `Dockerfile`.

## Stack

Vanilla JS (ES2022) · Express · `ws` · `node:sqlite` · Canvas API — no build step, no bundler.