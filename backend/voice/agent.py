"""Elaya's voice worker — THE real-time voice door (2026-09-28, migration 0247).

One LiveKit agent, one job: put a phone call in front of the SAME brain every
other channel uses. The browser gets a room token from Serene's own server
(src/lib/services/elaya-voice-service.ts); that token asks LiveKit to dispatch
THIS worker into the room with the caller's verified profile id as the job
metadata. In the room:

  the caller's speech ─▶ STT (LiveKit Inference) ─▶ turn detector says "done"
     ─▶ ElayaBrainLLM: POST /v1/elaya/chat, channel "voice" (the SSE wire)
     ─▶ each delta ─▶ TTS (LiveKit Inference) ─▶ the caller hears her

What lives HERE is only the speech and the room. Identity, the daily cap, the
one active conversation, both message rows, the persona, the tools, the PII
gateway and the confirmation resolver are the brain's (backend/app) — a voice
turn is a typed turn that arrived by ear, exactly as a WhatsApp voice note is.
The transcript therefore shows up in /elaya afterwards without any code here
writing a row.

Trust: the job metadata is signed into the token by our server with the LiveKit
API secret, so the user_id in it is verified. The worker still checks that the
participant who joined IS that identity, and the brain re-verifies the id
against public.profiles before any model runs (the Golden Rule, twice).

"Speak while thinking": when the brain calls a tool before it has said a word
(a database look-up can take seconds), the stream speaks one short holding line
so the call never goes silent. Once per turn, never mid-sentence.

Runs from backend/copilot/voice (Fargate Backend Service, outbound only) or a
laptop: `python agent.py dev`. Settings by env — see backend/voice/README.md.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from typing import Any

import httpx
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    inference,
    llm,
    room_io,
)
from livekit.agents.llm import ChatChunk, ChatContext, ChoiceDelta, LLMStream
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

logger = logging.getLogger("elaya-voice")

# ── The vocabulary this worker shares with Node (src/lib/constants/elaya-voice.ts) ──
# The dispatch name the token names; change both together or no agent answers.
AGENT_NAME = "elaya-voice"
CHANNEL = "voice"

# ── Settings (env, never hardcoded) ─────────────────────────────────────────────
BRAIN_URL = os.environ.get("ELAYA_BRAIN_URL", "http://localhost:8321").rstrip("/")
BRAIN_SECRET = os.environ.get("BRAIN_API_SECRET", "")
# The models. LiveKit Inference strings (no provider key needed):
#   STT  deepgram/nova-3 with language "multi" hears English and Hindi mixed in one
#        sentence (Hinglish). deepgram/flux-general-en is the English-only turn-aware
#        model; if it is chosen, set VOICE_TURN_DETECTION=stt as well.
#   TTS  cartesia/sonic-3 is the fastest first word; the voice id picks the character.
STT_MODEL = os.environ.get("VOICE_STT_MODEL", "deepgram/nova-3")
STT_LANGUAGE = os.environ.get("VOICE_STT_LANGUAGE", "multi")
TTS_MODEL = os.environ.get("VOICE_TTS_MODEL", "cartesia/sonic-3")
TTS_VOICE = os.environ.get("VOICE_TTS_VOICE", "")
TTS_LANGUAGE = os.environ.get("VOICE_TTS_LANGUAGE", "en")
# "livekit" = LiveKit's own audio turn detector (14 languages incl. Hindi, free on
# LiveKit Cloud); "stt" = let a turn-aware STT (Flux) decide.
TURN_DETECTION = os.environ.get("VOICE_TURN_DETECTION", "livekit")
# A whole call is bounded, so a forgotten tab cannot bill for hours.
MAX_CALL_SECONDS = int(os.environ.get("VOICE_MAX_CALL_SECONDS", "1200"))
# One brain turn (model + tool round-trips). The chat route's own budget is 180s.
BRAIN_TURN_TIMEOUT_SECONDS = float(os.environ.get("VOICE_BRAIN_TIMEOUT_SECONDS", "120"))
# A holding line goes out only when the brain has been silent this long and is
# calling tools; quick answers never hear it.
FILLER_AFTER_SECONDS = float(os.environ.get("VOICE_FILLER_AFTER_SECONDS", "1.2"))

GREETING = "Hi, this is Elaya. What can I do for you?"
GOODBYE_TIME_UP = "We have been talking a while, so I will let you go. Message me any time."
FILLER_LINES = (
    "One moment, let me check.",
    "Let me look that up.",
    "Give me a second.",
)
# What she says when the brain refuses or falls over; the brain's own failure
# lines (its usage limit, overload) already arrive as normal text, so these cover
# only the transport.
LINE_CAP = "You have reached today's message limit with me. It resets at midnight. Let's talk tomorrow."
LINE_UNAVAILABLE = "I could not reach my brain just now. Please try again in a moment."
LINE_UNAUTHORIZED = "I cannot take this call from your account. Please tell the tech team."

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
# The brain strips control characters itself; the wire limit is its schema's 4,000.
_MAX_MESSAGE_CHARS = 4000


def _uuid_ok(value: object) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value))


# ── The brain as an LLM ──────────────────────────────────────────────────────────
#
# AgentSession wants an llm.LLM (with none it skips generation entirely), so the
# brain IS one: chat() opens ONE turn on /v1/elaya/chat and the stream turns the
# SSE deltas into ChatChunks. The session's chat_ctx is only ever read for the
# newest user sentence; the brain holds the real history (its persisted rows),
# and the conversation id from its meta frame keeps every turn of a call on one
# conversation.


class ElayaBrainLLM(llm.LLM):
    def __init__(self, *, user_id: str) -> None:
        super().__init__()
        self._user_id = user_id
        self.conversation_id: str | None = None
        self._client = httpx.AsyncClient(
            base_url=BRAIN_URL,
            headers={
                "Authorization": f"Bearer {BRAIN_SECRET}",
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(BRAIN_TURN_TIMEOUT_SECONDS, connect=10.0),
        )

    @property
    def model(self) -> str:
        return "elaya-brain"

    @property
    def provider(self) -> str:
        return "serene"

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: Any = None,
        tool_choice: Any = None,
        extra_kwargs: Any = None,
    ) -> LLMStream:
        return _BrainTurnStream(self, chat_ctx=chat_ctx, tools=tools or [], conn_options=conn_options)

    async def aclose(self) -> None:
        await self._client.aclose()


def _latest_user_text(chat_ctx: ChatContext) -> str:
    """The newest user sentence in the session's context; '' when there is none."""
    for item in reversed(chat_ctx.items):
        if isinstance(item, llm.ChatMessage) and item.role == "user":
            text = (item.text_content or "").strip()
            return text[:_MAX_MESSAGE_CHARS]
    return ""


