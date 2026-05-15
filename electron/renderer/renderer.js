// Minimal renderer: enter relay URL and pairing code, click Pair, then automatically poll.

let clientId = null;
let clientToken = null;
let pollingTimer = null;

const relayUrlInput = document.getElementById("relayUrl");
const pairCodeInput = document.getElementById("pairCode");
const pairButton = document.getElementById("pairButton");
const statusEl = document.getElementById("status");
const lastEl = document.getElementById("last");

function setStatus(text) {
  statusEl.textContent = text;
}

function setLast(text) {
  lastEl.textContent = text;
}

function getRelayUrl() {
  return relayUrlInput.value.trim().replace(/\/$/, "") || "http://127.0.0.1:8000";
}

async function pair() {
  const code = pairCodeInput.value.trim();
  if (!code) return setStatus("Enter pairing code");

  setStatus("Pairing...");
  try {
    const resp = await fetch(`${getRelayUrl()}/pair/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_code: code, client_name: "desktop" }),
    });
    if (!resp.ok) return setStatus("Pair failed");
    const data = await resp.json();
    clientId = data.client_id;
    clientToken = data.client_token;
    setStatus("Paired");
    setLast("Waiting for messages...");
    startPolling();
  } catch (err) {
    setStatus("Relay error");
  }
}

async function pullMessages() {
  if (!clientId || !clientToken) return;
  try {
    const resp = await fetch(
      `${getRelayUrl()}/pull?client_id=${encodeURIComponent(clientId)}&client_token=${encodeURIComponent(clientToken)}`
    );
    if (!resp.ok) {
      setStatus("Unauthorized - re-pair");
      stopPolling();
      return;
    }
    const data = await resp.json();
    for (const m of data.messages || []) await handleMessage(m);
  } catch (err) {
    setStatus("Relay offline");
  }
}

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

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(pullMessages, 1000);
}

function stopPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
}

// replace pairing UI with bot start/stop UI
pairButton.addEventListener("click", async () => {
  const token = document.getElementById("botToken").value.trim();
  const target = document.getElementById("targetId").value.trim();
  if (!token) return setStatus("Enter bot token");
  setStatus("Starting bot...");
  const resp = await window.api.startBot(token, target || null);
  if (resp && resp.ok) {
    setStatus(`Bot running as @${resp.username || "?"}`);
  } else {
    setStatus(`Bot start failed: ${resp && resp.error}`);
  }
});

document.getElementById("openBot").addEventListener("click", async () => {
  const token = document.getElementById("botToken").value.trim();
  if (!token) return setStatus("Enter bot token to open chat");
  // try to extract username by calling the bot via startBot with no target but we don't want to start polling twice
  // instead ask user to open t.me with bot token not possible; prompt them to open t.me manually
  setStatus("Open Telegram and search for your bot to start a conversation.");
});

document.getElementById("clearPair").addEventListener("click", async () => {
  await window.api.stopBot();
  setStatus("Not running");
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
  if (ev.type === "status") setStatus(ev.message);
  else if (ev.type === "text") {
    // main already copied to clipboard; reflect in history
    pushHistory(ev.text || "");
    setLast("Text copied from bot");
  } else if (ev.type === "image") {
    pushHistory("[image] " + (ev.filename || ""));
    setLast("Image copied from bot");
  } else if (ev.type === "error") {
    setLast("Error: " + (ev.message || ""));
  }
});
