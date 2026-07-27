# VoxMind: Auto-Discovering Backend Deployment (design)

**Status: proposed, not yet implemented.** Captured from a brainstorming session
on 2026-07-21 so the design isn't lost; implementation plan has not been
written yet.

## Problem

The backend only runs inside an ephemeral Colab notebook session. Every
restart produces a new Cloudflare Tunnel URL, which must be manually
copy-pasted into the frontend. There is no free way to get a truly
always-on GPU backend (no provider offers 24/7 free GPU), and the project's
zero-budget / no-paid-APIs constraint is a hard requirement, not a
preference — so "deploy it" cannot mean "rent a GPU box."

## Goal

Eliminate the manual copy-paste step. The user starts a free-tier GPU
notebook session (Colab or Kaggle) as before; the frontend automatically
discovers and connects to whichever session is currently active. Coverage
gaps between sessions are expected and acceptable — the target is removing
*friction*, not achieving true 24/7 uptime.

## Non-goals

- True always-on hosting (would require paid GPU hosting; explicitly rejected).
- Fully automatic session rotation / scheduling (would require scripting
  Colab/Kaggle in ways that risk account flags; explicitly rejected in favor
  of the user manually starting each session).
- Proxying audio/WebSocket traffic through any always-on relay (would burn
  through free-tier request/duration limits and add latency; rejected in
  favor of a metadata-only registry).
- Push notifications when a session dies (user opted for checking the
  frontend/admin page instead).

## Architecture

```
Browser (frontend, GitHub Pages)
   │
   │ 1. GET /current  ──────────►  Cloudflare Worker + Durable Object
   │ 2. { url, provider,               (free tier — URL registry only)
   │      registered_at }  ◄──────         ▲
   │                                        │ POST /register
   │ 3. wss://<that-host>/ws               { url, token }
   │    (direct connection,                 │
   │     same as today)              Colab / Kaggle notebook
   │                                  (startup cell, after opening
   ▼                                   its Cloudflare Tunnel, POSTs
Backend (unchanged: STT/LLM/TTS/SER)   its new URL to the Worker)
```

Key decision: the Worker is a **URL registry only**, not a traffic relay.
All actual voice/audio WebSocket traffic goes directly from the browser to
the Colab/Kaggle tunnel, exactly as today — only the discovery step changes.
This keeps the Worker's free-tier usage (Cloudflare Durable Objects, Workers
Free plan) to a handful of small HTTP requests per session rather than
proxying continuous audio traffic, which would risk exceeding the 100k
requests/day and 13,000 GB-s/day free limits.

## Components

1. **Registry Worker** (new `relay/` folder) — a Cloudflare Worker backed by
   one Durable Object storing `{url, provider, registered_at}`.
   - `POST /register` — bearer-token-protected (shared secret set once as a
     Colab/Kaggle secret + Worker env var), called by the notebook.
   - `GET /current` — public, called by the frontend.
   - No heartbeat/expiry logic required for correctness: if a registered
     tunnel has died, `/current` still returns the last known URL, and the
     frontend's own WebSocket connection attempt fails naturally — that
     failure (not a Worker-side liveness check) triggers the offline state.
     An optional `stale_after_Nh` hint can be added later for UX polish.

2. **Notebook registration step** — extend the existing
   `colab/VoxMind_backend.ipynb` startup cell (which already opens a
   Cloudflare Tunnel) to POST its new tunnel URL + shared secret to the
   Worker immediately after the tunnel URL is printed. Fully automatic on
   "Run all" — no manual copy-paste.

3. **Kaggle notebook variant** — new sibling notebook under `colab/` (or a
   renamed shared folder) replicating the same cells for Kaggle, since
   Kaggle also supports installing `cloudflared` and running a startup
   script. This is what allows rotating between providers as each one's
   free session/quota runs out.

4. **Frontend auto-discovery** (`frontend/app.js`) — on load, GET `/current`
   from the Worker instead of requiring a pasted URL. Manual paste remains
   available as an override. If the registry has no session, or the
   discovered session is unreachable, show a clear "VoxMind is asleep — no
   backend session running" state. No auto-retry/polling loop (per user
   preference — avoids retry spam; user re-opens/refreshes once they've
   started a new session).

## Error handling / edge cases

- Shared secret prevents unauthorized parties from overwriting the registry
  with their own URL.
- Stale registry entries (session died, nothing re-registered) are handled
  by connection failure at the frontend, not by liveness-checking in the
  Worker — keeps the Worker stateless and cheap.
- No coverage-gap detection/alerting is in scope; the user checks the
  frontend/admin page to see current status before use.

## Testing

- Worker: unit tests for register/current logic, runnable locally via
  `wrangler dev` (or equivalent), no deploy needed to test.
- Frontend: extend existing manual test flow to cover the auto-discovery
  fetch and the fallback-to-manual-paste path.
- No changes to backend Python logic — zero risk to the existing 44 passing
  backend tests.

## Open items before an implementation plan can be written

- Confirm Kaggle notebook startup mechanics (installing `cloudflared`,
  running a Python entrypoint) work the same way as in Colab — not yet
  verified hands-on.
- Decide the Worker's hosting/deploy process (Cloudflare account, Wrangler
  config) — not yet set up.
- Decide exact shared-secret distribution mechanism (Colab secret vs.
  Kaggle secret UI differ).
