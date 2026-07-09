import json
from backend import protocol

def test_status_message_shape():
    msg = protocol.status("thinking", detail="calling llm")
    parsed = json.loads(msg)
    assert parsed == {"type": "status", "state": "thinking", "detail": "calling llm"}

def test_reply_text_message_shape():
    msg = protocol.reply_text("Hello there")
    assert json.loads(msg) == {"type": "reply_text", "content": "Hello there"}

def test_audio_start_carries_sample_rate():
    msg = protocol.audio_start(22050)
    assert json.loads(msg) == {"type": "audio_start", "sample_rate": 22050}

def test_parse_client_config_defaults_none():
    parsed = protocol.parse_client('{"type":"config","mood":"calm","pitch":null,"bass":null,"rate":null}')
    assert parsed["type"] == "config"
    assert parsed["mood"] == "calm"
    assert parsed["pitch"] is None
