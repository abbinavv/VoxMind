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
