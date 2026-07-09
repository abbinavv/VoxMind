const $ = (id) => document.getElementById(id);
let ws = null, audioCtx = null, micStream = null, procNode = null;
let cfg = { mood: "calm", pitch: null, bass: null, rate: null };
let playSr = 22050;

function setDot(on) { $("dot").className = "dot " + (on ? "on" : "off"); }
function addMsg(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who; d.textContent = text;
  $("transcript").appendChild(d); $("transcript").scrollTop = 1e9;
}
function sendCfg() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "config", ...cfg })); }

$("connect").onclick = () => {
  const url = $("url").value.trim();
  if (!url) return;
  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { setDot(true); sendCfg(); };
  ws.onclose = () => setDot(false);
  ws.onerror = () => setDot(false);
  ws.onmessage = onMessage;
};

function onMessage(ev) {
  if (typeof ev.data !== "string") { playPcm(ev.data); return; }
  const m = JSON.parse(ev.data);
  if (m.type === "transcript") addMsg(m.content, "user");
  else if (m.type === "reply_text") addMsg(m.content, "ai");
  else if (m.type === "audio_start") playSr = m.sample_rate;
  else if (m.type === "error") addMsg("⚠ " + m.content, "ai");
}

function playPcm(buf) {
  const i16 = new Int16Array(buf);
  const f32 = Float32Array.from(i16, (v) => v / 32768);
  const ctx = (audioCtx ||= new AudioContext());
  const audioBuf = ctx.createBuffer(1, f32.length, playSr);
  audioBuf.getChannelData(0).set(f32);
  const src = ctx.createBufferSource();
  src.buffer = audioBuf; src.connect(ctx.destination); src.start();
}

// Mood buttons
$("moods").querySelectorAll("button").forEach((b) => {
  b.onclick = () => {
    $("moods").querySelectorAll("button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active"); cfg.mood = b.dataset.mood; sendCfg();
  };
});
// Sliders (null when at neutral default so mood preset applies)
const bind = (id, key, neutral) => {
  $(id).oninput = () => {
    const v = parseFloat($(id).value);
    cfg[key] = (v === neutral) ? null : v; sendCfg();
  };
};
bind("pitch", "pitch", 0); bind("bass", "bass", 0); bind("rate", "rate", 1);

// Text send
function sendText() {
  const t = $("text").value.trim();
  if (!t || !ws || ws.readyState !== 1) return;
  addMsg(t, "user"); ws.send(JSON.stringify({ type: "text", content: t })); $("text").value = "";
}
$("send").onclick = sendText;
$("text").addEventListener("keydown", (e) => { if (e.key === "Enter") sendText(); });

// Mic: hold to talk, stream Float32 chunks, send audio_end on release
//
// NOTE on sample rate (deliberately deferred to Task 9, do not "fix" here):
// startMic uses the browser's default AudioContext sample rate (often 44.1/48 kHz),
// but the backend's audio_end handler currently resamples assuming 48000 Hz.
// During Task 9, confirm the real context rate (audioCtx.sampleRate) and either
// force `new AudioContext({ sampleRate: 48000 })` or send the actual rate in the
// audio_end message and use it backend-side. Resolve this mismatch before
// claiming voice input works end-to-end.
async function startMic() {
  if (!ws || ws.readyState !== 1) return;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = (audioCtx ||= new AudioContext());
  const source = ctx.createMediaStreamSource(micStream);
  procNode = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(procNode); procNode.connect(ctx.destination);
  drawWave(source, ctx);
  procNode.onaudioprocess = (e) => {
    if (ws && ws.readyState === 1) ws.send(e.inputBuffer.getChannelData(0).slice().buffer);
  };
}
function stopMic() {
  if (procNode) { procNode.disconnect(); procNode.onaudioprocess = null; procNode = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "audio_end" }));
}
$("mic").addEventListener("mousedown", startMic);
$("mic").addEventListener("mouseup", stopMic);
$("mic").addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
$("mic").addEventListener("touchend", (e) => { e.preventDefault(); stopMic(); });

function drawWave(source, ctx) {
  const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const canvas = $("wave"), c = canvas.getContext("2d");
  (function loop() {
    if (!procNode) return;
    analyser.getByteTimeDomainData(data);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = "#6c8cff"; c.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * canvas.width, y = (data[i] / 255) * canvas.height;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke(); requestAnimationFrame(loop);
  })();
}
