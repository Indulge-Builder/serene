"""The turn loop — the port of brain.ts's tool-calling core.

One turn: specialist prompt + the FULL role toolset → model → (tool calls →
execute → PII-mask → feed back)* → final prose.

Tool search (2026-09-24). The specialist no longer trims what the model may call;
it decides what loads UP FRONT. Every tool the principal's role allows is in the
catalog; the specialist's own tools load immediately (the hot set) and the rest are
deferred, one provider-side search away. A router mistake now costs one search
instead of a dead turn ("that tool isn't in my hands this turn", 11 times in the
transcript). The role gate is untouched: a name outside principal.toolset is never
sent to the model at all. Laws carried over:

  • ITERATION CEILING (MAX_ITERATIONS): a runaway tool spiral ends, never an
    infinite loop, with one tools-withheld closing call that answers from what
    was gathered (or says what was checked and not found), never a bare refusal.
  • PII GATEWAY: every tool result is masked BEFORE the model sees it. The
    depth is read once per turn from elaya_settings.
  • CACHE PREFIX: the shared block, the per-user block and the tools carry
    prompt-cache breakpoints, and the last user block carries the same-turn
    one (anthropic_adapter.py), so iteration n re-reads what iteration n-1
    sent. The prefix is byte-stable within a turn by construction.

THE COST ENVELOPE (2026-10-02, cost audit P1 "bound cost and detect lack of
progress"; the numbers mirror src/lib/constants/elaya-cost.ts, change both):
  • an identical read (same tool, same arguments) inside one turn is answered
    from the first result, never run again;
  • a tool that fails TURN_REPEATED_ERRORS_MAX times in a row ends the gathering
    (a repeated SQL error is a dead end, not a retry);
  • the serialized tool results of a turn add up to at most
    TURN_TOOL_RESULT_BUDGET_CHARS, and the billed input to at most
    TURN_INPUT_TOKENS_CAP (one request's whole context to at most
    TURN_CONTEXT_TOKENS_CAP): past any of these the loop stops offering tools
    and the closing call answers from what it has, saying what was not checked.
Every stop records WHY (TurnResult.stop) for the ledger and the eval.

EVIDENCE (the reliable-agent plan): the first calls of a turn are kept as a
compact record (tool, arguments, the head of the masked result) on the
assistant row; the next turns fold the last few records into the per-user
block, so a follow-up reuses them instead of re-running the same reads.

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
from typing import Any

from app.brain.behaviour import BEHAVIOUR_VERSION, PROMPT_VERSION
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
TOOL_RESULT_MAX_CHARS_BY_TOOL: dict[str, int] = {"get_member_360": 24_000, "get_open_loops": 18_000}

# ── The cost envelope (mirrors src/lib/constants/elaya-cost.ts; change both) ──
TURN_TOOL_RESULT_BUDGET_CHARS = 90_000
TURN_INPUT_TOKENS_CAP = 250_000
TURN_CONTEXT_TOKENS_CAP = 180_000
TURN_REPEATED_ERRORS_MAX = 3
TURN_DUPLICATE_READ_NOTE = (
    "This is the same lookup, with the same arguments, as an earlier call in this turn. "
    "Reuse that result; it has not changed."
)
EVIDENCE_PER_TURN_MAX = 8
EVIDENCE_SUMMARY_CHARS = 220


# The closing call's instruction (tools withheld). An empty reply had gathered enough;
# a ceiling stopped mid-search, so the answer must say what was checked and what is left.
_EMPTY_CLOSING = (
    "You have finished gathering. Answer now, in short lines, from what the tool results "
    "above hold. Do not call any more tools."
)
_CEILING_CLOSING = (
    "You have used every lookup this turn allows, so stop searching and answer now from "
    "the tool results above. Do not call any more tools. If they hold the answer, give it. "
    "If they do not, say so plainly: name what you checked, say it was not found there, and "
    "say what could be checked next or who on the team could confirm it. Never invent a match."
)
_BUDGET_CLOSING = (
    "This turn's reading budget is spent, so stop searching and answer now from the tool "
    "results above. Do not call any more tools. Give what they hold, say in one line what was "
    "not checked, and if the rest matters offer to continue in a new message or name the person "
    "who could confirm it. Never invent a match."
)
_DEAD_END_CLOSING = (
    "The same lookup has failed several times, so stop retrying it and answer now from the tool "
    "results above. Do not call any more tools. Give what they hold, say plainly which lookup "
    "kept failing and what it was for, and offer the next useful step. Never invent a match."
)


def _cap(name: str) -> int:
    return TOOL_RESULT_MAX_CHARS_BY_TOOL.get(name, TOOL_RESULT_MAX_CHARS)


def _is_error_result(serialized: str) -> bool:
    """A tool result that is an error object (the registries' {"error": ...} shape)."""
    head = serialized.lstrip()[:160]
    if not head.startswith("{"):
        return False
    try:
        obj = json.loads(serialized)
    except (ValueError, TypeError):
        return head.startswith('{"error"')
    return isinstance(obj, dict) and bool(obj.get("error"))


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
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    calls: int = 0
    model: str = ""
    job: str = ""
    # Why the gathering ended: end | empty | ceiling | budget | result_budget | repeated_errors
    stop: str = "end"
    duplicate_reads: int = 0
    # The compact evidence record of this turn (see the module docstring).
    evidence: list[dict] = field(default_factory=list)


async def run_turn(
    principal: StaffPrincipal,
    specialist: Specialist,
    history: list[dict],
    on_delta: Callable[[str], Awaitable[None]],
    on_tool: Callable[[str], Awaitable[None]],
    *,
    conversation_id: str,
    channel: str = "in_app",
    playbook: dict | None = None,
    evidence: str | None = None,
    job_override: str | None = None,
) -> TurnResult:
    # The model tier: the specialist's own, or the founder's override from elaya_specialist_tiers.
    job = job_override if job_override in ("routing", "reasoning", "heavy") else specialist.job
    # One round of concurrent reads, the brain.ts shape: model config, PII depth,
    # the per-user persona (style prefs + learned blurb) and the user's notes —
    # the last two are admin-member + code-scoped so they fold identically on
    # both channels, and '' for a user who has set nothing.
    llm, depth, (persona, learned), notes, memory, known_issues = await asyncio.gather(
        registry.resolve(job),  # type: ignore[arg-type]
        supa.get_pii_masking_depth(),
        elaya_store.get_user_persona(principal.user_id),
        elaya_store.get_notes_for_elaya(principal.user_id),
        # The living memory of this user + the team's known issues (0237): context, never permission.
        elaya_store.get_memory_block(principal.user_id),
        elaya_store.get_known_issues_block(),
    )

    # The catalog = every tool the ROLE allows (the hard gate). The specialist's own
    # tools are the hot set, loaded up front; every other allowed tool is deferred
    # and reachable through tool search. Sorted so the prefix is byte-stable.
    tool_names = sorted(principal.toolset)
    hot = {n for n in specialist.toolset if n in principal.toolset}
    write_names = [n for n in tool_names if n in WRITE_TOOL_NAMES]
    # The bridged reads (vendors, members, Freshdesk, groups, the database, ...) run in
    # Node through the bridge; their schema comes from the bridge with the writes.
    bridged_read_names = [n for n in tool_names if n in BRIDGED_READ_TOOL_NAMES]
    read_names = [
        n for n in tool_names if n not in WRITE_TOOL_NAMES and n not in BRIDGED_READ_TOOL_NAMES
    ]
    tools = [ToolDefinition(**d, defer_loading=d["name"] not in hot) for d in definitions_for(read_names)]

    # Bridged-tool definitions come from the Node bridge — the single source of the
    # model-facing schema (zero drift by construction). A bridge outage degrades this
    # turn to local reads only rather than failing it.
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
                    defer_loading=d["name"] not in hot,
                )
                for d in bridge_defs
                if d.get("name") in wanted
            ]
        except Exception as e:
            print(f"[loop] bridge definitions unavailable (local reads only this turn): {e}")
    tools.sort(key=lambda t: (t.defer_loading, t.name))
    use_search = any(t.defer_loading for t in tools)

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

    # The two cached system blocks (persona.py) + the volatile time anchor as the tail.
    prompt = build_system_prompt(
        principal, specialist.focus, channel, persona=persona, learned=learned, notes=notes, playbook=playbook,
        memory=memory, known_issues=known_issues, evidence=evidence,
    )
    time_tail = build_time_context()
    usage_ctx = {
        "feature": "chat_turn",
        "channel": channel,
        "user_id": principal.user_id,
        "conversation_id": conversation_id,
        "prompt_version": PROMPT_VERSION,
        "behaviour_version": BEHAVIOUR_VERSION,
    }

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
        return TurnResult(text="", specialist=specialist.id, job=job)
    result_text = ""
    tools_used: list[str] = []
    in_tokens = out_tokens = cache_read = cache_write = calls = 0
    model_seen = ""
    stop = "end"
    closing_instruction = _EMPTY_CLOSING
    result_chars = 0
    duplicate_reads = 0
    seen_reads: dict[str, str] = {}
    errors_in_row: dict[str, int] = {}
    evidence_records: list[dict] = []

    def _keep_evidence(call: Any, serialized: str) -> None:
        if len(evidence_records) >= EVIDENCE_PER_TURN_MAX:
            return
        args = json.dumps(call.input, ensure_ascii=False, sort_keys=True, default=str)
        evidence_records.append({
            "tool": call.name,
            "args": args[:160],
            "summary": " ".join(serialized[:EVIDENCE_SUMMARY_CHARS].split()),
        })

    async def _settle(call: Any, serialized: str) -> None:
        """Cap, count, record and append one result; flags the envelope breaches."""
        nonlocal result_chars, stop, closing_instruction
        if len(serialized) > _cap(call.name):
            serialized = serialized[: _cap(call.name)] + "…(truncated)"
        result_chars += len(serialized)
        if _is_error_result(serialized):
            errors_in_row[call.name] = errors_in_row.get(call.name, 0) + 1
        else:
            errors_in_row[call.name] = 0
        _keep_evidence(call, serialized)
        messages.append(ChatMessage(role="tool", content=serialized, tool_call_id=call.id))
        if stop == "end":
            if errors_in_row[call.name] >= TURN_REPEATED_ERRORS_MAX:
                stop, closing_instruction = "repeated_errors", _DEAD_END_CLOSING
            elif result_chars > TURN_TOOL_RESULT_BUDGET_CHARS:
                stop, closing_instruction = "result_budget", _BUDGET_CLOSING

    for _ in range(MAX_ITERATIONS):
        result = await llm.complete(
            CompleteRequest(
                model=llm.model,
                max_tokens=llm.max_tokens,
                system=prompt.shared,
                system_user=prompt.user,
                system_tail=time_tail,
                messages=messages,
                tools=tools,
                cache_prefix=True,
                tool_search=use_search,
                on_text_delta=on_delta,
                usage_ctx=usage_ctx,
            )
        )
        calls += 1
        in_tokens += result.input_tokens
        out_tokens += result.output_tokens
        cache_read += result.cache_read_tokens
        cache_write += result.cache_write_tokens
        model_seen = result.model or model_seen
        result_text = result.text

        if result.stop_reason != "tool_use" or not result.tool_calls:
            break

        # The provider's own blocks ride along (raw_blocks) so the next iteration
        # replays the search results and thinking untouched.
        messages.append(
            ChatMessage(
                role="assistant", content=result.text, tool_calls=result.tool_calls,
                raw_blocks=result.raw_content or None,
            )
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
                await _settle(call, serialized)
        else:
            # Pure-read batches stay CONCURRENT (a real latency win); results
            # are appended in call order so the transcript stays deterministic.
            # An identical read (same tool, same arguments) is answered from the
            # first result, never run again.
            keys = [f"{c.name}:{json.dumps(c.input, sort_keys=True, default=str)}" for c in result.tool_calls]
            pending: list[tuple[Any, str]] = []
            batch_keys: set[str] = set()
            for c, k in zip(result.tool_calls, keys):
                if k in seen_reads or k in batch_keys:
                    continue  # answered from the first result (an earlier round, or earlier in this batch)
                batch_keys.add(k)
                pending.append((c, k))
            fresh = await asyncio.gather(*(run_read(c) for c, _ in pending))
            for (c, k), serialized in zip(pending, fresh):
                seen_reads[k] = serialized
            for call, key in zip(result.tool_calls, keys):
                if any(c is call for c, _ in pending):
                    await _settle(call, seen_reads[key])
                else:
                    duplicate_reads += 1
                    await _settle(call, json.dumps({"note": TURN_DUPLICATE_READ_NOTE}))

        # The billed envelope: cumulative uncached input, or one request's whole context.
        context_tokens = result.input_tokens + result.cache_read_tokens + result.cache_write_tokens
        if stop == "end" and (in_tokens > TURN_INPUT_TOKENS_CAP or context_tokens > TURN_CONTEXT_TOKENS_CAP):
            stop, closing_instruction = "budget", _BUDGET_CLOSING
        if stop != "end":
            result_text = ""
            break
    else:
        # Ceiling hit. The rounds are spent, but what they found is not thrown away
        # (2026-10-01: three founder turns ended "I've hit my step limit" after 10+ good
        # queries, one of them having found the answer). The closing call below answers
        # from the gathered results, and says plainly what was checked when nothing matched.
        stop, closing_instruction = "ceiling", _CEILING_CLOSING
        result_text = ""

    # An EMPTY final reply is never an answer (2026-09-21: a 16-call playbook turn ended with
    # stop_reason max_tokens and "" — the Claude 5 models think inside the output allowance, and a
    # long turn can spend all of it thinking). One closing call, tools withheld, asks for the answer
    # from what was gathered; if even that is empty, say so rather than send a blank bubble.
    if not result_text.strip():
        if stop == "end":
            stop = "empty"
        try:
            # The closing call carries no tools, so the history goes back in the plain
            # text + tool_use shape (no search blocks to replay without the search tool).
            closing_messages = [
                ChatMessage(role=m.role, content=m.content, tool_calls=m.tool_calls, tool_call_id=m.tool_call_id)
                for m in messages
            ]
            closing_messages.append(ChatMessage(role="user", content=closing_instruction))
            closing_result = await llm.complete(
                CompleteRequest(
                    model=llm.model,
                    max_tokens=llm.max_tokens,
                    system=prompt.shared,
                    system_user=prompt.user,
                    system_tail=time_tail,
                    messages=closing_messages,
                    tools=[],
                    cache_prefix=True,
                    on_text_delta=on_delta,
                    usage_ctx={**usage_ctx, "feature": "chat_closing"},
                )
            )
            calls += 1
            in_tokens += closing_result.input_tokens
            out_tokens += closing_result.output_tokens
            cache_read += closing_result.cache_read_tokens
            cache_write += closing_result.cache_write_tokens
            result_text = closing_result.text
        except Exception as exc:  # noqa: BLE001
            print(f"[loop] closing call failed: {exc}")
        if not result_text.strip():
            result_text = "I gathered the data but could not put the answer together this time. Ask me again, or ask for one part of it."
            await on_delta(result_text)

    return TurnResult(
        text=result_text,
        tools_used=tools_used,
        tool_calls=call_records,
        specialist=specialist.id,
        input_tokens=in_tokens,
        output_tokens=out_tokens,
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
        calls=calls,
        model=model_seen or llm.model,
        job=job,
        stop=stop,
        duplicate_reads=duplicate_reads,
        evidence=evidence_records,
    )
