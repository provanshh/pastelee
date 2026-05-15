# Telegram Clipboard Desktop App

A simple Windows-focused Electron app that pairs with a Telegram bot. Any text or image you send to the bot is copied directly to your laptop clipboard so you can paste immediately.

## What you get
- Telegram bot that accepts text/images
- Relay server that connects the bot to desktop clients
- Electron desktop app that writes to the Windows clipboard

## Prerequisites
- Node.js 18+
- A Telegram Bot Token from @BotFather

## Quick start (local)
Open three terminals.

### Start the desktop app (all-in-one)
The Electron app now runs the Telegram bot in-process. You don't need to run any separate server or bot process.

```powershell
cd d:\antigravity-projects\activateai\electron
npm install
npm start
```

In the app: paste your bot token into "Bot Token" and ask a user to send `/start` to your bot. The user will receive their Telegram id in the chat. Paste that id in "Target Telegram User ID" and click "Pair" (Start Bot). Messages from that user will be copied to your clipboard.

## Pairing flow
1. Open the desktop app.
2. Send /start to your Telegram bot.
3. The bot will reply with a pairing code.
4. Paste that code into the desktop app and click Pair.
5. Now send any text or image to the bot and paste it locally.

## Notes
- The relay server is in-memory; restarting it will require re-pairing.
- The Electron app writes images directly to the clipboard.

## Optional: remote access
To use this across the internet, host the relay server on a public URL (HTTPS). Set `RELAY_URL` in the bot and desktop app to that address.

## Legacy (Python)
If you still want the Python version, it is located in the `bot`, `relay`, and `desktop` folders.
