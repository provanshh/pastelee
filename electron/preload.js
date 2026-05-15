const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  setClipboard: (payload) => ipcRenderer.invoke("clipboard:set", payload),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  startBot: (targetUserId) => ipcRenderer.invoke("bot:start", targetUserId),
  stopBot: () => ipcRenderer.invoke("bot:stop"),
  onBotEvent: (cb) => ipcRenderer.on("bot:event", (ev, data) => cb(data)),
  getBotInfo: () => ipcRenderer.invoke("bot:info"),
});
