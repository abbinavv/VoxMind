import json

VALID_STATES = {"listening", "thinking", "speaking", "error", "idle"}

def status(state: str, detail: str | None = None) -> str:
    if state not in VALID_STATES:
        raise ValueError(f"invalid state: {state}")
    return json.dumps({"type": "status", "state": state, "detail": detail})

def transcript(content: str) -> str:
    return json.dumps({"type": "transcript", "content": content})

def reply_text(content: str) -> str:
    return json.dumps({"type": "reply_text", "content": content})

def error(content: str) -> str:
    return json.dumps({"type": "error", "content": content})

def audio_start(sample_rate: int) -> str:
    return json.dumps({"type": "audio_start", "sample_rate": sample_rate})

def audio_end() -> str:
    return json.dumps({"type": "audio_end"})

def parse_client(raw: str) -> dict:
    """Parse a client->server JSON message. Raises ValueError on bad input."""
    obj = json.loads(raw)
    if "type" not in obj:
        raise ValueError("missing type")
    return obj
