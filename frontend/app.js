const $ = (id) => document.getElementById(id);

const MOOD_COLORS = {
  calm: "#4bb8ff",
  happy: "#f5b83d",
  energetic: "#e0559f",
  empathetic: "#f07a7a",
  professional: "#9db4d6",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ws = null;
let audioCtx = null;
let micStream = null;
let procNode = null;
let micSampleRate = 48000;
let cfg = { mood: "calm", pitch: null, bass: null, rate: null };
let playSr = 22050;

// Orb / visual state
let orbState = "idle"; // idle | listening | thinking | speaking
let micAnalyser = null;
let micLevelData = null;
let playAnalyser = null;
let playLevelData = null;
let activePlaySources = 0;

// ---------- connection ----------

function setDot(on) {
  $("dot").className = "dot " + (on ? "on" : "off");
  $("dot").setAttribute("aria-label", on ? "connected" : "disconnected");
  $("dot").title = on ? "connected" : "disconnected";
}

function addMsg(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who;
  d.textContent = text;
  $("transcript").appendChild(d);
  $("transcript").scrollTop = 1e9;
}

function sendCfg() {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "config", ...cfg }));
}

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
  if (m.type === "transcript") {
    addMsg(m.content, "user");
  } else if (m.type === "reply_text") {
    addMsg(m.content, "ai");
    $("reply").textContent = m.content;
  } else if (m.type === "audio_start") {
    playSr = m.sample_rate;
  } else if (m.type === "error") {
    addMsg("⚠ " + m.content, "ai");
  } else if (m.type === "status") {
    $("status").textContent = m.state === "idle" || !m.state
      ? "tap to speak"
      : m.state + (m.detail ? " – " + m.detail : "");
    // Enforce turn-taking client-side: block the mic while the AI is busy.
    $("mic").disabled = (m.state === "thinking" || m.state === "speaking");
    setOrbState(m.state);
  }
}

// ---------- orb state machine ----------

function setOrbState(state) {
  const orb = $("orb");
  if (state !== "listening" && state !== "thinking" && state !== "speaking") state = "idle";
  orbState = state;
  orb.classList.remove("is-idle", "is-listening", "is-thinking", "is-speaking");
  orb.classList.add("is-" + state);
}

// ---------- mood dropdown ----------

function applyMood(mood) {
  cfg.mood = mood;
  document.documentElement.style.setProperty("--aura", MOOD_COLORS[mood] || MOOD_COLORS.calm);
  $("mood-label").textContent = mood.charAt(0).toUpperCase() + mood.slice(1);
  $("mood-swatch").style.background = MOOD_COLORS[mood] || MOOD_COLORS.calm;
  $("mood-list").querySelectorAll("li").forEach((li) => {
    li.setAttribute("aria-selected", li.dataset.mood === mood ? "true" : "false");
  });
}

$("mood-btn").addEventListener("click", () => {
  const list = $("mood-list");
  const open = list.hidden;
  list.hidden = !open;
  $("mood-btn").setAttribute("aria-expanded", String(open));
});
$("mood-list").querySelectorAll("li").forEach((li) => {
  li.addEventListener("click", () => {
    applyMood(li.dataset.mood);
    $("mood-list").hidden = true;
    $("mood-btn").setAttribute("aria-expanded", "false");
    sendCfg();
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".mood-select")) {
    $("mood-list").hidden = true;
    $("mood-btn").setAttribute("aria-expanded", "false");
  }
});

// ---------- gear (settings) & transcript toggles ----------

function setupToggle(btnId, panelId) {
  const btn = $(btnId), panel = $(panelId);
  btn.addEventListener("click", () => {
    const willShow = panel.hidden;
    panel.hidden = !willShow;
    btn.setAttribute("aria-expanded", String(willShow));
  });
}
setupToggle("gear", "settings-panel");
setupToggle("transcript-toggle", "transcript-panel");

// ---------- sliders (null when at neutral default so mood preset applies) ----------

const bind = (id, key, neutral) => {
  $(id).oninput = () => {
    const v = parseFloat($(id).value);
    cfg[key] = (v === neutral) ? null : v;
    sendCfg();
  };
};
bind("pitch", "pitch", 0);
bind("bass", "bass", 0);
bind("rate", "rate", 1);

// ---------- text send ----------

function sendText() {
  const t = $("text").value.trim();
  if (!t || !ws || ws.readyState !== 1) return;
  addMsg(t, "user");
  ws.send(JSON.stringify({ type: "text", content: t }));
  $("text").value = "";
}
$("send").onclick = sendText;
$("text").addEventListener("keydown", (e) => { if (e.key === "Enter") sendText(); });

// ---------- mic: hold to talk ----------

async function startMic() {
  if (!ws || ws.readyState !== 1) return;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = (audioCtx ||= new AudioContext());
  micSampleRate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(micStream);

  // Visual analyser for the "listening" reactive ripple / glow (does not affect the backend stream).
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 1024;
  micLevelData = new Float32Array(micAnalyser.fftSize);
  source.connect(micAnalyser);

  procNode = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(procNode);
  procNode.connect(sink);
  sink.connect(ctx.destination);
  procNode.onaudioprocess = (e) => {
    if (ws && ws.readyState === 1) ws.send(e.inputBuffer.getChannelData(0).slice().buffer);
  };
}

function stopMic() {
  if (procNode) { procNode.disconnect(); procNode.onaudioprocess = null; procNode = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  micAnalyser = null;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "audio_end", sample_rate: micSampleRate }));
}

