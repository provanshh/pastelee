import asyncio
import base64
import datetime as dt
import io
import os

import httpx
from aiogram import Bot, Dispatcher, F
from aiogram.enums import ParseMode
from aiogram.types import Message

RELAY_URL = os.environ.get("RELAY_URL", "http://127.0.0.1:8000")
BOT_TOKEN = os.environ.get("BOT_TOKEN")

if not BOT_TOKEN:
    raise SystemExit("BOT_TOKEN is required")


def _utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


async def create_pair_code(client: httpx.AsyncClient, user_id: int) -> str:
    url = f"{RELAY_URL}/pair/create"
    resp = await client.post(url, json={"telegram_user_id": user_id})
    resp.raise_for_status()
    return resp.json()["pair_code"]


async def push_text(client: httpx.AsyncClient, user_id: int, text: str) -> None:
    url = f"{RELAY_URL}/push"
    payload = {
        "telegram_user_id": user_id,
        "message": {
            "type": "text",
            "text": text,
            "sent_at": _utc_now(),
        },
    }
    resp = await client.post(url, json=payload)
    resp.raise_for_status()


async def push_image(
    client: httpx.AsyncClient,
    user_id: int,
    image_bytes: bytes,
    mime: str,
    filename: str,
    caption: str | None,
) -> None:
    url = f"{RELAY_URL}/push"
    payload = {
        "telegram_user_id": user_id,
        "message": {
            "type": "image",
            "image_b64": base64.b64encode(image_bytes).decode("ascii"),
            "mime": mime,
            "filename": filename,
            "caption": caption,
            "sent_at": _utc_now(),
        },
    }
    resp = await client.post(url, json=payload)
    resp.raise_for_status()


async def handle_start(message: Message, client: httpx.AsyncClient) -> None:
    code = await create_pair_code(client, message.from_user.id)
    await message.answer(
        "Send this pairing code to your desktop app:\n"
        f"<b>{code}</b>",
        parse_mode=ParseMode.HTML,
    )


async def handle_text(message: Message, client: httpx.AsyncClient) -> None:
    await push_text(client, message.from_user.id, message.text)
    await message.answer("Copied to your desktop clipboard.")


async def handle_photo(message: Message, client: httpx.AsyncClient) -> None:
    photo = message.photo[-1]
    file = await message.bot.get_file(photo.file_id)
    buffer = io.BytesIO()
    await message.bot.download_file(file.file_path, destination=buffer)
    image_bytes = buffer.getvalue()
    await push_image(
        client,
        message.from_user.id,
        image_bytes,
        "image/jpeg",
        "photo.jpg",
        message.caption,
    )
    await message.answer("Image sent to your desktop clipboard.")


async def handle_document(message: Message, client: httpx.AsyncClient) -> None:
    doc = message.document
    if not doc or not doc.mime_type or not doc.mime_type.startswith("image/"):
        await message.answer("Only images are supported for documents.")
        return

    file = await message.bot.get_file(doc.file_id)
    buffer = io.BytesIO()
    await message.bot.download_file(file.file_path, destination=buffer)
    image_bytes = buffer.getvalue()
    await push_image(
        client,
        message.from_user.id,
        image_bytes,
        doc.mime_type,
        doc.file_name or "image",
        message.caption,
    )
    await message.answer("Image sent to your desktop clipboard.")


async def main() -> None:
    bot = Bot(BOT_TOKEN)
    dispatcher = Dispatcher()

    async with httpx.AsyncClient(timeout=10) as client:
        dispatcher.message.register(lambda m: handle_start(m, client), F.text == "/start")
        dispatcher.message.register(lambda m: handle_start(m, client), F.text == "/pair")
        dispatcher.message.register(lambda m: handle_text(m, client), F.text)
        dispatcher.message.register(lambda m: handle_photo(m, client), F.photo)
        dispatcher.message.register(lambda m: handle_document(m, client), F.document)

        await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
