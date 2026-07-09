import re
import numpy as np
from piper import PiperVoice, SynthesisConfig

# Stage directions the LLM emits (e.g. *giggle*, *laughs*, (sighs)) that should
# not be read aloud literally. Also strip stray markdown emphasis markers.
_STAGE_DIRECTION = re.compile(r"\*[^*]+\*|\([^)]*\)|[*_`#~]")

def _clean_for_speech(text: str) -> str:
    cleaned = _STAGE_DIRECTION.sub(" ", text)
    # Collapse whitespace left behind by removals.
    return re.sub(r"\s+", " ", cleaned).strip()

class TtsEngine:
    def __init__(self, model_path: str):
        self.voice = PiperVoice.load(model_path)

    def synthesize(self, text: str) -> tuple[np.ndarray, int]:
        text = _clean_for_speech(text)
        chunks = []
        for chunk in self.voice.synthesize(text, syn_config=SynthesisConfig()):
            chunks.append(np.frombuffer(chunk.audio_int16_bytes, dtype=np.int16))
        if chunks:
            pcm = np.concatenate(chunks)
        else:
            pcm = np.zeros(0, dtype=np.int16)
        audio = (pcm.astype(np.float32) / 32768.0)
        sr = int(self.voice.config.sample_rate)
        return audio, sr
