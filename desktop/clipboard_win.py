import io
from typing import Optional

from PIL import Image

try:
    import win32clipboard
except Exception:  # pragma: no cover - optional dependency
    win32clipboard = None


def copy_image_bytes(image_bytes: bytes) -> bool:
    if win32clipboard is None:
        return False

    image = Image.open(io.BytesIO(image_bytes))
    if image.mode != "RGB":
        image = image.convert("RGB")

    output = io.BytesIO()
    image.save(output, "BMP")
    data = output.getvalue()[14:]

    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
    finally:
        win32clipboard.CloseClipboard()

    return True
