from dataclasses import dataclass

@dataclass(frozen=True)
class DspParams:
    pitch: float   # semitones
    bass: float    # dB
    rate: float    # speed multiplier

@dataclass(frozen=True)
class Mood:
    id: str
    label: str
    prompt_fragment: str
    preset: DspParams

MOODS: dict[str, Mood] = {
    "calm": Mood("calm", "Calm",
        "Respond in a calm, measured, warm and reassuring tone. Keep sentences unhurried.",
        DspParams(pitch=-1.0, bass=2.0, rate=0.95)),
    "happy": Mood("happy", "Happy",
        "Respond in a cheerful, friendly, upbeat tone. Be positive and light.",
        DspParams(pitch=1.5, bass=0.0, rate=1.05)),
    "energetic": Mood("energetic", "Energetic",
        "Respond with high energy and enthusiasm. Be dynamic and lively.",
        DspParams(pitch=2.0, bass=0.0, rate=1.15)),
    "empathetic": Mood("empathetic", "Empathetic",
        "Respond with warmth and empathy. Acknowledge feelings, be gentle and supportive.",
        DspParams(pitch=-0.5, bass=1.0, rate=0.92)),
    "professional": Mood("professional", "Professional",
        "Respond in a clear, concise, professional tone. Be precise and courteous.",
        DspParams(pitch=0.0, bass=1.0, rate=1.0)),
    "flirty": Mood("flirty", "Flirty",
        "Respond in a playful, flirtatious, charming tone. Be warm, teasing and "
        "affectionate, with a hint of seduction — confident, smooth and tasteful, "
        "never crude.",
        DspParams(pitch=-0.5, bass=1.5, rate=0.9)),
}

def get_mood(mood_id: str) -> Mood:
    return MOODS.get(mood_id, MOODS["calm"])
