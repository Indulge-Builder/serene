"""POST /v1/elaya/chat — the Python brain's chat endpoint (SSE).

WIRE-COMPATIBLE with the Node route by contract: the exact frame vocabulary
elaya-stream.ts already parses — meta / delta / tool / done / error, each as
`data: {json}\\n\\n`. The eventual flip is a URL change in ONE transport file,
nothing else.

Orchestration mirrors the Node route + brain, in the same order:
  1. bearer auth (fail-closed) → 2. principal re-verified against profiles →
  3. daily cap (server-enforced, BEFORE the model and BEFORE persisting) and the
     day's spend ceiling (0254, when a founder set one) →
  4. conversation resolve (supplied id must be OWNED — S-06; else the active
     24h session window) → 5. user message persisted (append-only) →
  6. the conversation LEASE: turns on one conversation run one at a time, so a
     second message sent while the first is being answered waits and then
     sees the first answer in its history instead of re-reading the world →
  7. confirmation RESOLVER pre-step (THE only path a state-change executes) →
  8. the specialist turn over persisted history, with the evidence of the last
     turns folded in → 9. assistant message persisted before the done frame
     ships, with what the turn cost and which prompt and policy it ran.

Trust model (pilot): the caller is our own server or the eval harness,
authenticated by the shared bearer secret; it passes the USER ID it has
already session-verified, and the brain INDEPENDENTLY re-verifies that id
against public.profiles before any model runs (the Golden Rule).

Channels (2026-08-31): `channel` = "in_app" (default) | "whatsapp" | "voice"
(2026-09-28: the voice worker, backend/voice/agent.py, owns the LiveKit room and
the speech both ways and forwards the finished sentence here). The Node
WhatsApp gate (elaya-whatsapp.ts) owns identity-by-phone, voice transcription,
media handling and the reply send; it forwards the resolved TEXT here with the
Gupshup message id. This endpoint stamps `channel` on the conversation origin
and both message rows (the Node service's exact columns), threads it into the
persona block and the bridge's ledger rows, and answers 409 when the WhatsApp
dedup index rejects a redelivered id — so a BSP retry never runs a second turn.
`turn_key` (0254) is the same idempotency for any channel: the voice worker
stamps one per utterance, so a transport retry never runs a second turn.
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
from app.brain.behaviour import BEHAVIOUR_VERSION, PROMPT_VERSION
from app.brain.loop import run_turn
from app.brain.principal import resolve_staff_principal
from app.brain.resolver import resolve_pending_action
from app.brain.specialists import SPECIALISTS
from app.config import settings
from app.core import elaya_store, supa
from app.core.elaya_store import DuplicateMessage
from app.llm.pricing import cost_usd_for

router = APIRouter(prefix="/v1/elaya")

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
# Control characters stripped like sanitizeText's floor; content length is
# already schema-bounded. (Full HTML sanitisation is a render-side concern —
# the chat UIs render plain text/ChatMarkdown, never innerHTML.)
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Evidence carried between turns (mirrors src/lib/constants/elaya-cost.ts).
EVIDENCE_TURNS_BACK = 4
EVIDENCE_BLOCK_BUDGET_CHARS = 1_800

# The conversation lease (one turn at a time per conversation). In-process: the api service
# runs one task today (backend/copilot/api/manifest.yml count: 1); a second replica would need
# a database lease, which is the next step if the count ever grows.
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(conversation_id: str) -> asyncio.Lock:
    lock = _locks.get(conversation_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[conversation_id] = lock
    return lock


def _release_lock(conversation_id: str) -> None:
    """Bound the table, never evict a lock a waiter may still be about to take: a lock is only
    dropped when the table has grown large and nobody holds it."""
    if len(_locks) < 2000:
        return
    for cid, lock in list(_locks.items()):
        if not lock.locked() and cid != conversation_id:
            _locks.pop(cid, None)


class ChatRequest(BaseModel):
    user_id: str = Field(min_length=36, max_length=36)
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    # The surface the message arrived on — stamped on the rows, shapes the persona.
    # "voice" (0247): the LiveKit worker (backend/voice) sends each finished sentence
    # here; the persona gets the spoken-style block and the rows carry the channel.
    channel: Literal["in_app", "whatsapp", "voice"] = "in_app"
    # WhatsApp only: the Gupshup message id — the dedup key (meta->>wa_message_id).
    wa_message_id: str | None = Field(default=None, min_length=1, max_length=128)
    # WhatsApp only: the message was a voice note, transcribed by the gate (kept in meta as a mark).
    voice: bool = False
    # Any channel (0254): the caller's own id for this turn; a retry with the same key is a 409.
    turn_key: str | None = Field(default=None, min_length=8, max_length=128)


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


def evidence_block_from(history: list[dict]) -> str:
    """The compact evidence of the last assistant rows (meta.evidence, written below), newest
    first, cut at the budget: '- tool(args) → summary'. '' when there is none."""
    lines: list[str] = []
    used = 0
    seen = 0
    for row in reversed(history):
        if row.get("role") != "assistant":
            continue
        seen += 1
        if seen > EVIDENCE_TURNS_BACK:
            break
        meta = row.get("meta") or {}
        for e in (meta.get("evidence") or []) if isinstance(meta, dict) else []:
            if not isinstance(e, dict):
                continue
            line = f"- {e.get('tool')}({e.get('args', '')}) → {e.get('summary', '')}"
            if used + len(line) + 1 > EVIDENCE_BLOCK_BUDGET_CHARS:
                return "\n".join(lines)
            lines.append(line)
            used += len(line) + 1
    return "\n".join(lines)


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
    sent_today, cap, cap_usd = await asyncio.gather(
        elaya_store.count_user_messages_today(principal.user_id),
        supa.get_daily_message_cap(),
        supa.get_chat_daily_cap_usd(),
    )
    if sent_today >= cap:
        raise HTTPException(status_code=429, detail="daily cap reached")
    # The day's spend ceiling (0254), when a founder set one. A failed spend read never
    # locks the team out: the ledger is the record, not the gate's only witness.
    if cap_usd is not None:
        spent = await supa.get_chat_spend_today_usd()
        if spent is not None and spent >= cap_usd:
            print(f"[chat] daily spend cap reached: ${spent:.2f} of ${cap_usd:.2f}")
            raise HTTPException(status_code=429, detail="daily spend cap reached")

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
    # Any channel may carry a turn_key for the same reason (0254).
    meta: dict = {}
    if body.channel == "whatsapp" and body.wa_message_id:
        meta["wa_message_id"] = body.wa_message_id
        if body.voice:
            meta["voice"] = True
    if body.turn_key:
        meta["turn_key"] = body.turn_key
    try:
        await elaya_store.insert_user_message(
            conversation_id, principal.user_id, content, channel=body.channel, meta=meta or None
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
        lock = _lock_for(conversation_id)
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

            async with lock:
                history = await elaya_store.get_model_context_messages(conversation_id)

                # ── Confirmation resolver (E3) — BEFORE the model turn. A clear
                # affirmative on a live proposal executes it (through the bridge);
                # anything else dismisses and the message is handled fresh. ──
                resolver_line = await resolve_pending_action(principal, conversation_id, history)
                full_prefix = ""
                if resolver_line:
                    full_prefix = resolver_line + "\n\n"
                    await emit_delta(full_prefix)

                playbooks, tiers = await asyncio.gather(supa.get_active_playbooks(), supa.get_specialist_tiers())
                specialist_id, route_ms, playbook = await brain_router.route(
                    content, getattr(principal, "role", None), history, playbooks,
                    usage_ctx={"channel": body.channel, "user_id": principal.user_id, "conversation_id": conversation_id},
                )
                playbook_ref = {"id": playbook["id"], "title": playbook.get("title", "")} if playbook else None
                # A playbook is a METHOD that may need any tool (Freshdesk + the member groups + SQL in
                # one answer). A narrow specialist cannot run it; the analyst (founders) and general (the
                # full toolset) can. Never let a playbook land on a specialist missing half its tools.
                if playbook and specialist_id not in ("analyst", "general"):
                    specialist_id = "general"
                result = await run_turn(
                    principal,
                    SPECIALISTS[specialist_id],
                    history,
                    emit_delta,
                    emit_tool,
                    conversation_id=conversation_id,
                    channel=body.channel,
                    playbook=playbook,
                    evidence=evidence_block_from(history),
                    job_override=tiers.get(specialist_id),
                )

                cost = cost_usd_for(
                    result.model,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                    cache_read_tokens=result.cache_read_tokens,
                    cache_write_tokens=result.cache_write_tokens,
                )
                usage = {
                    "in": result.input_tokens,
                    "out": result.output_tokens,
                    "cache_read": result.cache_read_tokens,
                    "cache_write": result.cache_write_tokens,
                    "calls": result.calls,
                    "model": result.model,
                    "job": result.job,
                    "cost_usd": cost,
                }
                saved = await elaya_store.insert_assistant_message(
                    conversation_id,
                    (full_prefix + result.text).strip(),
                    result.tool_calls,
                    {
                        "brain": "python",
                        "specialist": result.specialist,
                        "playbook": playbook_ref,
                        "routeMs": route_ms,
                        "usage": usage,
                        "stop": result.stop,
                        "duplicateReads": result.duplicate_reads,
                        "promptVersion": PROMPT_VERSION,
                        "behaviourVersion": BEHAVIOUR_VERSION,
                        "evidence": result.evidence,
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
                        "playbook": playbook_ref,
                        "toolsUsed": result.tools_used,
                        "usage": usage,
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
            _release_lock(conversation_id)
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
