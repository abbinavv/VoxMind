import numpy as np
import librosa
from scipy.signal import butter, sosfilt
from backend.moods import DspParams, Mood

def resolve_params(mood: Mood, pitch, bass, rate) -> DspParams:
    p = mood.preset
    return DspParams(
        pitch=p.pitch if pitch is None else float(pitch),
        bass=p.bass if bass is None else float(bass),
        rate=p.rate if rate is None else float(rate),
    )

def _bass_shelf(audio: np.ndarray, sr: int, gain_db: float) -> np.ndarray:
    if abs(gain_db) < 1e-3:
        return audio
    # Low-frequency band (< 250 Hz) gain via a low-pass split.
    sos = butter(2, 250, btype="low", fs=sr, output="sos")
    low = sosfilt(sos, audio)
    gain = 10.0 ** (gain_db / 20.0)
    return (audio + (gain - 1.0) * low).astype(np.float32)

def apply_dsp(audio: np.ndarray, sr: int, params: DspParams) -> np.ndarray:
    out = audio.astype(np.float32)
    if abs(params.pitch) > 1e-3:
        out = librosa.effects.pitch_shift(out, sr=sr, n_steps=params.pitch)
    if abs(params.rate - 1.0) > 1e-3:
        out = librosa.effects.time_stretch(out, rate=params.rate)
    out = _bass_shelf(out, sr, params.bass)
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    if peak > 1.0:
        out = out / peak
    return out.astype(np.float32)
