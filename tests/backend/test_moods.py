from backend.moods import MOODS, get_mood, DspParams

def test_all_five_moods_present():
    assert set(MOODS) == {"calm", "happy", "energetic", "empathetic", "professional"}

def test_each_mood_has_prompt_and_preset():
    for mood in MOODS.values():
        assert mood.prompt_fragment.strip()
        assert isinstance(mood.preset, DspParams)

def test_energetic_faster_than_calm():
    assert MOODS["energetic"].preset.rate > MOODS["calm"].preset.rate

def test_get_mood_unknown_falls_back_to_calm():
    assert get_mood("nonexistent").id == "calm"
