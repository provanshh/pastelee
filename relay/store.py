import secrets
import time
from dataclasses import dataclass


@dataclass
class PairCode:
    telegram_user_id: int
    expires_at: float


@dataclass
class ClientInfo:
    telegram_user_id: int
    client_token: str
    client_name: str
    last_seen: float


class RelayStore:
    def __init__(self) -> None:
        self._pair_codes: dict[str, PairCode] = {}
        self._clients: dict[str, ClientInfo] = {}
        self._queues: dict[str, list[dict]] = {}

    def create_pair_code(self, telegram_user_id: int, ttl_seconds: int = 300) -> str:
        code = f"{secrets.randbelow(1000000):06d}"
        self._pair_codes[code] = PairCode(
            telegram_user_id=telegram_user_id,
            expires_at=time.time() + ttl_seconds,
        )
        return code

    def claim_pair_code(self, code: str, client_name: str) -> tuple[str, str, int] | None:
        pair = self._pair_codes.get(code)
        if not pair or pair.expires_at < time.time():
            return None

        client_id = secrets.token_urlsafe(12)
        client_token = secrets.token_urlsafe(24)
        self._clients[client_id] = ClientInfo(
            telegram_user_id=pair.telegram_user_id,
            client_token=client_token,
            client_name=client_name,
            last_seen=time.time(),
        )
        self._queues.setdefault(client_id, [])
        del self._pair_codes[code]
        return client_id, client_token, pair.telegram_user_id

    def push_message(self, telegram_user_id: int, message: dict) -> int:
        delivered = 0
        for client_id, info in self._clients.items():
            if info.telegram_user_id != telegram_user_id:
                continue
            self._queues.setdefault(client_id, []).append(message)
            delivered += 1
        return delivered

    def pull_messages(self, client_id: str, client_token: str) -> list[dict] | None:
        info = self._clients.get(client_id)
        if not info or info.client_token != client_token:
            return None

        info.last_seen = time.time()
        queue = self._queues.get(client_id, [])
        self._queues[client_id] = []
        return queue
