"""Emotion detection core: label set, emotion->mood mapping, fusion, and
LLM-based text classification. The emotion step must never crash a turn —
every path degrades to "neutral" on failure.
"""
import re

EMOTIONS: frozenset[str] = frozenset(
    {"neutral", "happy", "excited", "sad", "frustrated", "anxious", "calm", "serious"}
)

EMOTION_TO_MOOD: dict[str, str] = {
    "sad": "empathetic",
    "frustrated": "empathetic",
    "anxious": "empathetic",
    "happy": "happy",
    "excited": "energetic",
    "calm": "calm",
    "neutral": "calm",
    "serious": "professional",
}

_CLASSIFY_PROMPT = (
    "Classify the emotional state of the person who wrote the message below. "
    "Reply with exactly ONE word from this list and nothing else: "
    + ", ".join(sorted(EMOTIONS))
    + ".\n\nMessage: {text}"
)


def parse_emotion(raw: str) -> str:
    """Normalize an LLM/classifier output to a valid label, else 'neutral'."""
    cleaned = re.sub(r"[^a-z]", "", (raw or "").strip().lower().split()[0] if (raw or "").strip() else "")
    return cleaned if cleaned in EMOTIONS else "neutral"


def classify_text(llm, text: str) -> str:
    """Classify the user's message emotion via the LLM. Never raises."""
    try:
        reply = llm.generate(
            [{"role": "user", "content": _CLASSIFY_PROMPT.format(text=text)}]
        )
        return parse_emotion(reply)
    except Exception:
        return "neutral"


def fuse(text_emotion: str, voice_emotion: str | None) -> str:
    """Combine the two channels: a valid voice emotion wins; else text."""
    if voice_emotion in EMOTIONS:
        return voice_emotion
    return text_emotion if text_emotion in EMOTIONS else "neutral"


def emotion_to_mood(emotion: str) -> str:
    return EMOTION_TO_MOOD.get(emotion, "calm")
