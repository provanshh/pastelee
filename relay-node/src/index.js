const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

const store = {
  pairCodes: new Map(),
  clients: new Map(),
  queues: new Map(),
};

function createPairCode(telegramUserId, ttlSeconds = 300) {
  const code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  store.pairCodes.set(code, {
    telegramUserId,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return code;
}

function claimPairCode(code, clientName) {
  const entry = store.pairCodes.get(code);
  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }
  const clientId = crypto.randomBytes(9).toString("base64url");
  const clientToken = crypto.randomBytes(18).toString("base64url");
  store.clients.set(clientId, {
    telegramUserId: entry.telegramUserId,
    clientToken,
    clientName,
    lastSeen: Date.now(),
  });
  if (!store.queues.has(clientId)) {
    store.queues.set(clientId, []);
  }
  store.pairCodes.delete(code);
  return { clientId, clientToken, telegramUserId: entry.telegramUserId };
}

function pushMessage(telegramUserId, message) {
  let delivered = 0;
  for (const [clientId, info] of store.clients.entries()) {
    if (info.telegramUserId !== telegramUserId) continue;
    if (!store.queues.has(clientId)) {
      store.queues.set(clientId, []);
    }
    store.queues.get(clientId).push(message);
    delivered += 1;
  }
  return delivered;
}

function pullMessages(clientId, clientToken) {
  const info = store.clients.get(clientId);
  if (!info || info.clientToken !== clientToken) {
    return null;
  }
  info.lastSeen = Date.now();
  const messages = store.queues.get(clientId) || [];
  store.queues.set(clientId, []);
  return messages;
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/pair/create", (req, res) => {
  const telegramUserId = Number(req.body.telegram_user_id);
  if (!telegramUserId) {
    res.status(400).json({ error: "telegram_user_id required" });
    return;
  }
  const code = createPairCode(telegramUserId);
  res.json({ pair_code: code, expires_in: 300 });
});

app.post("/pair/claim", (req, res) => {
  const pairCode = String(req.body.pair_code || "").trim();
  const clientName = String(req.body.client_name || "desktop").slice(0, 64);
  const result = claimPairCode(pairCode, clientName);
  if (!result) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  res.json({
    client_id: result.clientId,
    client_token: result.clientToken,
    telegram_user_id: result.telegramUserId,
  });
});

app.post("/push", (req, res) => {
  const telegramUserId = Number(req.body.telegram_user_id);
  const message = req.body.message;
  if (!telegramUserId || !message) {
    res.status(400).json({ error: "telegram_user_id and message required" });
    return;
  }
  const delivered = pushMessage(telegramUserId, message);
  res.json({ delivered });
});

app.get("/pull", (req, res) => {
  const clientId = String(req.query.client_id || "");
  const clientToken = String(req.query.client_token || "");
  const messages = pullMessages(clientId, clientToken);
  if (!messages) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ messages });
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Relay listening on http://127.0.0.1:${port}`);
});
