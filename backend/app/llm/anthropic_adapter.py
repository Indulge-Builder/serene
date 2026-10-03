"""The Anthropic adapter — THE ONLY module allowed to import the anthropic SDK
(the same law as lib/elaya/adapters/anthropic.ts). Streams internally, emits
prose deltas through on_text_delta, resolves the normalized CompleteResult.

Prompt caching (the shape since 2026-10-02): with cache_prefix=True the request
carries up to four breakpoints, the provider's maximum, in render order:
  1. the last tool definition that loads up front (tools are rendered first);
  2. the SHARED system block (req.system): identical for every user of a role
     and specialist, so it is read from the cache across users;
  3. the PER-USER system block (req.system_user), when the caller sends one:
     read from the cache across the calls of one turn;
  4. the last block of the last user turn: the same-turn incremental pattern.
     Call 1 of a turn writes the history and the question, call 2 reads them and
     writes only the new tool results, call n reads n-1 of the transcript. The
     provider looks back from the newest breakpoint for the earlier entries, so
     moving it forward each call is exactly what the pattern wants.
The volatile tail (req.system_tail, the time anchor) rides after the system
breakpoints, uncached. Correctness is identical with or without caching; only
the bill and the latency change.

Tool search (2026-09-24): a ToolDefinition with defer_loading=True is sent in the
tools array but stays OUT of the model's context until the model finds it through
the provider's server-side tool search tool (added when req.tool_search is set).
The API excludes deferred tools from the cached prefix, so the breakpoint sits on
the last NON-deferred tool (a deferred tool may not carry cache_control). The
assistant's content blocks come back verbatim in CompleteResult.raw_content and
are replayed untouched from ChatMessage.raw_blocks: the search-result blocks are
what keep a discovered tool loaded on the next iteration, and thinking blocks
carry a signature the API checks.

Effort (2026-10-02): req.effort is sent as output_config.effort to a model that
takes it (never Haiku). No extended-thinking configuration here on purpose: the
Claude 5 family thinks adaptively by default and effort is the one control.

Usage: every counter the provider bills separately comes back on the result
(uncached input, cache writes with their 1 h share, cache reads, output), with the
model that answered, the request id and the wall-clock, for the usage ledger.
"""

from __future__ import annotations

import time
from typing import Any

from anthropic import AsyncAnthropic

from app.config import settings
from app.llm.provider import (
    ChatMessage,
    CompleteRequest,
    CompleteResult,
    StopReason,
    ToolCall,
)

_client: AsyncAnthropic | None = None


