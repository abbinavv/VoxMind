import numpy as np
from backend.tts import TtsEngine, _clean_for_speech

class _FakeConfig:
    sample_rate = 22050

class _FakeVoice:
    config = _FakeConfig()
    def __init__(self):
        self.last_text = None
    def synthesize(self, text, syn_config=None):
        self.last_text = text
        # piper1-gpl yields AudioChunk objects; emulate .audio_int16_bytes
        class Chunk:
            audio_int16_bytes = (np.full(100, 3000, dtype=np.int16)).tobytes()
        yield Chunk()

def test_clean_strips_stage_directions():
    assert _clean_for_speech("Hi *giggle* there") == "Hi there"
    assert _clean_for_speech("Well (sighs) ok") == "Well ok"
    assert _clean_for_speech("plain text") == "plain text"

def test_synthesize_cleans_text_before_piper():
    eng = TtsEngine.__new__(TtsEngine)
    eng.voice = _FakeVoice()
    eng.synthesize("You're sweet! *giggle* thanks")
    assert "*" not in eng.voice.last_text
    assert "giggle" not in eng.voice.last_text

def test_synthesize_returns_float32_and_sr():
    eng = TtsEngine.__new__(TtsEngine)
    eng.voice = _FakeVoice()
    audio, sr = eng.synthesize("hello")
    assert sr == 22050
    assert audio.dtype == np.float32
    assert np.max(np.abs(audio)) <= 1.0
    assert len(audio) == 100
