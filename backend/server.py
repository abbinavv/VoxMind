import json
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from backend import protocol
from backend.moods import get_mood
from backend.dsp import resolve_params, apply_dsp
from backend.llm import Conversation, LlmClient
from backend.stt import SttEngine
from backend.tts import TtsEngine

SYSTEM_BASE = "You are VoxMind, a friendly conversational voice assistant. Keep replies concise and natural for spoken conversation."

def handle_turn(user_text, convo, mood, llm, tts, pitch, bass, rate,
                send_json, send_audio):
    convo.add_user(user_text)
    send_json(protocol.status("thinking"))
    reply = llm.generate(convo.build_messages(mood))
    convo.add_assistant(reply)
    send_json(protocol.reply_text(reply))

    send_json(protocol.status("speaking"))
    audio, sr = tts.synthesize(reply)
    params = resolve_params(mood, pitch, bass, rate)
    audio = apply_dsp(audio, sr, params)
    pcm16 = np.clip(audio * 32768.0, -32768, 32767).astype(np.int16)

    send_json(protocol.audio_start(sr))
    send_audio(pcm16.tobytes())
    send_json(protocol.audio_end())
    send_json(protocol.status("idle"))

def create_app(stt: SttEngine, llm: LlmClient, tts: TtsEngine) -> FastAPI:
    app = FastAPI()

    @app.websocket("/ws")
    async def ws(sock: WebSocket):
        await sock.accept()
        convo = Conversation(system_base=SYSTEM_BASE)
        cfg = {"mood": "calm", "pitch": None, "bass": None, "rate": None}
        audio_buf = bytearray()
        try:
            while True:
                msg = await sock.receive()
                if "bytes" in msg and msg["bytes"] is not None:
                    audio_buf.extend(msg["bytes"])
                    continue
                data = protocol.parse_client(msg["text"])
                if data["type"] == "config":
                    cfg.update({k: data.get(k) for k in ("mood", "pitch", "bass", "rate")})
                elif data["type"] == "text":
                    await _run(sock, data["content"], convo, cfg, llm, tts)
                elif data["type"] == "audio_end":
                    pcm = np.frombuffer(bytes(audio_buf), dtype=np.float32)
                    audio_buf.clear()
                    text = stt.transcribe(pcm, sr=48000)
                    if not text:
                        await sock.send_text(protocol.status("idle", "no speech detected"))
                        continue
                    await sock.send_text(protocol.transcript(text))
                    await _run(sock, text, convo, cfg, llm, tts)
        except WebSocketDisconnect:
            return

    async def _run(sock, user_text, convo, cfg, llm, tts):
        outbox = []
        try:
            handle_turn(user_text, convo, get_mood(cfg["mood"]), llm, tts,
                        cfg["pitch"], cfg["bass"], cfg["rate"],
                        send_json=lambda m: outbox.append(("j", m)),
                        send_audio=lambda b: outbox.append(("b", b)))
        except Exception as e:  # component failure -> text-only fallback
            await sock.send_text(protocol.error(f"turn failed: {e}"))
            await sock.send_text(protocol.status("idle"))
            return
        for kind, payload in outbox:
            if kind == "j":
                await sock.send_text(payload)
            else:
                await sock.send_bytes(payload)

    return app