def _sdk() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _to_anthropic_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Normalize provider-neutral turns into Anthropic's content-block shape.
    Consecutive tool results collapse into one user turn (API requirement)."""
    out: list[dict[str, Any]] = []
    for m in messages:
        if m.role == "user":
            out.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            if m.raw_blocks:
                # Same-turn replay: the provider's own blocks, unchanged.
                out.append({"role": "assistant", "content": m.raw_blocks})
                continue
            blocks: list[dict[str, Any]] = []
            if m.content:
                blocks.append({"type": "text", "text": m.content})
            for tc in m.tool_calls:
                blocks.append(
                    {"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.input}
                )
            out.append({"role": "assistant", "content": blocks or [{"type": "text", "text": ""}]})
        else:  # tool result
            block = {
                "type": "tool_result",
                "tool_use_id": m.tool_call_id,
                "content": m.content,
            }
            if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list):
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
    return out


def _mark_last_user_block(messages: list[dict[str, Any]]) -> None:
    """The same-turn breakpoint: on the last block of the last user turn (a plain string
    becomes one text block). Nothing happens when the transcript does not end on a user
    turn, which the provider would refuse anyway."""
    if not messages or messages[-1].get("role") != "user":
        return
    last = messages[-1]
    content = last.get("content")
    if isinstance(content, str):
        last["content"] = [{"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}]
    elif isinstance(content, list) and content:
        content[-1]["cache_control"] = {"type": "ephemeral"}


def _map_stop(reason: str | None) -> StopReason:
    if reason in ("end_turn", "stop_sequence"):
        return "end_turn"
    if reason == "tool_use":
        return "tool_use"
    if reason == "max_tokens":
        return "max_tokens"
    if reason == "refusal":
        return "refusal"
    return "other"


TOOL_SEARCH_TOOL: dict[str, Any] = {"type": "tool_search_tool_bm25_20251119", "name": "tool_search_tool_bm25"}


async def complete(req: CompleteRequest) -> CompleteResult:
    tools: list[dict[str, Any]] = []
    for t in req.tools:
        d: dict[str, Any] = {"name": t.name, "description": t.description, "input_schema": t.input_schema}
        if t.defer_loading:
            d["defer_loading"] = True
        tools.append(d)
    if req.tool_search and tools:
        # The search tool itself is never deferred; at least one tool must load up front.
        tools.insert(0, dict(TOOL_SEARCH_TOOL))
    system: Any
    if req.cache_prefix:
        blocks: list[dict[str, Any]] = [
            {"type": "text", "text": req.system, "cache_control": {"type": "ephemeral"}}
        ]
        if req.system_user:
            blocks.append({"type": "text", "text": req.system_user, "cache_control": {"type": "ephemeral"}})
        if req.system_tail:
            blocks.append({"type": "text", "text": req.system_tail})
        system = blocks
        # The last tool that is loaded up front carries the tool-side breakpoint; a
        # deferred tool may not (the API refuses cache_control on it).
        for d in reversed(tools):
            if not d.get("defer_loading") and "type" not in d:
                d["cache_control"] = {"type": "ephemeral"}
                break
    else:
        parts = [req.system]
        if req.system_user:
            parts.append(req.system_user)
        if req.system_tail:
            parts.append(req.system_tail)
        system = "\n\n".join(p for p in parts if p)

    messages = _to_anthropic_messages(req.messages)
    if req.cache_prefix:
        _mark_last_user_block(messages)

    kwargs: dict[str, Any] = {
        "model": req.model,
        "max_tokens": req.max_tokens,
        "system": system,
        "messages": messages,
    }
    if tools:
        kwargs["tools"] = tools
    if req.effort and "haiku" not in req.model.lower():
        kwargs["output_config"] = {"effort": req.effort}

    started = time.monotonic()
    text_parts: list[str] = []
    async with _sdk().messages.stream(**kwargs) as stream:
        async for event in stream:
            if event.type == "content_block_delta" and event.delta.type == "text_delta":
                text_parts.append(event.delta.text)
                if req.on_text_delta:
                    await req.on_text_delta(event.delta.text)
        final = await stream.get_final_message()
    latency_ms = int((time.monotonic() - started) * 1000)

    tool_calls = [
        ToolCall(id=block.id, name=block.name, input=dict(block.input or {}))
        for block in final.content
        if block.type == "tool_use"
    ]

    # The provider's own blocks, kept for a same-turn replay. exclude_none: a null
    # field echoed back is rejected by the API, an absent one is fine.
    raw_content: list[dict[str, Any]] = []
    try:
        raw_content = [b.model_dump(exclude_none=True) for b in final.content]
    except Exception as exc:  # noqa: BLE001 — a replay aid, never a turn failure
        print(f"[anthropic] could not keep raw content blocks: {exc}")

    usage = final.usage
    cache_creation = getattr(usage, "cache_creation", None)
    write_1h = int(getattr(cache_creation, "ephemeral_1h_input_tokens", 0) or 0) if cache_creation else 0

    return CompleteResult(
        text="".join(text_parts),
        tool_calls=tool_calls,
        stop_reason=_map_stop(final.stop_reason),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        cache_write_tokens=int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
        cache_write_1h_tokens=write_1h,
        model=str(getattr(final, "model", "") or ""),
        request_id=str(getattr(final, "id", "") or "") or None,
        latency_ms=latency_ms,
        raw_content=raw_content,
    )
