"""POST /v1/elaya/chat — the Python brain's chat endpoint (SSE).

WIRE-COMPATIBLE with the Node route by contract: the exact frame vocabulary
elaya-stream.ts already parses — meta / delta / tool / done / error, each as
`data: {json}\n\n`. The eventual flip is a URL change in ONE transport file,
nothing else.

Orchestration mirrors the Node route + brain, in the same order:
  1. bearer auth (fail-closed) → 2. principal re-verified against profiles →
  3. daily cap (server-enforced, BEFORE the model and BEFORE persisting) →
  4. conversation resolve (supplied id must be OWNED — S-06; else the active
     24h session window) → 5. user message persisted (append-only) →
  6. confirmation RESOLVER pre-step (THE only path a state-change executes) →
  7. the specialist turn over persisted history → 8. assistant message
  persisted before the done frame ships.

Trust model (pilot): the caller is our own server or the eval harness,
authenticated by the shared bearer secret; it passes the USER ID it has
already session-verified, and the brain INDEPENDENTLY re-verifies that id
against public.profiles before any model runs (the Golden Rule).

Channels (2026-08-31): `channel` = "in_app" (default) | "whatsapp". The Node
WhatsApp gate (elaya-whatsapp.ts) owns identity-by-phone, voice transcription,
media handling and the reply send; it forwards the resolved TEXT here with the
Gupshup message id. This endpoint stamps `channel` on the conversation origin
and both message rows (the Node service's exact columns), threads it into the
persona block and the bridge's ledger rows, and answers 409 when the WhatsApp
dedup index rejects a redelivered id — so a BSP retry never runs a second turn.
"""

from __future__ import annotations

import asyncio
import json
import re
import traceback
from typing import AsyncIterator, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.brain import router as brain_router
from app.brain.loop import run_turn
from app.brain.principal import resolve_staff_principal
from app.brain.resolver import resolve_pending_action
from app.brain.specialists import SPECIALISTS
from app.config import settings
from app.core import elaya_store, supa
from app.core.elaya_store import DuplicateMessage

router = APIRouter(prefix="/v1/elaya")

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
# Control characters stripped like sanitizeText's floor; content length is
# already schema-bounded. (Full HTML sanitisation is a render-side concern —
# the chat UIs render plain text/ChatMarkdown, never innerHTML.)
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ChatRequest(BaseModel):
    user_id: str = Field(min_length=36, max_length=36)
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    # The surface the message arrived on — stamped on the rows, shapes the persona.
    channel: Literal["in_app", "whatsapp"] = "in_app"
    # WhatsApp only: the Gupshup message id — the dedup key (meta->>wa_message_id).
    wa_message_id: str | None = Field(default=None, min_length=1, max_length=128)


# ── What Elaya says when her own turn fails (never an internal string) ──────────
_FAILURE_LINES: dict[str, str] = {
    "model_limit": (
        "I cannot think right now: my AI account has reached its usage limit, so every question "
        "is being refused until the tech team raises it. Your message is saved. Please tell them."
    ),
    "model_busy": "My AI provider is overloaded at the moment. Please try again in a minute.",
    "model_timeout": "That took too long and I had to stop. Please try again, or ask a smaller piece of it.",
    "failed": (
        "Something went wrong on my side and I could not finish. Please try again in a moment; "
        "if it keeps happening, tell the tech team."
    ),
}


def classify_turn_failure(exc: BaseException) -> tuple[str, str]:
    """→ (code, the line she says). Read by shape from the provider's message, never surfaced raw."""
    msg = f"{type(exc).__name__}: {exc}".lower()
    if "usage limit" in msg or "credit balance" in msg or "billing" in msg or "regain access" in msg:
        code = "model_limit"
    elif "429" in msg or "rate limit" in msg or "overloaded" in msg or "529" in msg or "503" in msg:
        code = "model_busy"
    elif "timeout" in msg or "timed out" in msg:
        code = "model_timeout"
    else:
        code = "failed"
    return code, _FAILURE_LINES[code]


