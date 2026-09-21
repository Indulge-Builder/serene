"""The turn loop — the port of brain.ts's tool-calling core.

One turn: specialist prompt + trimmed toolset → model → (tool calls → execute
→ PII-mask → feed back)* → final prose. Laws carried over:

  • ITERATION CEILING (6): a runaway tool spiral ends with a calm handoff,
    never an infinite loop.
  • PII GATEWAY: every tool result is masked BEFORE the model sees it. The
    depth is read once per turn from elaya_settings.
  • CACHE PREFIX: the stable prefix (system + tools) carries a prompt-cache
    breakpoint, so iterations 2..n re-read it at ~0.1x. The prefix is
    byte-stable within a turn by construction (nothing volatile in it).

Everything the strangler plan listed as "not here yet" has now landed:
conversation persistence + the daily cap (core/elaya_store, the endpoint), the
confirmation RESOLVER pre-step (brain/resolver), write tools (through the Node
bridge), and the WhatsApp channel (`channel` threads into the persona block and
the bridge's ledger rows — the Node gate still owns identity, dedup, voice and
the reply send).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from app.brain.persona import build_system_prompt, build_time_context
from app.brain.pii import mask_pii
from app.brain.principal import StaffPrincipal
from app.brain.specialists import Specialist
from app.core import elaya_store, supa
from app.llm import registry
from app.llm.provider import ChatMessage, CompleteRequest, ToolDefinition
from app.tools import write_bridge
from app.tools.registry import (
    BRIDGED_READ_TOOL_NAMES,
    WRITE_TOOL_NAMES,
    definitions_for,
    execute_tool,
)

# Raised 6 → 10 with the write tranche (parity with brain.ts): a multi-person
# group task is create_group_task + a find_teammate + a create_subtask PER
# person — 10 keeps the runaway backstop while never truncating a real team
# task mid-creation.
MAX_ITERATIONS = 10
# The Node brain's TOOL_RESULT_MAX_CHARS — an oversized result is truncated the
# same way on both brains so the model reads the same world from either.
TOOL_RESULT_MAX_CHARS = 12_000
# Tools that are a whole picture by design carry a larger allowance (mirrors
# `maxResultChars` on the Node tool; Node has already fitted the result under it).
TOOL_RESULT_MAX_CHARS_BY_TOOL: dict[str, int] = {"get_member_360": 24_000}


def _cap(name: str) -> int:
    return TOOL_RESULT_MAX_CHARS_BY_TOOL.get(name, TOOL_RESULT_MAX_CHARS)


@dataclass
class TurnResult:
    text: str
    tools_used: list[str] = field(default_factory=list)
    # FULL call records ({id, name, input}) — persisted with the assistant
    # message exactly like the Node brain's ElayaToolCallRecord (the eval
    # scorer and the audit trail both read args from here).
    tool_calls: list[dict] = field(default_factory=list)
    specialist: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


async def run_turn(
    principal: StaffPrincipal,
    specialist: Specialist,
    history: list[dict],
    on_delta: Callable[[str], Awaitable[None]],
    on_tool: Callable[[str], Awaitable[None]],
    *,
    conversation_id: str,
    channel: str = "in_app",
) -> TurnResult:
    # One round of concurrent reads, the brain.ts shape: model config, PII depth,
    # the per-user persona (style prefs + learned blurb) and the user's notes —
    # the last two are admin-member + code-scoped so they fold identically on
    # both channels, and '' for a user who has set nothing.
    llm, depth, (persona, learned), notes = await asyncio.gather(
        registry.resolve(specialist.job),
        supa.get_pii_masking_depth(),
        elaya_store.get_user_persona(principal.user_id),
        elaya_store.get_notes_for_elaya(principal.user_id),
    )

    # The specialist's toolset ∩ the principal's role gate — both cuts apply.
    tool_names = [n for n in specialist.toolset if n in principal.toolset]
    write_names = [n for n in tool_names if n in WRITE_TOOL_NAMES]
    # The vendor pair runs in Node (the one ranker); its schema comes from the
    # bridge with the writes, and it executes there too (run_read below).
    bridged_read_names = [n for n in tool_names if n in BRIDGED_READ_TOOL_NAMES]
    read_names = [
        n for n in tool_names if n not in WRITE_TOOL_NAMES and n not in BRIDGED_READ_TOOL_NAMES
    ]
    tools = [ToolDefinition(**d) for d in definitions_for(read_names)]

    # Bridged-tool definitions (writes + the vendor reads) come from the Node
    # bridge — the single source of the model-facing schema (zero drift by
    # construction). A bridge outage degrades this turn to local reads only
    # rather than failing it.
    if write_names or bridged_read_names:
        try:
            bridge_defs = await write_bridge.fetch_write_definitions(
                principal.user_id, principal.role
            )
            wanted = set(write_names) | set(bridged_read_names)
            tools += [
                ToolDefinition(
                    name=d["name"],
                    description=d["description"],
                    # Node's LlmToolDefinition field is camelCase `inputSchema`.
                    input_schema=d["inputSchema"],
                )
                for d in bridge_defs
                if d.get("name") in wanted
            ]
        except Exception as e:
            print(f"[loop] bridge definitions unavailable (local reads only this turn): {e}")

    async def run_read(call: Any) -> str:
        """One READ → its serialized, masked tool-result string. The vendor
        pair runs in Node through the bridge and arrives already masked +
        serialized by the executeTool seam; every local read is masked here
        (THE gateway — nothing skips it). The toolset check mirrors
        execute_tool's: a bridged name outside the principal's toolset is a calm
        refusal, never a bridge call."""
        if call.name in BRIDGED_READ_TOOL_NAMES:
            if call.name not in principal.toolset:
                return json.dumps({"error": f"Tool '{call.name}' is not available to this user."})
            return await write_bridge.execute_bridged_read_tool(
                principal.user_id, conversation_id, channel, call.name, call.input
            )
        raw = await execute_tool(principal, call.name, call.input)
        return json.dumps(mask_pii(raw, depth), ensure_ascii=False, default=str)

    # The FULL persona (ported from persona.ts) is the frozen cached prefix;
    # the volatile time anchor rides as the uncached system tail — the Node
    # brain's exact cache shape, and the year-bug protection.
    system = build_system_prompt(
        principal, specialist.focus, channel, persona=persona, learned=learned, notes=notes
    )
    time_tail = build_time_context()

    # Persisted history replays as TEXT ONLY (brain.ts law: tool_use blocks
    # without their paired results are provider-rejected); the live loop below
    # builds proper pairs. The latest user message is history's last row.
    call_records: list[dict] = []
    messages: list[ChatMessage] = [
        ChatMessage(role=m["role"], content=m["content"])
        for m in history
        if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip()
    ]
    if not messages:
        return TurnResult(text="", specialist=specialist.id)
    result_text = ""
    tools_used: list[str] = []
    in_tokens = out_tokens = 0

    for _ in range(MAX_ITERATIONS):
        result = await llm.complete(
            CompleteRequest(
                model=llm.model,
                max_tokens=llm.max_tokens,
                system=system,
                system_tail=time_tail,
                messages=messages,
                tools=tools,
                cache_prefix=True,
                on_text_delta=on_delta,
            )
        )
        in_tokens += result.input_tokens
        out_tokens += result.output_tokens
        result_text = result.text

        if result.stop_reason != "tool_use" or not result.tool_calls:
            break

        messages.append(
            ChatMessage(role="assistant", content=result.text, tool_calls=result.tool_calls)
        )
        for call in result.tool_calls:
            tools_used.append(call.name)
            call_records.append({"id": call.id, "name": call.name, "input": call.input})
            await on_tool(call.name)

        has_write = any(c.name in WRITE_TOOL_NAMES for c in result.tool_calls)
        if has_write:
            # WRITES run SEQUENTIALLY in call order (the brain.ts law) — a
            # mutation must observe the one before it, never race it. Bridge
            # results arrive ALREADY PII-masked + serialized by the Node
            # executeTool seam; read results are masked locally as always.
            for call in result.tool_calls:
                if call.name in WRITE_TOOL_NAMES:
                    serialized = await write_bridge.execute_write_tool(
                        principal.user_id, conversation_id, channel, call.name, call.input
                    )
                else:
                    serialized = await run_read(call)
                if len(serialized) > _cap(call.name):
                    serialized = serialized[: _cap(call.name)] + "…(truncated)"
                messages.append(
                    ChatMessage(role="tool", content=serialized, tool_call_id=call.id)
                )
        else:
            # Pure-read batches stay CONCURRENT (a real latency win); results
            # are appended in call order so the transcript stays deterministic.
            serialized_results = await asyncio.gather(
                *(run_read(c) for c in result.tool_calls)
            )
            for call, serialized in zip(result.tool_calls, serialized_results):
                if len(serialized) > _cap(call.name):
                    serialized = serialized[: _cap(call.name)] + "…(truncated)"
                messages.append(
                    ChatMessage(role="tool", content=serialized, tool_call_id=call.id)
                )
    else:
        # Ceiling hit — same calm posture as the Node brain.
        closing = " I've hit my step limit on this one — try asking a smaller piece."
        await on_delta(closing)
        result_text += closing

    return TurnResult(
        text=result_text,
        tools_used=tools_used,
        tool_calls=call_records,
        specialist=specialist.id,
        input_tokens=in_tokens,
        output_tokens=out_tokens,
    )
