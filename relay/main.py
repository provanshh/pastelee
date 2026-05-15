from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from store import RelayStore

app = FastAPI(title="Telegram Clipboard Relay")
store = RelayStore()


class PairCreateRequest(BaseModel):
    telegram_user_id: int


class PairClaimRequest(BaseModel):
    pair_code: str
    client_name: str = "desktop"


class PushRequest(BaseModel):
    telegram_user_id: int
    message: dict


class PullResponse(BaseModel):
    messages: list[dict]


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/pair/create")
async def pair_create(req: PairCreateRequest) -> dict:
    code = store.create_pair_code(req.telegram_user_id)
    return {"pair_code": code, "expires_in": 300}


@app.post("/pair/claim")
async def pair_claim(req: PairClaimRequest) -> dict:
    result = store.claim_pair_code(req.pair_code, req.client_name)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    client_id, client_token, telegram_user_id = result
    return {
        "client_id": client_id,
        "client_token": client_token,
        "telegram_user_id": telegram_user_id,
    }


@app.post("/push")
async def push(req: PushRequest) -> dict:
    delivered = store.push_message(req.telegram_user_id, req.message)
    return {"delivered": delivered}


@app.get("/pull")
async def pull(client_id: str, client_token: str) -> PullResponse:
    messages = store.pull_messages(client_id, client_token)
    if messages is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return PullResponse(messages=messages)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
