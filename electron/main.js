const { app, BrowserWindow, ipcMain, clipboard, nativeImage, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

let mainWindow;

// Prevent multiple Electron app processes from polling the same bot token.
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

// The app is intentionally minimal: no on-disk config.
// UI will supply relay URL and pairing code; client credentials are kept in-memory.

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 620,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  // start bot automatically after renderer loads, if token configured
  mainWindow.webContents.once("did-finish-load", async () => {
    const res = await startBotInstance(null);
    if (!res || !res.ok) {
      mainWindow.webContents.send("bot:event", { type: "status", message: res && res.error ? String(res.error) : "Bot not started" });
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("config:save", (event, config) => saveConfig(config));
ipcMain.handle("clipboard:set", (event, payload) => {
  if (!payload || !payload.type) return false;
  if (payload.type === "text") {
    clipboard.writeText(payload.text || "");
    return true;
  }
  if (payload.type === "image" && payload.imageBase64) {
    const buffer = Buffer.from(payload.imageBase64, "base64");
    const image = nativeImage.fromBuffer(buffer);
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
    return true;
  }
  return false;
});

ipcMain.handle("open:external", async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    return false;
  }
});

let botInstance = null;
let botTargetId = null;
let isStartingBot = false;

async function stopBotInstance({ notifyUser = false, reasonMessage = null } = {}) {
  if (!botInstance) return;
  if (notifyUser && botTargetId && reasonMessage) {
    try {
      await botInstance.sendMessage(botTargetId, reasonMessage);
    } catch (e) {}
  }
  try {
    await botInstance.stopPolling();
  } catch (e) {}
  botInstance = null;
  botTargetId = null;
}

async function startBotInstance(targetUserId) {
  const token = CONFIG.bot_token;
  if (!token) return { ok: false, error: "Bot token not configured. Add bot_config.json or set BOT_TOKEN env." };
  if (isStartingBot) return { ok: false, error: "Bot is already starting. Please wait." };
  isStartingBot = true;
  try {
    // If there's an existing instance, notify previous paired user then stop it
    if (botInstance) {
      await stopBotInstance({
        notifyUser: true,
        reasonMessage: "Desktop app disconnected (restarting)",
      });
    }

    botInstance = new TelegramBot(token, { polling: true });
    botTargetId = targetUserId ? Number(targetUserId) : null;

    botInstance.on("polling_error", (err) => {
      const message = String((err && err.message) || err || "");
      // 409 means another process is polling with same token.
      if (message.includes("409 Conflict")) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("bot:event", {
            type: "error",
            message: "Bot conflict: another app/process is using this bot token. Close other instances and retry.",
          });
        }
      }
    });

    // Set up command menu
    try {
      await botInstance.setMyCommands([
        { command: "start", description: "Get your user ID" },
        { command: "help", description: "Learn how to use this bot" },
        { command: "about", description: "About this bot and its purpose" },
        { command: "stop", description: "Stop pairing with desktop app" },
      ]);
    } catch (e) {
      // ignore
    }

    botInstance.onText(/\/start/i, (msg) => {
      const chatId = msg.chat.id;
      try { botInstance.sendMessage(chatId, `Your id is: ${chatId}`); } catch (e) {}
    });

    botInstance.onText(/\/help/i, (msg) => {
      const chatId = msg.chat.id;
      const helpText = `📖 *How to Use*\n\n1. Send /start to get your user ID\n2. Copy your ID\n3. Open the desktop app\n4. Click "Pair"\n5. Paste your ID in the desktop app\n6. Send messages here — they'll be copied to your clipboard!`;
      try { botInstance.sendMessage(chatId, helpText, { parse_mode: "Markdown" }); } catch (e) {}
    });

    botInstance.onText(/\/about/i, (msg) => {
      const chatId = msg.chat.id;
      const aboutText = `ℹ️ *About*\n\nThis bot syncs Telegram messages to your desktop clipboard. Simply pair your ID and any message you send will be instantly copied to your clipboard—no more manual copy-paste!`;
      try { botInstance.sendMessage(chatId, aboutText, { parse_mode: "Markdown" }); } catch (e) {}
    });

    botInstance.onText(/\/stop/i, async (msg) => {
      const chatId = msg.chat.id;
      if (botTargetId && Number(chatId) === Number(botTargetId)) {
        botTargetId = null;
        try { await botInstance.sendMessage(chatId, "⛔ Pairing stopped. Desktop will no longer copy your messages until you pair again."); } catch (e) {}
        mainWindow.webContents.send("bot:event", { type: "status", message: "Pairing stopped from Telegram" });
      } else {
        try { await botInstance.sendMessage(chatId, "No active pairing found for this account."); } catch (e) {}
      }
    });

    botInstance.on("message", async (msg) => {
      try {
        const fromId = msg.from && msg.from.id;
        if (botTargetId && fromId !== botTargetId) return;

        if (msg.text) {
          // copy any text including commands
          clipboard.writeText(msg.text);
          mainWindow.webContents.send("bot:event", { type: "text", text: msg.text });
        } else if (msg.photo && msg.photo.length) {
          const photo = msg.photo[msg.photo.length - 1];
          const fileLink = await botInstance.getFileLink(photo.file_id);
          const resp = await axios.get(fileLink, { responseType: "arraybuffer" });
          const buffer = Buffer.from(resp.data);
          const image = nativeImage.createFromBuffer(buffer);
          if (!image.isEmpty()) clipboard.writeImage(image);
          mainWindow.webContents.send("bot:event", { type: "image", filename: "photo.jpg" });
        } else if (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith("image/")) {
          const fileLink = await botInstance.getFileLink(msg.document.file_id);
          const resp = await axios.get(fileLink, { responseType: "arraybuffer" });
          const buffer = Buffer.from(resp.data);
          const image = nativeImage.createFromBuffer(buffer);
          if (!image.isEmpty()) clipboard.writeImage(image);
          mainWindow.webContents.send("bot:event", { type: "image", filename: msg.document.file_name });
        }
      } catch (err) {
        mainWindow.webContents.send("bot:event", { type: "error", message: String(err) });
      }
    });

    const me = await botInstance.getMe();
    // notify renderer
    mainWindow.webContents.send("bot:event", { type: "status", message: `Bot running as @${me.username}` });
    // If a target user id was provided, notify that user that desktop is connected
    if (botTargetId) {
      try {
        await botInstance.sendMessage(botTargetId, "✅ Desktop app connected — messages you send here will be copied to the desktop's clipboard. Directly paste the message anywhere. ");
      } catch (e) {
        // ignore send errors
      }
    }
    return { ok: true, username: me.username };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    isStartingBot = false;
  }
}

// Load bot configuration from file (bot_config.json) or environment
const CONFIG_PATH = path.join(__dirname, "bot_config.json");
let CONFIG = { bot_token: process.env.BOT_TOKEN || null, bot_username: process.env.BOT_USERNAME || null };
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    CONFIG.bot_token = CONFIG.bot_token || parsed.bot_token || null;
    CONFIG.bot_username = CONFIG.bot_username || parsed.bot_username || null;
  }
} catch (e) {
  // ignore
}

ipcMain.handle("bot:info", () => ({ username: CONFIG.bot_username || null }));

ipcMain.handle("bot:start", async (event, targetUserId) => {
  return await startBotInstance(targetUserId);
});

ipcMain.handle("bot:stop", async () => {
  try {
    if (botInstance) {
      await stopBotInstance({
        notifyUser: true,
        reasonMessage: "❌ Desktop app disconnected — no longer copying messages.",
      });
      mainWindow.webContents.send("bot:event", { type: "status", message: "Bot stopped" });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