def _frame(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(body: ChatRequest, authorization: str = Header(default="")) -> StreamingResponse:
    if not settings.brain_api_secret or authorization != f"Bearer {settings.brain_api_secret}":
        raise HTTPException(status_code=401, detail="unauthorized")

    principal = await resolve_staff_principal(body.user_id)
    if principal is None:
        raise HTTPException(status_code=403, detail="unknown or inactive user")

    content = _CTRL_RE.sub("", body.message).strip()
    if not content:
        raise HTTPException(status_code=400, detail="empty message")

    # Daily cap — server-side, before the model and before persisting (the
    # Node route's exact order; count fails CLOSED).
    sent_today, cap = await asyncio.gather(
        elaya_store.count_user_messages_today(principal.user_id),
        supa.get_daily_message_cap(),
    )
    if sent_today >= cap:
        raise HTTPException(status_code=429, detail="daily cap reached")

    # Conversation: a supplied id must belong to the caller (S-06); otherwise
    # the active session window is resolved server-side.
    if body.conversation_id:
        if not _UUID_RE.match(body.conversation_id):
            raise HTTPException(status_code=400, detail="bad conversation id")
        conversation = await elaya_store.get_owned_conversation(
            body.conversation_id, principal.user_id
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="unknown conversation")
    else:
        expiry_hours = await supa.get_session_expiry_hours()
        conversation = await elaya_store.get_or_create_active_conversation(
            principal.user_id, expiry_hours, origin_channel=body.channel
        )
    conversation_id = conversation["id"]

    # WhatsApp carries the Gupshup id in meta so the partial UNIQUE dedup index
    # applies; a redelivery that raced the gate's pre-check lands here as 409.
    wa_meta = (
        {"wa_message_id": body.wa_message_id}
        if body.channel == "whatsapp" and body.wa_message_id
        else None
    )
    try:
        await elaya_store.insert_user_message(
            conversation_id, principal.user_id, content, channel=body.channel, meta=wa_meta
        )
    except DuplicateMessage:
        raise HTTPException(status_code=409, detail="duplicate message")
    remaining_today = max(0, cap - sent_today - 1)
    messages_today = sent_today + 1

    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def emit_delta(text: str) -> None:
        await queue.put(_frame({"type": "delta", "text": text}))

    async def emit_tool(name: str) -> None:
        await queue.put(_frame({"type": "tool", "name": name}))

    async def produce() -> None:
        try:
            await queue.put(
                _frame(
                    {
                        "type": "meta",
                        "conversationId": conversation_id,
                        "remainingToday": remaining_today,
                        # This message's ordinal today — the Node gate's learned-memory
                        # throttle reads it (the browser client ignores unknown keys).
                        "messagesToday": messages_today,
                    }
                )
            )

            history = await elaya_store.get_model_context_messages(conversation_id)

            # ── Confirmation resolver (E3) — BEFORE the model turn. A clear
            # affirmative on a live proposal executes it (through the bridge);
            # anything else dismisses and the message is handled fresh. ──
            resolver_line = await resolve_pending_action(principal, conversation_id, history)
            full_prefix = ""
            if resolver_line:
                full_prefix = resolver_line + "\n\n"
                await emit_delta(full_prefix)

            specialist_id, route_ms = await brain_router.route(content, getattr(principal, "role", None))
            result = await run_turn(
                principal,
                SPECIALISTS[specialist_id],
                history,
                emit_delta,
                emit_tool,
                conversation_id=conversation_id,
                channel=body.channel,
            )

            saved = await elaya_store.insert_assistant_message(
                conversation_id,
                (full_prefix + result.text).strip(),
                result.tool_calls,
                {
                    "brain": "python",
                    "specialist": result.specialist,
                    "routeMs": route_ms,
                    "usage": {"in": result.input_tokens, "out": result.output_tokens},
                },
                channel=body.channel,
            )
            await elaya_store.touch_conversation(conversation_id)

            await queue.put(
                _frame(
                    {
                        "type": "done",
                        "messageId": (saved or {}).get("id"),
                        "specialist": result.specialist,
                        "toolsUsed": result.tools_used,
                        "usage": {"in": result.input_tokens, "out": result.output_tokens},
                    }
                )
            )
        except Exception as exc:
            # The traceback goes to the service logs; the wire never carries an internal
            # string. But silence is worse than a reason (2026-09-18: the model account hit
            # its spend limit and every reply was a blank "something went wrong" for 12
            # hours): the failure is CLASSIFIED into a short, honest line, saved as her
            # reply so the transcript shows it, and delivered as a normal delta + done so
            # both channels speak it. The Node proxy still maps a transport-level failure.
            print(f"[chat] turn failed:\n{traceback.format_exc()}")
            code, line = classify_turn_failure(exc)
            try:
                await elaya_store.insert_assistant_message(
                    conversation_id, line, [], {"brain": "python", "turnError": code}, channel=body.channel
                )
            except Exception:
                print("[chat] could not save the failure reply")
            await emit_delta(line)
            await queue.put(_frame({"type": "done", "messageId": None, "specialist": None, "toolsUsed": [], "turnError": code}))
        finally:
            await queue.put(None)

    async def stream() -> AsyncIterator[str]:
        task = asyncio.create_task(produce())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        finally:
            task.cancel()

    return StreamingResponse(stream(), media_type="text/event-stream")
