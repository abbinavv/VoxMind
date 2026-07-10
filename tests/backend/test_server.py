import numpy as np
from backend.server import handle_turn
from backend.moods import get_mood
from backend.llm import Conversation

class _FakeLlm:
    def generate(self, messages): return "AI reply."

class _FakeTts:
    def synthesize(self, text):
        return np.zeros(50, dtype=np.float32), 22050

def test_handle_turn_message_order():
    sent = []
    convo = Conversation(system_base="S")
    handle_turn(
        user_text="hi",
        convo=convo,
        mood=get_mood("calm"),
        llm=_FakeLlm(),
        tts=_FakeTts(),
        pitch=None, bass=None, rate=None,
        send_json=lambda m: sent.append(("json", m)),
        send_audio=lambda b: sent.append(("audio", len(b))),
    )
    kinds = [k for k, _ in sent]
    assert kinds == ["json", "json", "json", "json", "audio", "json", "json"]
    # thinking, reply_text, speaking, audio_start, <audio>, audio_end, idle

def test_handle_turn_records_history():
    convo = Conversation(system_base="S")
    handle_turn(user_text="hi", convo=convo, mood=get_mood("calm"),
                llm=_FakeLlm(), tts=_FakeTts(), pitch=None, bass=None, rate=None,
                send_json=lambda m: None, send_audio=lambda b: None)
    msgs = convo.build_messages(get_mood("calm"))
    assert msgs[-2]["content"] == "hi"
    assert msgs[-1]["content"] == "AI reply."

# ---- v2: Auto-mode mood selection ----
from backend.server import select_mood

class _EmotionLlm:
    """Fake LLM whose generate() returns a fixed emotion label."""
    def __init__(self, label):
        self.label = label
        self.calls = 0
    def generate(self, messages):
        self.calls += 1
        return self.label

class _MustNotBeCalledLlm:
    def generate(self, messages):
        raise AssertionError("llm should not be called in manual mood mode")

def test_select_mood_manual_skips_detection():
    cfg = {"mood": "energetic", "pitch": None, "bass": None, "rate": None}
    mood, detected = select_mood(cfg, _MustNotBeCalledLlm(), "whatever", None)
    assert mood.id == "energetic"
    assert detected is None

def test_select_mood_auto_uses_text_emotion():
    cfg = {"mood": "auto", "pitch": None, "bass": None, "rate": None}
    mood, detected = select_mood(cfg, _EmotionLlm("sad"), "I feel awful", None)
    assert mood.id == "empathetic"
    assert detected == "empathetic"

def test_select_mood_auto_voice_wins():
    cfg = {"mood": "auto", "pitch": None, "bass": None, "rate": None}
    mood, detected = select_mood(cfg, _EmotionLlm("neutral"), "I'm fine", "sad")
    assert mood.id == "empathetic"
    assert detected == "empathetic"

def test_select_mood_auto_llm_failure_degrades_to_calm():
    class _Boom:
        def generate(self, messages):
            raise RuntimeError("down")
    cfg = {"mood": "auto", "pitch": None, "bass": None, "rate": None}
    mood, detected = select_mood(cfg, _Boom(), "hello", None)
    assert mood.id == "calm"
    assert detected == "calm"
