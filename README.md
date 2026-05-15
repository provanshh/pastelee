# Telegram Clipboard Desktop App

A simple Windows-focused Electron app that pairs with a Telegram bot. Any text or image you send to the bot is copied directly to your laptop clipboard so you can paste immediately.

## What you get
- Telegram bot that accepts text/images
- Electron desktop app that writes to the Windows clipboard

## Prerequisites
- Node.js 18+
- A Telegram Bot Token from @BotFather

## Quick start (local)
### Start the desktop app (all-in-one)
The Electron app runs the Telegram bot in-process. You don't need to run any separate server or bot process.

Before launching, set your bot token in `electron/bot_config.json` or via the `BOT_TOKEN` environment variable.

```powershell
cd d:\antigravity-projects\activateai\electron
npm install
npm start
```

In the app, ask a user to send `/start` to your bot. The user will receive their Telegram id in the chat. Paste that id in "Target Telegram User ID" and click "Pair". Messages from that user will be copied to your clipboard.

## How to test
1. Open the Electron app.
2. Confirm the bot token is set in `electron/bot_config.json` or `BOT_TOKEN`.
3. Open Telegram and send `/start` to your bot.
4. Copy the Telegram user id the bot replies with.
5. Paste that id into `Target Telegram User ID` and click `Pair`.
6. Send a normal text message to the bot from that Telegram account.
7. Paste in Notepad to confirm the text was copied.
8. Send an image to the bot and paste it into an app that accepts images, such as Paint or Word.

## Publish a Windows build
To create a distributable installer locally:

```powershell
cd d:\antigravity-projects\activateai\electron
npm run dist
```

The installer will be written to `electron/dist/`.

If Windows blocks Electron Builder with a symbolic-link privilege error, publish through GitHub Actions instead.

## GitHub Actions build & publish
The installer build and release runs from `.github/workflows/build-windows.yml`.

To publish your first release:

```powershell
cd d:\antigravity-projects\activateai
git add .
git commit -m "release: v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

GitHub Actions will automatically build and publish the installer to a Release. Monitor the workflow at:
`https://github.com/provanshh/pastelee/actions`

Once complete, use this link on your landing page:

```html
<a href="https://github.com/provanshh/pastelee/releases/latest/download/PasteLee-Setup-x64.exe">
  Download for Windows
</a>
```

Style the link with your landing page CSS; the URL always points to the latest release.

## Notes
- The relay server is in-memory; restarting it will require re-pairing.
- The Electron app writes images directly to the clipboard.
- If you want to ship to other users, set the bot token before building the installer.
- The published app does not require users to run `npm start`; they install and launch the packaged `.exe`.
