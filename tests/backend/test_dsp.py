import numpy as np
from backend.moods import get_mood
from backend.dsp import resolve_params, apply_dsp

def test_resolve_uses_mood_defaults_when_none():
    mood = get_mood("energetic")
    p = resolve_params(mood, None, None, None)
    assert p == mood.preset

def test_resolve_manual_override_wins():
    mood = get_mood("calm")
    p = resolve_params(mood, pitch=5.0, bass=None, rate=None)
    assert p.pitch == 5.0          # overridden
    assert p.bass == mood.preset.bass   # inherited
    assert p.rate == mood.preset.rate   # inherited

def test_apply_dsp_returns_float32_audio():
    sr = 22050
    audio = (0.1 * np.sin(2 * np.pi * 220 * np.arange(sr) / sr)).astype(np.float32)
    out = apply_dsp(audio, sr, resolve_params(get_mood("calm"), None, None, None))
    assert out.dtype == np.float32
    assert out.ndim == 1
    assert np.max(np.abs(out)) <= 1.0 + 1e-3

def test_apply_dsp_rate_changes_length():
    sr = 22050
    audio = (0.1 * np.sin(2 * np.pi * 220 * np.arange(sr) / sr)).astype(np.float32)
    from backend.moods import DspParams
    fast = apply_dsp(audio, sr, DspParams(pitch=0.0, bass=0.0, rate=2.0))
    assert len(fast) < len(audio)   # 2x speed -> shorter
