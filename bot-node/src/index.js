const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const RELAY_URL = (process.env.RELAY_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required");
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

async function createPairCode(userId) {
  const resp = await axios.post(`${RELAY_URL}/pair/create`, {
    telegram_user_id: userId,
  });
  return resp.data.pair_code;
}

async function pushText(userId, text) {
  await axios.post(`${RELAY_URL}/push`, {
    telegram_user_id: userId,
    message: {
      type: "text",
      text,
      sent_at: new Date().toISOString(),
    },
  });
}

async function pushImage(userId, imageBytes, mime, filename, caption) {
  await axios.post(`${RELAY_URL}/push`, {
    telegram_user_id: userId,
    message: {
      type: "image",
      image_b64: Buffer.from(imageBytes).toString("base64"),
      mime,
      filename,
      caption: caption || null,
      sent_at: new Date().toISOString(),
    },
  });
}

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  const resp = await axios.get(url, { responseType: "arraybuffer" });
  return resp.data;
}

bot.setMyCommands([
  { command: "start", description: "Get a pairing code" },
  { command: "pair", description: "Get a new pairing code" },
  { command: "help", description: "How to use the bot" },
]);

const keyboard = {
  reply_markup: {
    keyboard: [["Pair"], ["Help"]],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

async function handlePair(msg) {
  const code = await createPairCode(msg.from.id);
  await bot.sendMessage(
    msg.chat.id,
    `Your pairing code is: ${code}\nPaste it into the desktop app.`,
    keyboard
  );
}

bot.onText(/^\/(start|pair)$/i, async (msg) => {
  try {
    await handlePair(msg);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Failed to create pairing code.");
  }
});

bot.onText(/^\/(help)$/i, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    "Send /start to get a pairing code. Paste it in the desktop app. Then send any text or image here to copy it to your clipboard.",
    keyboard
  );
});

bot.on("message", async (msg) => {
  const text = msg.text || "";
  if (text === "Pair") {
    await handlePair(msg);
    return;
  }
  if (text === "Help") {
    await bot.sendMessage(
      msg.chat.id,
      "Send /start to get a pairing code. Paste it in the desktop app. Then send any text or image here to copy it to your clipboard.",
      keyboard
    );
    return;
  }

  if (msg.photo && msg.photo.length > 0) {
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const imageBytes = await downloadFile(photo.file_id);
      await pushImage(msg.from.id, imageBytes, "image/jpeg", "photo.jpg", msg.caption);
      await bot.sendMessage(msg.chat.id, "Image copied to desktop clipboard.");
    } catch (err) {
      await bot.sendMessage(msg.chat.id, "Failed to send image to desktop.");
    }
    return;
  }

  if (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith("image/")) {
    try {
      const imageBytes = await downloadFile(msg.document.file_id);
      await pushImage(
        msg.from.id,
        imageBytes,
        msg.document.mime_type,
        msg.document.file_name || "image",
        msg.caption
      );
      await bot.sendMessage(msg.chat.id, "Image copied to desktop clipboard.");
    } catch (err) {
      await bot.sendMessage(msg.chat.id, "Failed to send image to desktop.");
    }
    return;
  }

  if (msg.text && !msg.text.startsWith("/")) {
    try {
      await pushText(msg.from.id, msg.text);
      await bot.sendMessage(msg.chat.id, "Text copied to desktop clipboard.");
    } catch (err) {
      await bot.sendMessage(msg.chat.id, "Failed to send text to desktop.");
    }
  }
});

console.log("Bot is running...");
