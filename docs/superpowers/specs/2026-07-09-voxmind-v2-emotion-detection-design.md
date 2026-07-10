# VoxMind v2 — Emotion Detection Design Spec

Date: 2026-07-09
Status: Approved for planning
Builds on: v1 (docs/superpowers/specs/2026-07-09-voxmind-v1-design.md), which is
complete and working end-to-end.

## 1. Purpose & Scope

v1 gave VoxMind *expressive* emotion: the user picks a mood and the AI shapes its
wording and voice to match. v2 adds the *perceptive* half: VoxMind detects the
**user's** emotion (from their words and their voice tone) and automatically
selects the best-fitting mood — the "reads the room" capability that makes it
genuinely emotionally intelligent. Manual mood control is preserved via an
override.

**In scope (v2):**
- Text-based emotion detection (via the existing LLM).
- Voice-tone emotion detection (a pretrained speech-emotion model).
- Fusion of the two, mapping to one of the existing 5 moods.
- An "Auto" mood mode (new default) with manual override.
- UI showing the detected mood in Auto mode.

**Out of scope (v2):**
- New moods beyond the existing 5.
- Changing the downstream LLM/TTS/DSP pipeline (unchanged from v1).
- Long-term emotional memory / mood trends over a session (future).
- Paid/cloud emotion services (stays free/open-source).

## 2. Build Phasing (risk management)

The full "both channels" design is the target, but it will be built in two
phases so a working Auto loop lands early:

- **Phase A (v2.0):** Text-emotion only (via the LLM) → Auto mood selection →
  UI. This delivers the entire Auto-mood experience end-to-end for both typed
  and (transcribed) voice input, with no new model.
- **Phase B (v2.1):** Add the voice-tone model and the fusion rule on top.

Each phase is independently useful and testable. The plan will implement Phase A
fully first.

## 3. Detection

### 3.1 Text emotion (Phase A)
The existing Ollama Llama model classifies the emotion of the user's message.
Implementation: a dedicated lightweight classification call (separate from the
reply generation) that returns a single label from a fixed set. Prompt asks for
exactly one word from the allowed set; response is parsed and validated, falling
back to `neutral` on anything unexpected.

Allowed emotion labels (fixed set):
`neutral`, `happy`, `excited`, `sad`, `frustrated`, `anxious`, `calm`, `serious`.

### 3.2 Voice emotion (Phase B)
A pretrained wav2vec2-based speech-emotion-recognition model runs on the user's
utterance audio (voice turns only). It outputs one of the same allowed labels
(mapping the model's native label set onto ours). Runs on the T4 alongside
Whisper/Ollama/Piper.

### 3.3 Fusion
- **Typed input:** text emotion only.
- **Voice input:** run both; when they **conflict, voice tone wins** (how the
  user sounds reveals true feeling better than words). When voice detection is
  low-confidence or unavailable, fall back to text.

## 4. Emotion → Mood Mapping

The fused emotion maps to one of the 5 existing moods (which then drive the
unchanged LLM-wording + DSP-preset machinery):

| Detected emotion | Selected mood |
|---|---|
| sad, frustrated, anxious | Empathetic |
| happy | Happy |
| excited | Energetic |
| calm, neutral | Calm |
| serious | Professional |

This table lives in one place in code and is easy to tune.

## 5. Auto vs. Manual (mode control)

- The mood dropdown gains a new **"Auto"** entry, which is the **default**.
- **Auto mode:** each turn, the detected emotion selects the mood before the LLM
  runs. The selection is per-turn (no sticky state beyond the current turn).
- **Manual mode:** if the user selects a specific mood from the dropdown, that
  mood **locks** and detection no longer overrides it, until the user selects
  "Auto" again.
- The backend must know whether the client is in Auto or a locked manual mood,
  so mode is part of the config the client already sends.

## 6. UI

- Mood dropdown shows the current mode. In Auto, it displays the auto-picked
  mood, e.g. **"Auto · Empathetic"**; the orb tints to that mood as it already
  does. In manual, it shows just the chosen mood name (as today).
- The detected mood is surfaced each turn so the user can see the AI "reading"
  them and can catch a misread (and override via the dropdown).
- No other UI changes; the glass-orb + dock layout is unchanged.

## 7. Architecture Fit

```
user input (voice or text)
  → STT (voice only)
  → [NEW emotion step, only when mode == Auto]:
        text emotion (LLM)  ┐
        voice emotion (SER) ┘→ fuse → map to mood
  → LLM (with selected/locked mood) → TTS → DSP → reply
       (+ send detected mood to client for display)
```

Everything downstream of mood selection is v1 code, untouched. The emotion step
is skipped entirely when the user is in a locked manual mood, so manual mode has
zero added latency.

## 8. Protocol Changes

Additive only (v1 messages unchanged):
- Client → server `config` gains a mode indicator: `mood` may now be the literal
  `"auto"` (in addition to the 5 mood ids). When `"auto"`, the server runs
  emotion detection per turn; otherwise it uses the locked mood as in v1.
- Server → client: a new field/message conveying the per-turn detected mood when
  in Auto (e.g. `{"type":"mood","mood":"empathetic","source":"auto"}`) so the UI
  can show "Auto · Empathetic" and tint the orb.

## 9. Error Handling

- LLM emotion classification returns something unparseable → default `neutral` →
  Calm. Never blocks the turn.
- Voice-emotion model errors or low confidence → fall back to text emotion (or
  neutral for a voice turn with no usable text).
- The emotion step must never crash a turn; any failure degrades gracefully to a
  sensible default mood and the reply still happens.

## 10. Testing

- **Emotion→mood mapping:** unit-tested (pure logic).
- **Fusion rule:** unit-tested (text-only, voice-wins-conflict, fallback cases).
- **LLM/SER emotion parsing:** unit-tested with fakes (label validation +
  fallback to neutral), not the model quality itself.
- **Auto vs. manual mode:** unit-test that a locked manual mood skips detection
  and Auto runs it.
- **End-to-end:** manual — confirm Auto picks sensible moods for clearly
  emotional inputs, manual override locks, and the UI shows the detected mood.

## 11. Honest Limitations

- Free voice-emotion models are **imperfect** and will misread sometimes — this
  is why Auto is overridable and the detected mood is shown, not hidden.
- The wav2vec2 model adds GPU load and latency on the free T4; Phase B must keep
  the model small enough to run alongside the existing stack, or accept added
  delay. If it proves too heavy, acoustic heuristics (librosa pitch/energy/rate,
  already a dependency) are the documented fallback.
