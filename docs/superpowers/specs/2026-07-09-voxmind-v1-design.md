# VoxMind v1 — Design Spec

Date: 2026-07-09
Status: Approved for planning

## 1. Purpose & Scope

VoxMind is a real-time conversational AI with mood-based behavior and manual
voice customization (pitch, bass, rate). This spec covers **v1**: a portfolio/
academic-showcase build, fully free/open-source, running on a free-tier Colab
GPU session with a separately-hosted static web frontend.

This v1 scope is derived from the full VoxMind SRS but deliberately narrows it:

- **In scope:** streaming voice input, text chat input, mood selection (5
  moods), voice parameter sliders (pitch/bass/rate), neural TTS output,
  turn-based conversation (no barge-in).
- **Out of scope for v1** (see Future Enhancements): mid-speech interruption
  (barge-in), automatic emotion detection from user speech, multi-language
  voice, AI avatar, persistent user profiles/voice presets, always-on hosting.

## 2. Constraints (from stakeholder decisions)

- Zero budget: no paid APIs. All models are open-source and self-hosted.
- Compute: free-tier Colab/Kaggle GPU notebook (typically a T4), not
  always-on — session is ephemeral and can disconnect.
- Frontend: web app (browser), hosted separately from the backend.
- Latency target from SRS (<1s) is treated as a **stretch goal**, not a
  guarantee — CPU/free-GPU-tier constraints make this hard to hit reliably,
  especially on Whisper transcription + LLM generation + TTS synthesis chained
  sequentially. This will be communicated honestly in the README rather than
  overclaimed.

## 3. Architecture

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

### Components

1. **Voice Input (frontend):** captures mic audio via Web Audio API, streams
   chunks over WebSocket. Simple voice-activity detection (silence timeout)
   marks end-of-utterance client-side.
2. **STT (backend):** faster-whisper, `small` or `base` model, GPU-accelerated
   via CTranslate2. Converts buffered utterance audio to text.
3. **Conversational Engine (backend):** Ollama serving Llama 3.2 3B or
   Qwen2.5 3B. Maintains a rolling conversation history (recent N turns).
   Selected mood is injected as a system-prompt fragment shaping tone and
   word choice.
4. **Mood Manager (backend):** maps each of the 5 moods (Calm, Happy,
   Energetic, Empathetic, Professional) to (a) a system-prompt fragment and
   (b) a default rate/pitch/bass preset. Mood changes apply on the next turn.
5. **TTS (backend):** Piper synthesizes the LLM reply text to raw audio.
6. **Voice DSP (backend):** librosa-based post-processing applies pitch
   shift, bass boost/cut, and rate scaling to Piper's output. Manual slider
   values (if set by the user) override the mood's default preset values;
   mood's prompt-shaping effect on wording is independent of slider state.
7. **Text Chat (both):** typed input bypasses STT but goes through the same
   LLM → mood shaping → TTS → DSP pipeline as voice input, producing both a
   displayed reply and spoken audio. One unified conversation thread
   regardless of input method.
8. **Transport:** FastAPI WebSocket endpoint carries both directions —
   audio chunks and text messages upstream; text replies and synthesized
   audio downstream. Exposed publicly via Cloudflare Tunnel (URL changes per
   Colab session restart; pasted into frontend settings each time).
9. **Frontend UI:** static HTML/JS/CSS single-page app — mic button, live
   waveform, text input box, mood buttons, pitch/bass/rate sliders, a
   settings field for the current backend WebSocket URL, and connection
   status indicator.

## 4. Data Flow (per turn)

1. User speaks (streamed over WS) **or** types a message.
2. Voice path: backend buffers audio for the utterance, runs faster-whisper
   → text. Text path: message used directly.
3. Text + rolling conversation history + current mood's prompt fragment →
   Ollama LLM → reply text.
4. Reply text → Piper → raw audio.
5. Raw audio → DSP pass (mood preset + any manual slider overrides) →
   final audio.
6. Final audio + reply text streamed back over WS; frontend plays audio and
   displays text together.
7. Turn-taking: mic reactivates only after AI finishes speaking (or user can
   type at any time). No barge-in/interruption handling in v1.

## 5. Error Handling

- **WS disconnect** (e.g. Colab session ends or tunnel drops): frontend
  detects the drop, shows a clear reconnect/"backend offline" state instead
  of failing silently or hanging.
- **No speech detected / silence timeout:** backend responds with a gentle
  "didn't catch that, try again" text+voice prompt rather than hanging
  indefinitely waiting for input.
- **Component failure mid-turn** (LLM or TTS error): backend sends a
  text-only fallback error message for that turn rather than dropping the
  turn with no feedback.
- **Malformed/empty transcription:** if Whisper returns empty text for a
  voice turn, treat it the same as "no speech detected."

## 6. Testing Approach

Given this is a real-time perceptual system, manual end-to-end conversation
testing (both voice and text input) is the primary verification method for
overall feel, latency, and voice quality — these are subjective/perceptual
and not meaningfully covered by automated tests.

Automated tests cover the parts that are pure logic:
- Mood → (prompt fragment, DSP preset) mapping correctness.
- DSP parameter merging logic (mood preset vs. manual slider overrides).
- WebSocket message protocol (schema of messages exchanged both directions).

## 7. Future Enhancements (explicitly deferred)

- Mid-speech interruption (barge-in), including echo cancellation needed to
  avoid the mic picking up the AI's own audio output.
- Automatic emotion detection from user's spoken input (sentiment/tone
  analysis feeding back into mood).
- Multi-language voice support.
- AI avatar with facial expressions.
- Persistent user profiles and saved voice presets.
- Always-on hosting (replacing the ephemeral Colab session model).
