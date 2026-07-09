# VoxMind

VoxMind is a real-time conversational voice AI: speak or type to it, and it
replies with both text and spoken audio, in one of five selectable moods
(Calm, Happy, Energetic, Empathetic, Professional), with manual voice controls
(pitch, bass, rate) layered on top. It's a zero-budget, fully open-source
build — no paid APIs — designed to run on a free-tier Colab GPU session with
a separately-hosted static web frontend.

This is v1: a portfolio/academic-showcase build. Turn-based conversation only
(no mid-speech interruption / barge-in) — see [Future Enhancements](#future-enhancements)
for what's deliberately out of scope.

## Architecture

Single Colab notebook process hosts all backend components; a static frontend
hosted elsewhere (e.g. GitHub Pages, or opened locally) connects to it over a
public tunnel.

```
Browser (frontend)                 Colab Notebook (backend)
┌─────────────────────┐            ┌───────────────────────────────┐
│ Mic capture          │  WS audio  │ FastAPI + WebSocket server     │
│ Waveform display      │─────────▶ │                                │
│ Text chat input       │           │  1. faster-whisper (STT)       │
│ Mood selector         │           │  2. Ollama (Llama 3.2 3B /     │
│ Voice sliders          │           │     Qwen2.5 3B) — LLM, mood   │
│ Audio playback         │◀───────── │     injected into system      │
└─────────────────────┘  WS audio/   │     prompt                    │
                          text reply  │  3. Piper TTS                 │
                                      │  4. DSP pass (librosa):       │
                                      │     pitch/rate/bass shift      │
                                      └───────────────────────────────┘
                                             ▲
                                       Cloudflare Tunnel (public URL)
```

## Running the backend (Colab)

1. Open `colab/VoxMind_backend.ipynb` in Google Colab.
2. Switch the runtime to a GPU (Runtime -> Change runtime type -> GPU, e.g. T4).
3. Run the cells **in order, top to bottom**:
   - **Cell 1** — clones the repo and installs Python dependencies
     (`pip install -q -r backend/requirements.txt`).
   - **Cell 2** — installs and starts Ollama, then pulls `llama3.2:3b`.
   - **Cell 3** — downloads the Piper voice (`en_US-lessac-medium`) files.
   - **Cell 4** — installs `cloudflared`, the tunnel client.
   - **Cell 5** — starts the VoxMind backend (`python -m colab.run_backend`)
     in the background, listening on `0.0.0.0:8000`.
   - **Cell 6** — opens a Cloudflare Tunnel to `localhost:8000` and prints a
     public `https://<random-name>.trycloudflare.com` URL.
4. Copy the host from Cell 6's printed URL. You will paste it into the
   frontend as `wss://<that-host>/ws`.

Environment variables the backend runner reads (all optional, with sane
defaults baked into Cell 5):

| Variable       | Default                  | Purpose                       |
|----------------|--------------------------|--------------------------------|
| `WHISPER_SIZE` | `base`                   | faster-whisper model size      |
| `OLLAMA_MODEL` | `llama3.2:3b`            | Ollama model to use for chat   |
| `PIPER_MODEL`  | *(required)*             | Path to the Piper `.onnx` voice|

**Important:** the Colab session is ephemeral. Every runtime restart, or
every re-run of Cell 6, produces a **new** tunnel URL — you must re-copy it
into the frontend each time you restart.

## Running the frontend

The frontend is a static HTML/JS/CSS app (`frontend/`) with no build step and
no external CDN dependencies. Two ways to run it:

- **Locally:** just open `frontend/index.html` directly in a browser.
- **Hosted:** push the `frontend/` folder to GitHub Pages (or any static
  host) and open the published URL.

Once loaded:

1. Paste `wss://<tunnel-host>/ws` (from the Colab Cell 6 output) into the
   connection field at the top.
2. Click **Connect** — the status dot turns green when connected.
3. Type a message and hit Send, or hold the mic button to speak.
4. Pick a mood and/or drag the pitch/bass/rate sliders — changes apply to
   the next turn.

The frontend never hardcodes a backend URL; it's always supplied by the user
at runtime, since the tunnel address changes per Colab session.

## Latency

The SRS target of sub-1-second round-trip latency is treated in this build as
a **stretch goal**, not a guarantee — free-tier GPU constraints make it hard
to hit reliably once Whisper transcription, LLM generation, and TTS
synthesis are chained sequentially per turn.

_(measured latency: TBD after first E2E run)_

## Future Enhancements

Deliberately out of scope for v1:

- Mid-speech interruption (barge-in), including the echo cancellation needed
  to avoid the mic picking up the AI's own audio output.
- Automatic emotion detection from the user's spoken input (sentiment/tone
  analysis feeding back into mood selection).
- Multi-language voice support.
- AI avatar with facial expressions.
- Persistent user profiles and saved voice presets.
- Always-on hosting (replacing the ephemeral Colab session model).

## Testing

Automated tests cover the pure-logic parts of the backend (mood mapping, DSP
parameter merging, WebSocket message protocol, turn handling):

```
py -m pytest tests/backend -v
```

End-to-end conversation quality, latency, and voice feel are verified
manually against a live Colab + frontend session — see the project's
implementation plan for the verification checklist.
