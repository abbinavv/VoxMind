import numpy as np
from backend.ser import SerEngine

def _engine_with_fake(results):
    """Build a SerEngine bypassing model load, with a fake pipeline."""
    eng = SerEngine.__new__(SerEngine)
    eng.pipe = lambda audio, **kw: results
    return eng

def _audio(seconds=1.0, sr=16000):
    return (0.1 * np.sin(np.arange(int(seconds * sr)) * 0.05)).astype(np.float32)

def test_maps_superb_labels_to_our_emotions():
    assert _engine_with_fake([{"label": "sad", "score": 0.9}]).classify(_audio(), 16000) == "sad"
    assert _engine_with_fake([{"label": "hap", "score": 0.9}]).classify(_audio(), 16000) == "happy"
    assert _engine_with_fake([{"label": "ang", "score": 0.9}]).classify(_audio(), 16000) == "frustrated"
    assert _engine_with_fake([{"label": "neu", "score": 0.9}]).classify(_audio(), 16000) == "neutral"

def test_low_confidence_returns_none():
    eng = _engine_with_fake([{"label": "sad", "score": 0.2}])
    assert eng.classify(_audio(), 16000) is None

def test_unknown_label_returns_none():
    eng = _engine_with_fake([{"label": "confused", "score": 0.99}])
    assert eng.classify(_audio(), 16000) is None

def test_empty_audio_returns_none():
    eng = _engine_with_fake([{"label": "sad", "score": 0.9}])
    assert eng.classify(np.zeros(0, dtype=np.float32), 16000) is None

def test_pipeline_exception_returns_none():
    eng = SerEngine.__new__(SerEngine)
    def boom(audio, **kw):
        raise RuntimeError("model exploded")
    eng.pipe = boom
    assert eng.classify(_audio(), 16000) is None

def test_resamples_to_16k():
    captured = {}
    eng = SerEngine.__new__(SerEngine)
    def pipe(audio, **kw):
        captured["n"] = len(audio)
        return [{"label": "neu", "score": 0.9}]
    eng.pipe = pipe
    eng.classify(_audio(seconds=1.0, sr=48000), 48000)  # 48000 samples in
    assert captured["n"] == 16000
