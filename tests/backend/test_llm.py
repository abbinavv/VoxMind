# tests/backend/test_llm.py
from backend.llm import Conversation
from backend.moods import get_mood

def test_system_message_includes_mood_fragment():
    convo = Conversation(system_base="You are VoxMind.")
    msgs = convo.build_messages(get_mood("happy"))
    assert msgs[0]["role"] == "system"
    assert "You are VoxMind." in msgs[0]["content"]
    assert get_mood("happy").prompt_fragment in msgs[0]["content"]

def test_history_order_and_roles():
    convo = Conversation(system_base="S")
    convo.add_user("hi")
    convo.add_assistant("hello")
    msgs = convo.build_messages(get_mood("calm"))
    assert [m["role"] for m in msgs] == ["system", "user", "assistant"]
    assert msgs[1]["content"] == "hi"

def test_history_capped_to_max_turns():
    convo = Conversation(system_base="S", max_turns=2)
    for i in range(5):
        convo.add_user(f"u{i}")
        convo.add_assistant(f"a{i}")
    msgs = convo.build_messages(get_mood("calm"))
    # system + 2 turns (4 messages)
    assert len(msgs) == 5
    assert msgs[1]["content"] == "u3"   # oldest kept turn
