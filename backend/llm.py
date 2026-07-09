import requests
from backend.moods import Mood

class Conversation:
    def __init__(self, system_base: str, max_turns: int = 8):
        self.system_base = system_base
        self.max_turns = max_turns
        self._history: list[dict] = []

    def add_user(self, text: str) -> None:
        self._history.append({"role": "user", "content": text})

    def add_assistant(self, text: str) -> None:
        self._history.append({"role": "assistant", "content": text})

    def build_messages(self, mood: Mood) -> list[dict]:
        system = {"role": "system",
                  "content": f"{self.system_base}\n\n{mood.prompt_fragment}"}
        capped = self._history[-(self.max_turns * 2):]
        return [system] + capped

class LlmClient:
    def __init__(self, model: str = "llama3.2:3b", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host.rstrip("/")

    def generate(self, messages: list[dict]) -> str:
        resp = requests.post(
            f"{self.host}/api/chat",
            json={"model": self.model, "messages": messages, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()