$("mic").addEventListener("mousedown", startMic);
$("mic").addEventListener("mouseup", stopMic);
$("mic").addEventListener("mouseleave", () => { if (micStream) stopMic(); });
$("mic").addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
$("mic").addEventListener("touchend", (e) => { e.preventDefault(); stopMic(); });

function micLevel() {
  if (!micAnalyser || !micLevelData) return 0;
  micAnalyser.getFloatTimeDomainData(micLevelData);
  let sum = 0;
  for (let i = 0; i < micLevelData.length; i++) sum += micLevelData[i] * micLevelData[i];
  return Math.sqrt(sum / micLevelData.length);
}

// ---------- playback (Int16 PCM -> Float32, routed through analyser for "speaking" pulse) ----------

function playPcm(buf) {
  const i16 = new Int16Array(buf);
  const f32 = Float32Array.from(i16, (v) => v / 32768);
  const ctx = (audioCtx ||= new AudioContext());
  const audioBuf = ctx.createBuffer(1, f32.length, playSr);
  audioBuf.getChannelData(0).set(f32);

  if (!playAnalyser) {
    playAnalyser = ctx.createAnalyser();
    playAnalyser.fftSize = 1024;
    playAnalyser.connect(ctx.destination);
    playLevelData = new Float32Array(playAnalyser.fftSize);
  }

  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.connect(playAnalyser);
  activePlaySources++;
  src.onended = () => {
    activePlaySources = Math.max(0, activePlaySources - 1);
  };
  src.start();
}

function playLevel() {
  if (!playAnalyser || !playLevelData || activePlaySources <= 0) return 0;
  playAnalyser.getFloatTimeDomainData(playLevelData);
  let sum = 0;
  for (let i = 0; i < playLevelData.length; i++) sum += playLevelData[i] * playLevelData[i];
  return Math.sqrt(sum / playLevelData.length);
}

// ---------- orb starfield canvas ----------

const NUM_STARS = 90;
const stars = [];
(function initStars() {
  for (let i = 0; i < NUM_STARS; i++) {
    const r = Math.random() * 150 + 10;
    stars.push({
      angle: Math.random() * Math.PI * 2,
      radius: r,
      size: Math.random() * 1.6 + 0.4,
      baseAlpha: Math.random() * 0.6 + 0.25,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
})();

const starCanvas = $("starfield");
const sctx = starCanvas.getContext("2d");
let frame = 0;

function currentAura() {
  return getComputedStyle(document.documentElement).getPropertyValue("--aura").trim() || "#4bb8ff";
}

function drawFrame() {
  frame++;
  const w = starCanvas.width, h = starCanvas.height;
  const cx = w / 2, cy = h / 2;
  sctx.clearRect(0, 0, w, h);

  const listening = orbState === "listening";
  const thinking = orbState === "thinking";
  const speaking = orbState === "speaking";

  const mLevel = listening ? Math.min(1, micLevel() * 6) : 0;
  const pLevel = speaking ? Math.min(1, playLevel() * 6) : 0;

  const aura = currentAura();

  for (const s of stars) {
    let angle = s.angle;
    let alpha = s.baseAlpha;
    let size = s.size;

    if (thinking && !reduceMotion) {
      // Swirling galaxy: rotation speed grows with radius.
      angle += frame * 0.002 * (0.3 + s.radius / 160);
    }
    if (listening && !reduceMotion) {
      alpha = s.baseAlpha * (0.5 + mLevel * 0.9);
      size = s.size * (1 + mLevel * 0.6);
    }
    if (speaking && !reduceMotion) {
      alpha = s.baseAlpha * (0.6 + pLevel * 1.2);
      size = s.size * (1 + pLevel * 1.1);
      angle += Math.sin(frame * 0.05 + s.radius) * pLevel * 0.02;
    }
    if (!reduceMotion) {
      alpha *= 0.75 + 0.25 * Math.sin(frame * 0.03 + s.twinkle);
    }

    const x = cx + Math.cos(angle) * s.radius;
    const y = cy + Math.sin(angle) * s.radius;
    sctx.beginPath();
    sctx.arc(x, y, Math.max(0.2, size), 0, Math.PI * 2);
    sctx.fillStyle = aura;
    sctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    sctx.fill();
  }
  sctx.globalAlpha = 1;

  // Orb glow / scale reaction
  const orb = $("orb");
  if (!reduceMotion) {
    if (listening) {
      const glow = 40 + mLevel * 60;
      orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 ${glow}px -6px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
      orb.style.transform = "scale(1)";
    } else if (speaking) {
      const scale = 1 + pLevel * 0.06;
      const glow = 50 + pLevel * 90;
      orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 ${glow}px -4px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
      orb.style.transform = `scale(${scale})`;
    } else if (thinking) {
      orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 55px -8px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
      orb.style.transform = "scale(1)";
    } else {
      orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 30px -10px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
      orb.style.transform = "scale(1)";
    }
  }

  if (!reduceMotion || frame === 1) {
    requestAnimationFrame(drawFrame);
  }
}
requestAnimationFrame(drawFrame);
if (reduceMotion) {
  // Render exactly one static frame representative of idle; do not keep animating.
  setOrbState("idle");
}

// ---------- init ----------

applyMood(cfg.mood);
setOrbState("idle");
$("status").textContent = "tap to speak";
