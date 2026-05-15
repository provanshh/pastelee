import base64
import json
import os
import tempfile
import tkinter as tk
from tkinter import messagebox

import pyperclip
import requests

from clipboard_win import copy_image_bytes
from relay_client import RelayClient

DEFAULT_RELAY_URL = "http://127.0.0.1:8000"
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Telegram Clipboard")
        self.root.geometry("420x260")
        self.root.resizable(False, False)

        self.relay_client = RelayClient(DEFAULT_RELAY_URL)
        self.client_id: str | None = None
        self.client_token: str | None = None

        self._build_ui()
        self._load_config()

    def _build_ui(self) -> None:
        tk.Label(self.root, text="Relay URL:").pack(anchor="w", padx=12, pady=(12, 0))
        self.relay_url_var = tk.StringVar(value=DEFAULT_RELAY_URL)
        tk.Entry(self.root, textvariable=self.relay_url_var, width=48).pack(
            padx=12, pady=4
        )

        tk.Label(self.root, text="Pairing code:").pack(anchor="w", padx=12, pady=(12, 0))
        self.pair_code_var = tk.StringVar()
        tk.Entry(self.root, textvariable=self.pair_code_var, width=20).pack(
            padx=12, pady=4
        )

        self.pair_button = tk.Button(self.root, text="Pair", command=self.pair)
        self.pair_button.pack(pady=6)

        self.status_var = tk.StringVar(value="Not paired")
        tk.Label(self.root, textvariable=self.status_var).pack(pady=8)

        self.last_var = tk.StringVar(value="No messages yet")
        tk.Label(self.root, textvariable=self.last_var, wraplength=380).pack(pady=8)

    def _load_config(self) -> None:
        if not os.path.exists(CONFIG_PATH):
            return
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            self.relay_url_var.set(data.get("relay_url", DEFAULT_RELAY_URL))
            self.client_id = data.get("client_id")
            self.client_token = data.get("client_token")
            if self.client_id and self.client_token:
                self._start_polling()
                self.status_var.set("Paired")
        except Exception:
            self.status_var.set("Config load failed")

    def _save_config(self) -> None:
        data = {
            "relay_url": self.relay_url_var.get().strip(),
            "client_id": self.client_id,
            "client_token": self.client_token,
        }
        with open(CONFIG_PATH, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)

    def pair(self) -> None:
        pair_code = self.pair_code_var.get().strip()
        if not pair_code:
            messagebox.showwarning("Pair", "Enter a pairing code.")
            return

        relay_url = self.relay_url_var.get().strip().rstrip("/")
        try:
            resp = requests.post(
                f"{relay_url}/pair/claim",
                json={"pair_code": pair_code, "client_name": os.environ.get("COMPUTERNAME", "desktop")},
                timeout=5,
            )
            resp.raise_for_status()
        except Exception as exc:
            messagebox.showerror("Pair", f"Pairing failed: {exc}")
            return

        payload = resp.json()
        self.client_id = payload["client_id"]
        self.client_token = payload["client_token"]
        self._save_config()
        self._start_polling()
        self.status_var.set("Paired")
        self.last_var.set("Paired. Waiting for messages...")

    def _start_polling(self) -> None:
        relay_url = self.relay_url_var.get().strip().rstrip("/")
        self.relay_client = RelayClient(relay_url)
        self.relay_client.start_polling(
            self.client_id,
            self.client_token,
            self._handle_message,
            self._handle_error,
        )

    def _handle_message(self, message: dict) -> None:
        msg_type = message.get("type")
        if msg_type == "text":
            text = message.get("text", "")
            pyperclip.copy(text)
            self._set_status(f"Text copied: {text[:80]}")
        elif msg_type == "image":
            image_b64 = message.get("image_b64")
            if not image_b64:
                self._set_status("Image payload missing")
                return

            image_bytes = base64.b64decode(image_b64)
            copied = copy_image_bytes(image_bytes)
            if copied:
                self._set_status("Image copied to clipboard")
            else:
                temp_path = self._write_temp_image(message, image_bytes)
                pyperclip.copy(temp_path)
                self._set_status("Image saved; file path copied")
        else:
            self._set_status("Unsupported message type")

    def _write_temp_image(self, message: dict, image_bytes: bytes) -> str:
        filename = message.get("filename", "image")
        suffix = os.path.splitext(filename)[1] or ".img"
        handle, path = tempfile.mkstemp(suffix=suffix)
        os.close(handle)
        with open(path, "wb") as out:
            out.write(image_bytes)
        return path

    def _handle_error(self, text: str) -> None:
        self._set_status(text)

    def _set_status(self, text: str) -> None:
        self.last_var.set(text)


if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()
