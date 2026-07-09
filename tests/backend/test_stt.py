import numpy as np
from backend.stt import SttEngine

class _FakeSegment:
    def __init__(self, text): self.text = text

class _FakeModel:
    def __init__(self): self.received_sr_len = None
    def transcribe(self, audio, **kwargs):
        self.received_sr_len = len(audio)
        return [_FakeSegment(" hello"), _FakeSegment(" world")], None

def test_transcribe_joins_segments_and_strips():
    eng = SttEngine.__new__(SttEngine)   # bypass real model load
    eng.model = _FakeModel()
    audio = np.zeros(32000, dtype=np.float32)  # 2s @16k
    text = eng.transcribe(audio, sr=16000)
    assert text == "hello world"

def test_transcribe_resamples_to_16k():
    eng = SttEngine.__new__(SttEngine)
    fake = _FakeModel()
    eng.model = fake
    audio = np.zeros(48000, dtype=np.float32)  # 1s @48k -> should become 16000 samples
    eng.transcribe(audio, sr=48000)
    assert fake.received_sr_len == 16000