class _BrainTurnStream(LLMStream):
    def __init__(self, brain: ElayaBrainLLM, *, chat_ctx: ChatContext, tools: list[llm.Tool], conn_options: APIConnectOptions) -> None:
        super().__init__(brain, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)
        self._brain = brain
        # A transport failure must speak a line, not retry the whole turn (the
        # brain has already persisted the user's message by then).
        self._retry_on_chunk_sent = False

    def _say(self, text: str, chunk_id: str) -> None:
        self._event_ch.send_nowait(ChatChunk(id=chunk_id, delta=ChoiceDelta(role="assistant", content=text)))

    async def _run(self) -> None:
        text = _latest_user_text(self._chat_ctx)
        chunk_id = str(uuid.uuid4())
        if not text:
            return

        body = {
            "user_id": self._brain._user_id,
            "message": text,
            "channel": CHANNEL,
            "conversation_id": self._brain.conversation_id,
        }
        started = time.monotonic()
        spoke = False
        filler_sent = False
        tools_seen = 0
        try:
            async with self._brain._client.stream("POST", "/v1/elaya/chat", json=body) as res:
                if res.status_code != 200:
                    if res.status_code == 429:
                        line = LINE_CAP
                    elif res.status_code in (401, 403):
                        line = LINE_UNAUTHORIZED
                    else:
                        line = LINE_UNAVAILABLE
                    logger.warning("brain refused the turn", extra={"status": res.status_code})
                    self._say(line, chunk_id)
                    return

                async for raw in res.aiter_lines():
                    if not raw.startswith("data:"):
                        continue
                    try:
                        frame = json.loads(raw[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    kind = frame.get("type")
                    if kind == "meta":
                        cid = frame.get("conversationId")
                        if _uuid_ok(cid):
                            self._brain.conversation_id = cid
                    elif kind == "tool":
                        tools_seen += 1
                        # Speak while thinking: the brain went to a tool before saying
                        # anything and the silence is already noticeable.
                        if not spoke and not filler_sent and time.monotonic() - started >= FILLER_AFTER_SECONDS:
                            self._say(FILLER_LINES[tools_seen % len(FILLER_LINES)] + " ", chunk_id)
                            filler_sent = True
                    elif kind == "delta":
                        piece = frame.get("text")
                        if isinstance(piece, str) and piece:
                            spoke = True
                            self._say(piece, chunk_id)
                    elif kind == "error":
                        logger.error("brain turn error frame", extra={"message": frame.get("message")})
                        if not spoke:
                            self._say(LINE_UNAVAILABLE, chunk_id)
                        return
                    elif kind == "done":
                        return
        except httpx.HTTPError as e:
            logger.error("brain transport failed: %s: %s", type(e).__name__, e)
            if not spoke:
                self._say(LINE_UNAVAILABLE, chunk_id)


# ── The agent ───────────────────────────────────────────────────────────────────


class ElayaVoice(Agent):
    def __init__(self) -> None:
        # The brain owns the prompt; these instructions never reach a model.
        super().__init__(instructions="Elaya, spoken. The brain decides every word.")


def _turn_detection() -> Any:
    if TURN_DETECTION == "stt":
        return "stt"
    return inference.TurnDetector()


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def elaya_voice(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    # The caller's identity comes from the token our server signed, never from
    # anything said in the room.
    try:
        meta = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    user_id = meta.get("user_id")
    if not _uuid_ok(user_id):
        logger.error("no verified user_id in the job metadata; leaving the room")
        ctx.shutdown(reason="no user id")
        return
    if not BRAIN_SECRET:
        logger.error("BRAIN_API_SECRET is not set; the brain would refuse every turn")
        ctx.shutdown(reason="unconfigured")
        return

    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    participant = await ctx.wait_for_participant(identity=user_id)
    logger.info("call started", extra={"user_id": user_id, "identity": participant.identity})

    brain = ElayaBrainLLM(user_id=user_id)
    session = AgentSession(
        stt=inference.STT(model=STT_MODEL, language=STT_LANGUAGE),
        llm=brain,
        tts=inference.TTS(model=TTS_MODEL, voice=TTS_VOICE or None, language=TTS_LANGUAGE),
        turn_handling=TurnHandlingOptions(turn_detection=_turn_detection()),
    )

    async def hang_up_when_time_is_up() -> None:
        await asyncio.sleep(MAX_CALL_SECONDS)
        logger.info("call reached its time limit", extra={"user_id": user_id})
        try:
            await session.say(GOODBYE_TIME_UP, allow_interruptions=False)
        finally:
            session.shutdown(drain=True)

    timer = asyncio.create_task(hang_up_when_time_is_up())

    async def on_shutdown() -> None:
        timer.cancel()
        await brain.aclose()

    ctx.add_shutdown_callback(on_shutdown)

    await session.start(
        agent=ElayaVoice(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            # Only the caller's own audio is heard; the room can hold nobody else.
            participant_identity=user_id,
            close_on_disconnect=True,
        ),
    )

    # A fixed greeting, no model call: the first word is instant and free.
    await session.say(GREETING, allow_interruptions=True)


if __name__ == "__main__":
    agents.cli.run_app(server)
