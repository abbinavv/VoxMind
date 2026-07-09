import numpy as np
import librosa

class SttEngine:
    def __init__(self, model_size: str = "base", device: str = "auto", compute_type: str = "int8"):
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, audio: np.ndarray, sr: int) -> str:
        audio = audio.astype(np.float32)
        if sr != 16000:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        segments, _ = self.model.transcribe(audio, language="en", vad_filter=True)
        return "".join(seg.text for seg in segments).strip()
