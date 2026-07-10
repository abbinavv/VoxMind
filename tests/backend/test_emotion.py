from backend.emotion import (
    EMOTIONS, EMOTION_TO_MOOD, parse_emotion, classify_text, fuse, emotion_to_mood,
)

def test_label_set():
    assert EMOTIONS == frozenset(
        {"neutral", "happy", "excited", "sad", "frustrated", "anxious", "calm", "serious"}
    )

def test_mapping_covers_every_emotion():
    assert set(EMOTION_TO_MOOD) == set(EMOTIONS)

def test_mapping_rows_match_spec():
    assert EMOTION_TO_MOOD["sad"] == "empathetic"
    assert EMOTION_TO_MOOD["frustrated"] == "empathetic"
    assert EMOTION_TO_MOOD["anxious"] == "empathetic"
    assert EMOTION_TO_MOOD["happy"] == "happy"
    assert EMOTION_TO_MOOD["excited"] == "energetic"
    assert EMOTION_TO_MOOD["calm"] == "calm"
    assert EMOTION_TO_MOOD["neutral"] == "calm"
    assert EMOTION_TO_MOOD["serious"] == "professional"

def test_emotion_to_mood_unknown_falls_back_to_calm():
    assert emotion_to_mood("gibberish") == "calm"

def test_parse_emotion_normalizes_and_validates():
    assert parse_emotion(" Sad.\n") == "sad"
    assert parse_emotion("HAPPY") == "happy"
    assert parse_emotion("totally unexpected output") == "neutral"
    assert parse_emotion("") == "neutral"

def test_fuse_text_only_when_no_voice():
    assert fuse("sad", None) == "sad"

def test_fuse_voice_wins_conflict():
    assert fuse("neutral", "sad") == "sad"

def test_fuse_ignores_invalid_voice_label():
    assert fuse("happy", "not-a-label") == "happy"

class _FakeLlm:
    def __init__(self, reply):
        self.reply = reply
        self.messages = None
    def generate(self, messages):
        self.messages = messages
        return self.reply

class _RaisingLlm:
    def generate(self, messages):
        raise RuntimeError("ollama down")

def test_classify_text_parses_llm_label():
    llm = _FakeLlm(" Sad.\n")
    assert classify_text(llm, "I lost my job today") == "sad"
    # the user's text must be in the prompt somewhere
    assert any("I lost my job today" in m["content"] for m in llm.messages)

def test_classify_text_never_raises():
    assert classify_text(_RaisingLlm(), "hello") == "neutral"
