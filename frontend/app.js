const $ = (id) => document.getElementById(id);

const MOOD_COLORS = {
  calm: "#4bb8ff",
  happy: "#f5b83d",
  energetic: "#e0559f",
  empathetic: "#f07a7a",
  professional: "#9db4d6",
  flirty: "#e02d55",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ws = null;
let audioCtx = null;
let micStream = null;
let procNode = null;
let micSampleRate = 48000;
let cfg = { mood: "auto", pitch: null, bass: null, rate: null };
const AUTO_SWATCH = "conic-gradient(#4bb8ff, #f5b83d, #e0559f, #f07a7a, #9db4d6, #4bb8ff)";
let playSr = 22050;

// Orb / visual state
let orbState = "idle"; // idle | listening | thinking | speaking
let micAnalyser = null;
let micLevelData = null;
let playAnalyser = null;
let playLevelData = null;
let activePlaySources = 0;
let isListening = false;

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
  } else if (m.type === "mood") {
    showDetectedMood(m.mood);
  } else if (m.type === "error") {
    addMsg("⚠ " + m.content, "ai");
  } else if (m.type === "status") {
    // While the user is actively holding the mic, our local "listening" state wins.
    if (isListening) return;
    // Enforce turn-taking client-side: block the mic while the AI is busy.
    $("mic").disabled = (m.state === "thinking" || m.state === "speaking");
    // "speaking"/"idle" are driven by actual audio playback (see playPcm) so the
    // orb stays in sync with the voice; here we only handle thinking + the label.
    if (m.state === "thinking") {
      $("status").textContent = "thinking" + (m.detail ? " – " + m.detail : "");
      setOrbState("thinking");
    } else if (m.state === "idle" && activePlaySources === 0) {
      $("status").textContent = "tap the orb to speak";
      setOrbState("idle");
    }
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
  $("mood-swatch").style.background = mood === "auto" ? AUTO_SWATCH : (MOOD_COLORS[mood] || MOOD_COLORS.calm);
  $("mood-list").querySelectorAll("li").forEach((li) => {
    li.setAttribute("aria-selected", li.dataset.mood === mood ? "true" : "false");
  });
}

// Auto mode: show which mood the AI detected this turn, without leaving Auto.
function showDetectedMood(moodId) {
  if (cfg.mood !== "auto") return;
  const color = MOOD_COLORS[moodId] || MOOD_COLORS.calm;
  document.documentElement.style.setProperty("--aura", color);
  $("mood-swatch").style.background = color;
  $("mood-label").textContent = "Auto · " + moodId.charAt(0).toUpperCase() + moodId.slice(1);
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

// ---------- mic: tap to start/stop listening ----------

async function startMic() {
  if (isListening) return;
  if (!ws || ws.readyState !== 1) {
    $("status").textContent = "connect first (open settings ⚙)";
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    $("status").textContent = "mic blocked — allow microphone access";
    return;
  }
  const ctx = (audioCtx ||= new AudioContext());
  if (ctx.state === "suspended") await ctx.resume();
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

  // Immediate local feedback — don't wait for a backend status message.
  isListening = true;
  setOrbState("listening");
  $("mic").classList.add("recording");
  $("status").textContent = "listening… tap again to send";
}

function stopMic() {
  if (!isListening) return;
  if (procNode) { procNode.disconnect(); procNode.onaudioprocess = null; procNode = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (micAnalyser) { micAnalyser.disconnect(); micAnalyser = null; }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "audio_end", sample_rate: micSampleRate }));
  isListening = false;
  setOrbState("idle");
  $("mic").classList.remove("recording");
  $("status").textContent = "sent — waiting for reply…";
}

function toggleMic() {
  if (isListening) stopMic();
  else startMic();
}

