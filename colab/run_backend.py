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
    tts = TtsEngine(model_path=os.environ["PIPER_MODEL"])  # e.g. en_US-amy-medium.onnx
    ser = None
    if os.environ.get("DISABLE_SER") != "1":
        try:
            from backend.ser import SerEngine
            ser = SerEngine()
            print("SER engine loaded (voice-tone emotion detection active)")
        except Exception as e:
            # Voice-tone detection is optional: fall back to text-only emotion.
            print(f"SER engine unavailable ({e}); continuing with text emotion only")
    app = create_app(stt, llm, tts, ser=ser)
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()
