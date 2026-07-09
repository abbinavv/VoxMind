# colab/run_backend.py
import os, uvicorn
from backend.server import create_app
from backend.stt import SttEngine
from backend.llm import LlmClient
from backend.tts import TtsEngine

def main():
    stt = SttEngine(model_size=os.environ.get("WHISPER_SIZE", "base"),
                    device="cuda", compute_type="int8")
    llm = LlmClient(model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"))
    tts = TtsEngine(model_path=os.environ["PIPER_MODEL"])  # e.g. en_US-lessac-medium.onnx
    app = create_app(stt, llm, tts)
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()
