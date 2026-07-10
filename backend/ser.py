"""Speech-emotion recognition (SER): classifies the user's voice tone.

Wraps a pretrained wav2vec2 emotion model via the HuggingFace transformers
pipeline. Free SER models are imperfect — classify() returns None whenever it
is unsure (low confidence, unknown label, empty audio, or any error), and the
caller falls back to text emotion per the v2 spec.
"""
import numpy as np
import librosa

# superb/wav2vec2-base-superb-er native labels -> our emotion label set.
_LABEL_MAP = {
    "neu": "neutral",
    "hap": "happy",
    "ang": "frustrated",
    "sad": "sad",
}

_MIN_CONFIDENCE = 0.4


class SerEngine:
    def __init__(self, model_name: str = "superb/wav2vec2-base-superb-er"):
        from transformers import pipeline  # deferred: heavy import
        self.pipe = pipeline("audio-classification", model=model_name)

    def classify(self, audio: np.ndarray, sr: int) -> str | None:
        """Emotion label for the utterance, or None when unsure/unavailable."""
        try:
            if audio is None or audio.size == 0:
                return None
            audio = audio.astype(np.float32)
            if sr != 16000:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
            results = self.pipe(audio, sampling_rate=16000)
            if not results:
                return None
            top = max(results, key=lambda r: r.get("score", 0.0))
            if top.get("score", 0.0) < _MIN_CONFIDENCE:
                return None
            return _LABEL_MAP.get(top.get("label"))
        except Exception:
            return None
