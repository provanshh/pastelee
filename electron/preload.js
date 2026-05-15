const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  setClipboard: (payload) => ipcRenderer.invoke("clipboard:set", payload),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  startBot: (token, targetUserId) => ipcRenderer.invoke("bot:start", token, targetUserId),
  stopBot: () => ipcRenderer.invoke("bot:stop"),
  onBotEvent: (cb) => ipcRenderer.on("bot:event", (ev, data) => cb(data)),
});
