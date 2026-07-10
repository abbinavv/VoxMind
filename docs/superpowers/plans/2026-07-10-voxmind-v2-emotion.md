# VoxMind v2 — Emotion Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VoxMind detects the user's emotion from their words (LLM) and voice tone (speech-emotion model), fuses them (voice wins), and auto-selects the best-fitting mood — with a new "Auto" mode (default) that manual mood selection overrides.

**Architecture:** A new `backend/emotion.py` holds the label set, emotion→mood mapping, fusion rule, and LLM text classification. A new `backend/ser.py` wraps a pretrained wav2vec2 speech-emotion model (Phase B, graceful fallback). `server.py` runs the emotion step per turn only when the client's mood is `"auto"`, sends the detected mood to the client via a new `mood` message, and passes the chosen mood into the existing unchanged pipeline. The frontend adds an "Auto" dropdown entry (default) and shows "Auto · <Mood>".

**Tech Stack:** existing stack + HuggingFace `transformers` pipeline (`superb/wav2vec2-base-superb-er`) for speech emotion (Phase B). No other new dependencies.

## Global Constraints

- Free/open-source only; no paid APIs.
- Python 3.10+; single in-process backend; WebSocket protocol is the single contract (additive changes only, v1 messages unchanged).
- Emotion labels (fixed set): `neutral, happy, excited, sad, frustrated, anxious, calm, serious`.
- Emotion→mood mapping (spec §4): sad/frustrated/anxious→empathetic; happy→happy; excited→energetic; calm/neutral→calm; serious→professional.
- The emotion step must NEVER crash a turn — any failure degrades to `neutral`→Calm.
- Manual (locked) mood mode skips detection entirely — zero added latency.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## File Structure

- `backend/emotion.py` — labels, mapping, fusion, LLM text classifier (Phase A).
- `backend/ser.py` — speech-emotion engine wrapper (Phase B).
- `backend/protocol.py` — add `mood_detected(mood)` builder.
- `backend/server.py` — emotion step wiring in `_run` + voice-emotion in audio path; `create_app(stt, llm, tts, ser=None)`.
- `backend/requirements.txt` — add `transformers`.
- `colab/run_backend.py` — construct SER engine, pass to create_app.
- `frontend/app.js` + `index.html` — Auto mode UI.
- Tests: `tests/backend/test_emotion.py`, `test_protocol.py` (extend), `test_server.py` (extend).

---

### Task 1: Emotion core (labels, mapping, fusion, LLM text classifier)

**Files:** Create `backend/emotion.py`, `tests/backend/test_emotion.py`

**Interfaces produced:**
- `EMOTIONS: frozenset[str]`
- `EMOTION_TO_MOOD: dict[str, str]`
- `parse_emotion(raw: str) -> str` (validated label or `"neutral"`)
- `classify_text(llm, text: str) -> str` (uses `llm.generate(messages)->str`; never raises)
- `fuse(text_emotion: str, voice_emotion: str | None) -> str` (voice wins when present)
- `emotion_to_mood(emotion: str) -> str`

Test cases: all mapping rows; fuse with None voice → text; fuse conflict → voice; parse garbage → neutral; classify_text with fake llm returning ` Sad.\n` → `sad`; classify_text with fake llm that raises → `neutral`.

### Task 2: Protocol — detected-mood message

**Files:** Modify `backend/protocol.py`, extend `tests/backend/test_protocol.py`

`mood_detected(mood: str) -> str` → `{"type":"mood","mood":<mood>,"source":"auto"}`.

### Task 3: Server wiring — Auto mode + voice-emotion plumb-through

**Files:** Modify `backend/server.py`, extend `tests/backend/test_server.py`

- `_run(sock, user_text, convo, cfg, llm, tts, voice_emotion=None)`: when `cfg["mood"] == "auto"`, call `emotion.classify_text(llm, user_text)`, `emotion.fuse(text_emo, voice_emotion)`, `emotion.emotion_to_mood(...)`, send `protocol.mood_detected(mood_id)`, and use `get_mood(mood_id)` for the turn. Otherwise identical to v1.
- `audio_end` branch: if a SER engine is present and mood is auto, compute `voice_emotion = ser.classify(pcm, sr)` (never raises; may be None) and pass into `_run`.
- `create_app(stt, llm, tts, ser=None)`.
- Extract the mood-selection logic into a testable helper `select_mood(cfg, llm, user_text, voice_emotion) -> tuple[Mood, str | None]` returning the mood and the detected mood id (None when manual). Tests: manual mood skips llm (fake llm that raises if called); auto uses detection; auto+voice_emotion wins.

### Task 4: Frontend — Auto mode UI

**Files:** Modify `frontend/index.html`, `frontend/app.js`

- Add `<li role="option" data-mood="auto">Auto</li>` at top of mood list; default `cfg.mood = "auto"`; aria-selected true.
- `applyMood("auto")` shows label "Auto", swatch/aura = calm color until a detection arrives.
- `onMessage` handles `{"type":"mood"}`: if `cfg.mood === "auto"`, set `--aura` to the detected mood's color, swatch, and label `Auto · <Mood>`. Does NOT change `cfg.mood`.
- Manual selection behaves exactly as v1 (locks; sends config with the specific mood).
- Verify with `node -c` + preview checks.

### Task 5 (Phase B): Speech-emotion engine

**Files:** Create `backend/ser.py`, `tests/backend/test_ser.py`; modify `backend/requirements.txt` (+`transformers>=4.30`), `colab/run_backend.py`, `colab/VoxMind_backend.ipynb` (note: model auto-downloads on first use).

- `class SerEngine`: `__init__(model_name="superb/wav2vec2-base-superb-er")` with DEFERRED transformers import; `classify(self, audio: np.ndarray, sr: int) -> str | None` — resamples to 16k, runs the audio-classification pipeline, maps `{neu:neutral, hap:happy, ang:frustrated, sad:sad}`, returns None on low score (<0.4), unknown label, empty audio, or ANY exception.
- `run_backend.py`: build `SerEngine` unless env `DISABLE_SER=1`; if construction fails, log and continue with `ser=None` (emotion falls back to text-only per spec §9).
- Tests use a fake pipeline (no model download): mapping, low-confidence → None, exception → None, resample called.

### Task 6: README + final suite

Update README (Auto mood feature, honest SER accuracy note). Run full `py -m pytest tests/backend -q` (expect all green) + `node -c frontend/app.js`.

## Self-Review

Spec coverage: §3.1→T1, §3.2→T5, §3.3→T1(fuse)+T3, §4→T1, §5→T3+T4, §6→T4, §8→T2+T3, §9→T1/T3/T5 (never-crash + fallbacks), §10→tests in T1/T2/T3/T5, §11→T6 README note. Phasing honored: T1–T4 are Phase A (no new model), T5 is Phase B. No placeholders; interface names consistent (`classify_text`, `fuse`, `emotion_to_mood`, `select_mood`, `mood_detected`, `SerEngine.classify`).
