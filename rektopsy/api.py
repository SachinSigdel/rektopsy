"""HTTP API: POST /autopsy { signature } -> the same JSON as the CLI.
POST /scam-check { text } -> red flags in a pasted message (rektopsy.scam).

Run: uv run uvicorn rektopsy.api:app --reload
Read-only, like the rest of Rektopsy: no wallet, no keys, no signing.
"""

import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import scam
from .fetch import SIGNATURE_RE, FetchError
from .pipeline import autopsy

WIDGET_JS = Path(__file__).resolve().parent.parent / "widget" / "rektopsy-widget.js"

@asynccontextmanager
async def lifespan(_app):
    # Download the phishing lists in the background so the first scam check isn't slow.
    threading.Thread(target=scam.blocklists, daemon=True).start()
    yield


app = FastAPI(title="Rektopsy", description="Explain why a Solana transaction failed.",
              lifespan=lifespan)

# The embeddable widget runs on other people's sites, so default to any origin.
# Nothing here uses cookies or credentials. Narrow with a comma-separated list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("REKTOPSY_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class AutopsyRequest(BaseModel):
    signature: str
    # False skips the LLM and returns template prose; the facts are identical.
    # Share cards use this: they only show deterministic fields.
    prose: bool = True


class ScamCheckRequest(BaseModel):
    text: str


MAX_SCAM_TEXT = 5000


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/widget.js", include_in_schema=False)
def widget() -> FileResponse:
    # Served from the API so the widget can default to calling the host it came from.
    return FileResponse(WIDGET_JS, media_type="text/javascript",
                        headers={"Cache-Control": "public, max-age=300"})


@app.post("/autopsy")
def post_autopsy(req: AutopsyRequest) -> dict:
    # Sync def: FastAPI runs it in a thread pool, so blocking RPC/LLM calls are fine.
    signature = req.signature.strip()
    if not SIGNATURE_RE.match(signature):
        raise HTTPException(400, "That doesn't look like a Solana transaction signature "
                                 "(86-88 base58 characters).")
    try:
        return autopsy(signature, use_llm=req.prose)
    except FetchError as e:
        raise HTTPException(502, f"Couldn't read the transaction from Solana: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Solana RPC request failed: {type(e).__name__}")


@app.post("/scam-check")
def post_scam_check(req: ScamCheckRequest) -> dict:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Paste a message or link to check.")
    if len(text) > MAX_SCAM_TEXT:
        raise HTTPException(400, f"That's too long to check (limit {MAX_SCAM_TEXT} characters).")
    return scam.check_message(text)
