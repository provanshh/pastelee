// Minimal renderer: enter Target Telegram User ID and start the bot.

const pairButton = document.getElementById("pairButton");
const targetIdInput = document.getElementById("targetId");
const pairingGuideEl = document.getElementById("pairingGuide");
const statusEl = document.getElementById("status");
const lastEl = document.getElementById("last");
const appEl = document.querySelector(".app");
const statusIndicatorEl = document.getElementById("statusIndicator");
const statusTextEl = document.getElementById("statusText");
const confettiLayerEl = document.getElementById("confettiLayer");

let isConnecting = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function setLast(text) {
  lastEl.textContent = text;
}

function setLiveState(state, text) {
  statusIndicatorEl.classList.remove("offline", "connecting", "online", "error");
  statusIndicatorEl.classList.add(state);
  statusTextEl.textContent = text;
}

function triggerPairSuccessEffects() {
  appEl.classList.remove("pair-success");
  // force reflow so class animation can replay
  void appEl.offsetWidth;
  appEl.classList.add("pair-success");
  launchConfetti();
}

function launchConfetti() {
  const colors = ["rgba(255,255,255,0.9)", "rgba(125,211,252,0.9)", "rgba(52,211,153,0.9)", "rgba(255,255,255,0.7)"];
  const count = 24;
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const left = Math.floor(Math.random() * 100);
    const duration = 900 + Math.floor(Math.random() * 500);
    const xShift = Math.floor(Math.random() * 120) - 60;
    const spin = (Math.floor(Math.random() * 3) + 1) * (Math.random() < 0.5 ? 180 : -180);
    const color = colors[Math.floor(Math.random() * colors.length)];

    piece.style.left = `${left}vw`;
    piece.style.background = color;
    piece.style.setProperty("--fall-duration", `${duration}ms`);
    piece.style.setProperty("--x-shift", `${xShift}px`);
    piece.style.setProperty("--spin", `${spin}deg`);
    piece.style.transform = `translateY(${Math.floor(Math.random() * 18) - 12}px)`;
    piece.style.width = `${6 + Math.floor(Math.random() * 4)}px`;
    piece.style.height = `${8 + Math.floor(Math.random() * 5)}px`;
    piece.style.opacity = `${0.58 + Math.random() * 0.25}`;

    confettiLayerEl.appendChild(piece);
    setTimeout(() => piece.remove(), duration + 160);
  }
}

// Check if input is a valid Telegram user ID (numeric, exactly 10 digits)
function isValidTelegramId(id) {
  return /^\d{10}$/.test(id.trim());
}

// Auto-connect when a valid ID is entered
targetIdInput.addEventListener("input", async () => {
  const id = targetIdInput.value.trim();
  if (isValidTelegramId(id) && !isConnecting) {
    isConnecting = true;
    targetIdInput.disabled = true;
    setStatus("Connecting...");
    setLiveState("connecting", "Connecting...");
    const resp = await window.api.startBot(id);
    targetIdInput.disabled = false;
    isConnecting = false;
    if (resp && resp.ok) {
      setStatus(`Connected as @${resp.username || "?"}`);
      setLiveState("online", "Connected");
      triggerPairSuccessEffects();
    } else {
      setStatus(`Connection failed: ${resp && resp.error}`);
      setLiveState("error", "Error");
    }
  }
});

// no relay/polling; bot runs in main process

async function handleMessage(message) {
  if (message.type === "text") {
    await window.api.setClipboard({ type: "text", text: message.text || "" });
    setLast(`Text copied: ${(message.text || "").slice(0, 80)}`);
    return;
  }
  if (message.type === "image") {
    const ok = await window.api.setClipboard({ type: "image", imageBase64: message.image_b64 });
    setLast(ok ? "Image copied" : "Image failed");
  }
}

function stopPolling() {}

// replace pairing UI with bot start/stop UI
pairButton.addEventListener("click", async () => {
  targetIdInput.focus();
  pairingGuideEl.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("openBot").addEventListener("click", async () => {
  const info = await window.api.getBotInfo();
  if (info && info.username) {
    const url = `https://t.me/${encodeURIComponent(info.username)}`;
    const ok = await window.api.openExternal(url);
    setStatus(ok ? "Opened bot chat" : "Failed to open");
  } else {
    setStatus("Bot username not configured");
  }
});

document.getElementById("clearPair").addEventListener("click", async () => {
  await window.api.stopBot();
  setStatus("Not running");
  setLiveState("offline", "Stopped");
  setLast("Stopped");
});

const historyEl = document.getElementById("history");
const history = [];

function pushHistory(text) {
  history.unshift({ text, at: new Date().toLocaleString() });
  if (history.length > 50) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) return (historyEl.textContent = "No messages yet");
  historyEl.innerHTML = "";
  for (const item of history) {
    const div = document.createElement("div");
    div.className = "history-item";
    div.textContent = `${item.at} — ${item.text}`;
    historyEl.appendChild(div);
  }
}

// update handleMessage to push into history
const _origHandleMessage = handleMessage;
async function handleMessage(message) {
  await _origHandleMessage(message);
  if (message.type === "text") pushHistory(message.text || "");
  else if (message.type === "image") pushHistory("[image] " + (message.filename || ""));
}

// subscribe to bot events from main
window.api.onBotEvent((ev) => {
  if (!ev) return;
  if (ev.type === "status") {
    setStatus(ev.message);
    const msg = String(ev.message || "").toLowerCase();
    if (msg.includes("connected") || msg.includes("running")) {
      setLiveState("online", "Live");
    } else if (msg.includes("connecting")) {
      setLiveState("connecting", "Connecting...");
    } else if (msg.includes("stopped") || msg.includes("not")) {
      setLiveState("offline", "Offline");
    }
  }
  else if (ev.type === "text") {
    // main already copied to clipboard; reflect in history
    pushHistory(ev.text || "");
    setLast("Text copied from bot");
  } else if (ev.type === "image") {
    pushHistory("[image] " + (ev.filename || ""));
    setLast("Image copied from bot");
  } else if (ev.type === "error") {
    setLiveState("error", "Error");
    setLast("Error: " + (ev.message || ""));
  }
});

setLiveState("offline", "Offline");
