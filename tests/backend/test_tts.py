import numpy as np
from backend.tts import TtsEngine

class _FakeConfig:
    sample_rate = 22050

class _FakeVoice:
    config = _FakeConfig()
    def synthesize(self, text, syn_config=None):
        # piper1-gpl yields AudioChunk objects; emulate .audio_int16_bytes
        class Chunk:
            audio_int16_bytes = (np.full(100, 3000, dtype=np.int16)).tobytes()
        yield Chunk()

def test_synthesize_returns_float32_and_sr():
    eng = TtsEngine.__new__(TtsEngine)
    eng.voice = _FakeVoice()
    audio, sr = eng.synthesize("hello")
    assert sr == 22050
    assert audio.dtype == np.float32
    assert np.max(np.abs(audio)) <= 1.0
    assert len(audio) == 100
