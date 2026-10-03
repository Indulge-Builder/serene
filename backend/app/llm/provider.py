"""The provider-neutral LLM contract — the Python port of lib/elaya/provider.ts.

Every shape here is provider-agnostic. Anthropic (and later Google/OpenAI)
request/response formats are normalized INSIDE each adapter and never leak
past it: the router, the loop, and the tools only ever see these types.
Adding a provider = one adapter module + one llm_providers row.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

StopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal", "other"]


@dataclass
class ToolCall:
    """One normalized tool invocation requested by the model."""

    id: str
    name: str
    input: dict[str, Any]


@dataclass
class ChatMessage:
    """One provider-neutral conversation turn.

    role 'tool' carries a tool RESULT back to the model (tool_call_id set).
    """

    role: Literal["user", "assistant", "tool"]
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None
    # The provider's OWN content blocks for an assistant turn, kept verbatim so the next
    # request in the same loop replays them unchanged (thinking blocks with their
    # signatures, and the tool-search blocks that make a discovered tool stay loaded).
    # Opaque to everything outside the adapter; None for persisted history, which
    # replays as text only.
    raw_blocks: list[dict[str, Any]] | None = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    # A deferred tool is in the catalog but not in the model's context until the model
    # searches for it (the 2026 answer to "too many tools": the hot set stays small and
    # sharp, the long tail stays one search away). False = loaded up front.
    defer_loading: bool = False


@dataclass
class CompleteRequest:
    model: str
    max_tokens: int
    system: str
    messages: list[ChatMessage]
    tools: list[ToolDefinition] = field(default_factory=list)
    # When True the adapter marks the stable prefix (tools + system) with a
    # provider-native prompt-cache breakpoint: calls 2..n of a multi-tool turn
    # re-read it at ~0.1x. The CALLER keeps the prefix byte-stable across the
    # turn (no timestamps/UUIDs in system or tools) — same contract as the
    # Node provider.ts.
    cache_prefix: bool = False
    # The PER-USER system block (2026-10-02, cost audit P1 "shared prompt content is mixed with
    # personal content"): who the user is, their reach, the specialist focus, their style overlay,
    # notes, memory. Delivered as a SECOND cached block after `system`, so the shared block in
    # `system` is byte-identical across users (and cached across them) while this one is cached
    # across the calls of one turn. None = everything is in `system`.
    system_user: str | None = None
    # A VOLATILE trailing system block (the per-turn time anchor) delivered
    # AFTER the cache_control breakpoint — it changes every request without
    # busting the cached prefix. None = no tail.
    system_tail: str | None = None
    # How hard the model should think ("low" | "medium" | "high"), the Node adapter's control:
    # thinking is on by default on the Claude 5 family and counts against max_tokens. None = the
    # provider's default. Ignored for a model that rejects the field (Haiku).
    effort: str | None = None
    # What this call is for, for the usage ledger (migration 0254): feature, channel, user_id,
    # conversation_id, message_id, job_id, prompt_version, behaviour_version. The registry writes
    # one llm_usage_events row per request with it; None = the job type alone.
    usage_ctx: dict[str, Any] | None = None
    on_text_delta: Callable[[str], Awaitable[None]] | None = None
    # Give the model the provider's tool-search tool so it can discover deferred tools by
    # describing what it needs. The adapter adds the provider-native search tool; the
    # loop turns this on whenever any tool in `tools` is deferred.
    tool_search: bool = False


@dataclass
class CompleteResult:
    text: str
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    # Uncached input, billed at the full rate (the provider's input_tokens).
    input_tokens: int
    output_tokens: int
    # The cache counters (2026-10-02): what the prompt cache wrote and read on this call.
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cache_write_1h_tokens: int = 0
    # The model the provider says answered, its own id for the request, and the wall-clock.
    model: str = ""
    request_id: str | None = None
    latency_ms: int = 0
    # The assistant turn's content blocks as the provider returned them (see
    # ChatMessage.raw_blocks). Empty when the adapter has nothing to preserve.
    raw_content: list[dict[str, Any]] = field(default_factory=list)
