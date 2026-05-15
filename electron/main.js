const { app, BrowserWindow, ipcMain, clipboard, nativeImage, shell } = require("electron");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

let mainWindow;

// The app is intentionally minimal: no on-disk config.
// UI will supply relay URL and pairing code; client credentials are kept in-memory.

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

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

ipcMain.handle("bot:start", async (event, token, targetUserId) => {
  if (!token) return { ok: false, error: "token required" };
  try {
    if (botInstance) {
      // stop previous
      try { botInstance.stopPolling(); } catch (e) {}
      botInstance = null;
    }

    botInstance = new TelegramBot(token, { polling: true });
    botTargetId = targetUserId ? Number(targetUserId) : null;

    botInstance.onText(/\/start/i, (msg) => {
      const chatId = msg.chat.id;
      // reply with the user's id
      botInstance.sendMessage(chatId, `Your id is: ${chatId}`);
    });

    botInstance.on("message", async (msg) => {
      try {
        const fromId = msg.from && msg.from.id;
        // if a target is set, only accept messages from that user
        if (botTargetId && fromId !== botTargetId) return;

        if (msg.text && !msg.text.startsWith("/")) {
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
    mainWindow.webContents.send("bot:event", { type: "status", message: `Bot running as @${me.username}` });
    return { ok: true, username: me.username };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("bot:stop", async () => {
  try {
    if (botInstance) {
      await botInstance.stopPolling();
      botInstance = null;
      botTargetId = null;
      mainWindow.webContents.send("bot:event", { type: "status", message: "Bot stopped" });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