$("mic").addEventListener("click", toggleMic);
$("orb").addEventListener("click", toggleMic);

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
  // Drive the "speaking" animation from ACTUAL playback, not the status message,
  // so the orb pulses exactly while the voice is audible (they were out of sync
  // because audio arrives over the tunnel after the status message).
  if (!isListening) setOrbState("speaking");
  $("status").textContent = "speaking";
  src.onended = () => {
    activePlaySources = Math.max(0, activePlaySources - 1);
    if (activePlaySources === 0 && !isListening) {
      setOrbState("idle");
      $("status").textContent = "tap the orb to speak";
    }
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

  // Audio levels ADD intensity on top of a guaranteed base motion, so each
  // state is clearly animated even if the analyser reads near-zero.
  const mLevel = listening ? Math.min(1, micLevel() * 6) : 0;
  const pLevel = speaking ? Math.min(1, playLevel() * 6) : 0;
  // Time-based base oscillators (always moving while in an active state).
  // Reduced motion keeps a calmer, lower-amplitude version rather than freezing.
  const amp = reduceMotion ? 0.35 : 1;
  const t = frame * 0.05;
  const listenBase = 0.35 + 0.35 * amp * (0.5 + 0.5 * Math.sin(t)); // gentle breathing
  const speakBase = 0.45 + 0.55 * amp * Math.abs(Math.sin(t * 1.6)); // livelier pulse
  const listenLevel = listening ? Math.max(listenBase, mLevel) : 0;
  const speakLevel = speaking ? Math.max(speakBase, pLevel) : 0;

  const aura = currentAura();

  for (const s of stars) {
    let angle = s.angle;
    let alpha = s.baseAlpha;
    let size = s.size;

    if (thinking) {
      // Swirling galaxy: rotation grows with radius (always visible, time-driven).
      angle += frame * 0.01 * (0.4 + s.radius / 120);
    }
    if (listening) {
      alpha = s.baseAlpha * (0.5 + listenLevel * 0.9);
      size = s.size * (1 + listenLevel * 0.6);
    }
    if (speaking) {
      alpha = s.baseAlpha * (0.6 + speakLevel * 1.2);
      size = s.size * (1 + speakLevel * 1.1);
      angle += Math.sin(frame * 0.05 + s.radius) * speakLevel * 0.05;
    }
    alpha *= 0.75 + 0.25 * Math.sin(frame * 0.03 + s.twinkle);

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
  if (listening) {
    const glow = 45 + listenLevel * 55;
    const scale = 1 + listenLevel * 0.03;
    orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 ${glow}px -6px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
    orb.style.transform = `scale(${scale.toFixed(4)})`;
  } else if (speaking) {
    const scale = 1 + speakLevel * 0.07;
    const glow = 55 + speakLevel * 85;
    orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 ${glow}px -4px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
    orb.style.transform = `scale(${scale.toFixed(4)})`;
  } else if (thinking) {
    const glow = 50 + 20 * (0.5 + 0.5 * Math.sin(t * 0.8));
    orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 ${glow.toFixed(1)}px -8px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
    orb.style.transform = "scale(1)";
  } else {
    orb.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 30px -10px ${aura}, 0 30px 80px -30px rgba(0,0,0,0.9)`;
    orb.style.transform = "scale(1)";
  }

  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);

// ---------- demo mode (?demo=1): preview orb states without a backend ----------
// Injects a synthetic audio level so listening/speaking visibly react, and adds a
// small state cycler. Has no effect unless the page is opened with ?demo=1.
if (new URLSearchParams(location.search).has("demo")) {
  let demoLevel = 0;
  const origMic = micLevel, origPlay = playLevel;
  window.micLevel = () => (orbState === "listening" ? demoLevel : origMic());
  window.playLevel = () => (orbState === "speaking" ? demoLevel : origPlay());
  micLevel = window.micLevel;
  playLevel = window.playLevel;
  setInterval(() => {
    demoLevel = 0.08 + Math.abs(Math.sin(Date.now() / 260)) * 0.12
      + Math.random() * 0.03;
  }, 60);

  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;display:flex;gap:6px;" +
    "background:rgba(20,26,40,.85);border:1px solid rgba(255,255,255,.15);border-radius:20px;" +
    "padding:6px 8px;backdrop-filter:blur(8px);font:11px system-ui;color:#cfd6e6";
  const demoTag = document.createElement("span");
  demoTag.textContent = "DEMO";
  demoTag.style.cssText = "align-self:center;letter-spacing:1px;color:#8892a6;padding:0 4px";
  bar.appendChild(demoTag);
  ["idle", "listening", "thinking", "speaking"].forEach((st) => {
    const b = document.createElement("button");
    b.textContent = st;
    b.style.cssText =
      "cursor:pointer;border:1px solid rgba(255,255,255,.15);background:transparent;color:#cfd6e6;" +
      "border-radius:14px;padding:5px 12px;font:11px system-ui;text-transform:lowercase";
    b.onclick = () => {
      setOrbState(st);
      $("status").textContent = st === "idle" ? "tap to speak" : st;
      $("reply").textContent =
        st === "speaking" ? "This is a demo of the speaking animation." : "";
    };
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
}

// ---------- init ----------

applyMood(cfg.mood);
setOrbState("idle");
$("status").textContent = "tap the orb to speak";
