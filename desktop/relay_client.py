import json
import threading
import time
from typing import Callable

import requests


class RelayClient:
    def __init__(self, relay_url: str) -> None:
        self.relay_url = relay_url.rstrip("/")
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start_polling(
        self,
        client_id: str,
        client_token: str,
        on_message: Callable[[dict], None],
        on_error: Callable[[str], None],
        interval_seconds: float = 1.0,
    ) -> None:
        if self._thread and self._thread.is_alive():
            return

        def loop() -> None:
            while not self._stop_event.is_set():
                try:
                    resp = requests.get(
                        f"{self.relay_url}/pull",
                        params={"client_id": client_id, "client_token": client_token},
                        timeout=5,
                    )
                    if resp.status_code == 200:
                        payload = resp.json()
                        for message in payload.get("messages", []):
                            on_message(message)
                    elif resp.status_code == 401:
                        on_error("Unauthorized. Please re-pair.")
                        break
                    else:
                        on_error(f"Relay error: {resp.status_code}")
                except Exception as exc:
                    on_error(f"Relay error: {exc}")

                time.sleep(interval_seconds)

        self._stop_event.clear()
        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
