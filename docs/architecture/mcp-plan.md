# MCP plan: Serene as a connector for Claude, ChatGPT and every other AI tool

Written 2026-09-19. Status: **Phase 1 LIVE 2026-09-21. Phase 2 BUILT 2026-09-21 (resources, prompts, export_rows, search/fetch, 60k result cap); migration 0231 pending on production. Next: use it, then Phase 3 (the team).** Decisions the founder must make are
marked **Decide**. The rest is my recommendation and I will build it exactly as written unless
told otherwise.

Read `docs/modules/elaya.md` first if you do not know Elaya. This plan stands on her shoulders.

---

## 1. The idea in one paragraph

Today Elaya can answer almost any question about Indulge, but only inside Serene and on
WhatsApp. The founder also lives in Claude Desktop, claude.ai and ChatGPT, and those tools have
better analysis surfaces than a chat bubble: long documents, charts, code, files, memory across
weeks. MCP (Model Context Protocol) is the open standard those tools use to reach outside data.
We build ONE remote MCP server, hosted inside Serene, that opens Elaya's own tools to any AI app
the person logs into with their Serene account. The AI app becomes another Elaya channel. It
never touches a table, never sees a phone number, never acts as anyone but the person who signed
in, and every call is logged the same way Elaya's are.

A real-world picture: the founder opens Claude Desktop on a Sunday and asks "compare Legacy
lead-to-deal conversion by campaign for the last 90 days and draft the Monday note to the
managers." Claude calls Serene's `query_database` tool three times, gets clean rows back, builds
the table and writes the note. Nobody exported a CSV. Nobody pasted a connection string.

## 2. What "connector" and "MCP" mean here

| Word | Meaning |
| --- | --- |
| MCP server | A small web service that publishes tools (functions the AI may call), resources (documents the AI may read) and prompts (canned workflows). Ours lives at `https://<serene>/api/mcp`. |
| Connector | What Claude and ChatGPT call an MCP server once you add it in their settings. Same thing, their word. |
| Remote MCP | The server runs on our side, over HTTPS, with OAuth login. This is the only kind Claude.ai and ChatGPT accept. A local (stdio) server would only work for one laptop and is not what we want. |
| Streamable HTTP | The MCP transport we use: plain HTTPS POST plus an optional streamed response. The older "SSE" transport is being retired and we do not build it. |

Who can use it, as of this writing:

| Client | Custom MCP servers | Login required | Notes |
| --- | --- | --- | --- |
| Claude.ai, Claude Desktop | Yes ("Custom connectors") | OAuth | Tools, resources and prompts all show up. Available on Pro, Max, Team, Enterprise. |
| Claude Code | Yes | OAuth or bearer | `claude mcp add --transport http serene https://…/api/mcp` |
| ChatGPT | Yes ("Developer mode" connectors, plus Apps SDK) | OAuth | Deep research needs two tools named `search` and `fetch`; we ship both as aliases. |
| Cursor, Windsurf, VS Code Copilot | Yes | OAuth or bearer | Same server, no changes. |
| Gemini CLI, Vertex agents | Yes | OAuth or bearer | The consumer Gemini app does not take custom servers yet. |

One server. Zero per-client code.

## 3. The founder's ask, translated into requirements

> "absolutely supreme and up to date with Elaya, so all the data is accessible for any message
> we need."

| Ask | What it means in code | How this plan delivers it |
| --- | --- | --- |
| Up to date with Elaya | Every tool Elaya has, the connector has, on the day it ships, with no second list to maintain. | The server does not define its own tools. It reads Elaya's registry (`getToolDefinitionsForPrincipal`) and publishes it. A new Elaya tool appears in Claude Desktop the moment it is merged. This is the channel-parity rule from `src/lib/elaya/CLAUDE.md` applied to a third channel. |
| All the data | Any table, any question, not just the 32 pre-shaped tools. | `describe_database` + `query_database` (migration 0223) are the general door: 40 cleaned views across Gia, members, Sia, vendors, Freshdesk, subscriptions, staff. Phase 2 adds resources (the catalog as a readable document) and a bulk export tool so ChatGPT's data analysis can work on thousands of rows. |
| Any message | Works from a Sunday laptop, from a phone, from a scheduled ChatGPT task. | Remote, OAuth, stateless per request. No Serene tab needs to be open. |
| Supreme | Better than pasting exports; better than what most companies have. | Prompts (canned analyses), resources (live pulse, catalog, per-member dossiers), and the write tools in Phase 4 with the same propose-and-confirm safety Elaya has. |
| Secure | Same rules as Serene, not looser. | Login is the Serene account; role read from `public.profiles` on every call (Rule 09); PII masked at the same seam (`maskPii`); read-only SQL through `elaya_reader`; every call logged; per-user rate limits; revocation in one click. |

## 4. Architecture

```text
Claude Desktop / ChatGPT / Cursor / Gemini CLI
        │  HTTPS + OAuth 2.1 (PKCE)
        ▼
/api/mcp  (Next.js route, Streamable HTTP, @modelcontextprotocol/sdk)
        │  1. verify bearer token → Supabase user id
        │  2. resolveStaffPrincipal(profile)   ← same as in-app and WhatsApp
        │  3. list tools = principal.toolset  ← Elaya's registry, role-gated
        │  4. call tool  = executeTool(name, args, principal)  ← same dispatch, same maskPii
        │  5. log: elaya_conversations channel 'mcp' + elaya_query_log channel 'mcp'
        ▼
src/lib/elaya/tools/registry.ts  →  elaya-data.ts  →  services (admin client, scoped in code)
```

Three rules carried over from Elaya, now structural for the connector:

1. **A tool calls `elayaData.*` only.** The MCP layer never reaches a service. It cannot: it
   only knows `executeTool`.
2. **The per-resource gate stays in the tool** (`canAccessLead`, `canAccessMember`,
   `getSiaViewerScope`). The connector adds no new gate and removes none.
3. **PII masking happens inside `executeTool`.** The connector returns what Elaya's brain would
   have seen, never more.

What is new, and only this:

| New piece | Where | Why |
| --- | --- | --- |
| `src/app/api/mcp/route.ts` | App Router | The transport. One POST handler (JSON-RPC), one GET for the stream, one DELETE for session close. Needs a **P-02 carve-out** in the Decision Log, like `/api/elaya/chat`. |
| `src/lib/mcp/server.ts` | new folder | Builds the MCP server from the principal: tools from the registry, resources and prompts from §6. No business logic. |
| `src/lib/mcp/auth.ts` | new folder | Bearer → verified user → `StaffPrincipal`. Rejects with the MCP `WWW-Authenticate` challenge so clients start the login flow. |
| `src/app/.well-known/oauth-protected-resource/route.ts` | App Router | The discovery document (RFC 9728) that tells Claude and ChatGPT where to log in. Static JSON. |
| `src/lib/mcp/adapt.ts` | new folder | `LlmToolDefinition` (Elaya's provider-neutral shape) → MCP tool schema, and the result envelope → MCP content blocks. Pure functions, unit-tested. |
| `public.mcp_sessions` (migration) | database | One row per connected client: user, client name, scopes, created, last seen, revoked. The founder can revoke a device from /profile. Append-only except `revoked_at`. |

> As built (2026-09-19): `adapt.ts` was not needed (the registry's own Zod schemas are Standard Schemas the SDK reads directly) and `mcp_sessions` was not needed either (the Supabase OAuth server keeps the grants; /profile lists and revokes them through `listGrants` / `revokeGrant`). The call ledger is `public.mcp_tool_calls` (0226). The consent page (`/oauth/consent`) and the login return path were the two pieces this table missed.

## 5. Login: how a person connects

**Recommended: Supabase Auth as the OAuth 2.1 server.** Supabase Auth can act as the identity
provider for MCP clients (its OAuth server feature). The flow Claude or ChatGPT runs:

1. Client reads `/.well-known/oauth-protected-resource`, learns the authorization server.
2. Client registers itself dynamically (DCR), then sends the person to the Serene login page.
3. The person logs in with their normal Serene email and password. MFA if we turn it on later.
4. Supabase issues an access token scoped to `mcp:read` (Phase 4 adds `mcp:write`).
5. Every MCP request carries that token. `auth.ts` verifies it with `supabase.auth.getUser()`,
   reads `public.profiles` for the role, and builds the principal. No claim from the token is
   trusted for authorization (Rule 09).

If the Supabase OAuth server turns out to be missing something we need (**Decide** after a
one-day spike), the fallback is a small self-hosted authorization server in the same route
group: consent page → Supabase session → we mint a short-lived JWT bound to the user id and
store its hash in `mcp_sessions`. Same shape for the clients, more code for us. Spike first.

Not allowed, ever: a shared API key, a Supabase service key in a client, a token that does not
map to one person.

## 6. What the connector publishes

### 6.1 Tools (Phase 1: the 32 reads Elaya has today)

Published exactly as the registry defines them, role-gated by `TOOLSET_BY_ROLE`:

| Group | Tools | Roles |
| --- | --- | --- |
| Gia leads | `search_leads`, `get_cold_leads`, `get_lead_details`, `search_deals`, `get_campaigns`, `get_budget`, `get_helpdesk_content` | all staff; budget admin/founder; campaigns manager+ |
| Work | `get_my_tasks`, `find_teammate`, `get_performance_snapshot`, `get_escalations`, `get_domain_health` | all staff; oversight manager+ |
| Members | `get_member_overview`, `get_member_profile`, `get_member_360`, `get_member_finance`, `get_member_recent_messages`, `search_member_history` | queendom-scoped by `canAccessMember` |
| Sia | `list_tickets`, `get_ticket`, `list_sia_groups`, `get_sia_group_messages`, `search_sia_messages` | `getSiaViewerScope` |
| Freshdesk | `get_freshdesk_overview`, `search_freshdesk_tickets`, `get_freshdesk_ticket` | admin/founder + seated concierge |
| Vendors | `find_vendors`, `get_vendor_details` | admin, founder, concierge |
| Money | `get_books_overview` | admin/founder |
| Analyst | `describe_database`, `query_database`, `get_live_pulse` | founder/admin |

Two aliases added for ChatGPT deep research, which requires them by name: `search` (fans out to
`search_leads` + `search_members` + `search_freshdesk_tickets` and returns id + title + snippet)
and `fetch` (id → the matching `get_*` tool). Both are thin and role-gated like the rest.

### 6.2 Resources (Phase 2: documents the AI can read without asking)

| URI | Content | Source |
| --- | --- | --- |
| `serene://catalog` | The data dictionary: every `elaya_read` view, its purpose, its columns. The model reads it once per chat instead of calling `describe_database` each time. | `getElayaCatalog()` |
| `serene://pulse` | The live pulse as a document (sales today, work, members waiting, Freshdesk). | `getLivePulse()` |
| `serene://member/{id}` | One member's 360 dossier. | `get_member_360` |
| `serene://ticket/{ticket_no}` | One Sia ticket with its timeline. | `get_ticket` |
| `serene://vocab` | The constant vocabularies: lead statuses, ticket states and transitions, vendor stances, domains, roles. So the model writes valid filters. | `src/lib/constants/*` |

Resources are the difference between "a tool box" and "a colleague who already knows the
company". Claude Desktop shows them as attachable documents.

### 6.3 Prompts (Phase 2: canned analyses)

| Prompt | What it does |
| --- | --- |
| `weekly_review` | Leads, deals, spend and tickets for the last 7 days versus the 7 before, per domain, with the three things to fix. |
| `member_brief` | Before a call: who the member is, open requests, coming-up dates, last conversations, money. |
| `campaign_audit` | Spend versus leads versus deals per campaign, flags the ones burning money. |
| `vendor_shortlist` | A request in plain words → the ranked vendors with reasons, straight from `rankVendorsForRequest`. |
| `sql_help` | Teaches the model the catalog and the four locks, then writes the query. |

A prompt is text plus the tool calls it should make. It costs nothing to run and saves the
founder typing the same paragraph every Monday.

### 6.4 Bulk export tool (Phase 2)

`export_rows(sql, format)`: the same `elaya_run_query` path with a higher cap (**Decide**:
5,000 rows?) returned as a CSV content block. ChatGPT and Claude can then run real data
analysis (pivots, charts, regressions) on the rows in their sandboxes. Founder and admin only,
logged with `channel = 'mcp'` and `purpose = 'export'`, and the row count goes in the log so we
see who pulled what.

### 6.5 Writes (Phase 4, not before)

Elaya's 12 write tools split into inline (notes, calls, tasks) and propose-only (status,
reassign, deal, delete). MCP has no "reply yes in the next turn" the way a chat does, so the
propose tier maps to a two-step: `propose_*` returns a proposal id and a plain sentence; the
client must call `confirm_action(proposal_id)` within 10 minutes. Same `elaya_actions` ledger,
same `executeProposedAction` resolver, same before-and-after snapshots. Inline tools ship as-is
with scope `mcp:write`. Nothing in Phase 4 adds a third path to a mutation core.

## 7. Security, spelled out

| Threat | Answer |
| --- | --- |
| A stolen token | Short-lived access tokens (1 hour), refresh tokens revocable per device in `mcp_sessions`, shown on /profile with client name and last-seen. |
| A model writes a bad query | It runs as `elaya_reader` in a READ ONLY transaction over views with explicit columns, wrapped and row-capped (0223's four locks). There is no path to a base table. |
| PII reaches ChatGPT | The views hold no phone, email, password or WhatsApp jid. Tool results pass `maskPii` at `executeTool`. Same as Elaya, and Elaya already runs on the Anthropic API. **Decide:** is the founder comfortable that OpenAI (ChatGPT) sees the same masked data Anthropic (Elaya) does? |
| A manager sees another domain | Scope is in code from the principal, never from the request. Same functions Elaya uses on WhatsApp, which has no session either. |
| Runaway cost | The AI app pays for its own tokens. Our side is database time: per-user limit of 60 tool calls a minute and 2,000 a day (`createRateLimiter` in `utils/webhook.ts`), and `elaya_run_query` already has `statement_timeout`. |
| Prompt injection through data | Member messages and Freshdesk notes contain text written by outsiders. The connector labels every message-bearing result as untrusted data in its content block description, the same note Elaya's persona carries. |
| Abuse of the discovery endpoint | It is public by design (the standard needs it) and contains no secret. |
| Audit | Every tool call: `elaya_conversations` row with channel `mcp` and the client name; every SQL: `elaya_query_log`. Append-only (Rule 08). |

Not a security boundary and never will be: the system prompt, the tool description, the client.

## 8. Build order

Layer order as always: database → services → lib → route → UI → docs.

### Phase 0: decisions and spike (half a day)

- **Decide** the five items marked above (OAuth server, export cap, ChatGPT and PII, first
  audience, writes timing).
- Spike the Supabase OAuth server against Claude Desktop with a hello-world tool. Pass or fall
  back to the self-hosted authorization server.

### Phase 1: the door (2 days). Founder and admin only.

1. Migration: `public.mcp_sessions` with RLS (owner reads own rows; admin reads all; insert and
   revoke through the service only). Register the OAuth client for Serene.
2. `src/lib/mcp/adapt.ts` + tests: registry definition → MCP tool, result → content blocks,
   errors → MCP error with the tool's own message (never a stack).
3. `src/lib/mcp/auth.ts`: bearer → principal, 401 challenge, session touch.
4. `src/lib/mcp/server.ts`: tools from the registry only. Include `search` and `fetch`.
5. `src/app/api/mcp/route.ts` + the well-known route. `maxDuration = 60`.
6. Rate limiter, logging with channel `mcp`.
7. /profile: a "Connected AI apps" card listing sessions with Revoke. Composes existing
   primitives; no new form chrome.
8. Docs: `docs/integrations/mcp.md` (how to connect each client, with screenshots), Decision
   Log carve-out for the route, changelog entry, this plan's status line.

Exit test: from Claude Desktop, ChatGPT and Claude Code, log in, list tools, run
`get_live_pulse`, run a `query_database` over `elaya_read.deals`, see both in the logs, revoke
the device, see the next call fail.

### Phase 2: the analysis layer (2 days)

Resources, prompts, `export_rows`. Regenerate `vocab` from the constants at build time so it
cannot drift. Tune `describe_database` output for the larger context windows these clients have
(the 12,000-char tool cap was Elaya's, not the standard's).

### Phase 3: the team (1 day, after two weeks of founder use)

Open to managers and agents with the same `TOOLSET_BY_ROLE`. Nothing changes in code; the
audience flag in `elaya_settings` flips. Write a one-page "how to connect" for the floor.

### Phase 4: writes (2 days, when the founder asks)

`mcp:write` scope, `confirm_action`, the 12 write tools. Ships behind an `elaya_settings` switch
seeded off, like the briefing.

### Phase 5 (optional): Elaya herself uses it

The Python brain today reaches Node through bridged reads. Once the connector exists, the brain
can consume the same MCP server as any other client. One tool surface for all of Elaya. This is
a refactor, not a feature, and waits until Phases 1 to 3 are calm.

## 9. What we deliberately do not build

- A second tool list for MCP. The registry is the list.
- A direct database connector (Supabase MCP, a read replica connection string, a Postgres MCP).
  All of them are the service role with no masking and no per-person audit.
- A ChatGPT "Custom GPT with Actions". OpenAPI, ChatGPT only, superseded by MCP.
- A separate MCP server for each business (Gia, Sia, vendors). One server, role-gated. Splitting
  would fork the gates.
- The legacy SSE transport. Streamable HTTP only.
- Caching of tool results in the connector. The services already cache where it is safe.

## 10. Cost

| Item | Estimate |
| --- | --- |
| Build, Phases 0 to 2 | About five working days. |
| New packages | `@modelcontextprotocol/sdk` only. |
| Run cost | Database reads we already do for Elaya. Zero model cost on our side; the AI app bills its own user. |
| Client subscriptions | The founders' existing Claude and ChatGPT plans. |

## 11. Open questions for the founder (the Decide list)

1. OAuth: Supabase's OAuth server, or our own small one if the spike fails?
2. Export cap for `export_rows`: 5,000 rows?
3. ChatGPT sees the same masked data Elaya (Anthropic) sees. Yes?
4. First audience: founder and admin only, then the team after two weeks?
5. Writes: build Phase 4 now or wait?

---

Status log:

- 2026-09-19: plan written. Awaiting the Decide list.
- 2026-09-19: the founder said go with the recommendations on all five. Phase 0 answered
  without a spike: the Supabase OAuth server is beta, free on all plans, issues ordinary
  Supabase user JWTs, and the installed supabase-js already has the consent and grant methods.
  Phase 1 built: route, auth, per-request server over the registry, discovery document, consent
  page, login return path, Connected AI apps card, migration 0226, docs. Verified locally
  (discovery JSON, 401 challenge, consent redirect, return-path guard). Still to do by hand:
  enable the OAuth server in the Supabase dashboard (Authorization path `/oauth/consent`, dynamic
  client registration on) and apply 0226 to production; then the first real login from Claude
  Desktop. `search` / `fetch` (ChatGPT deep research) moved to Phase 2.
- 2026-09-21: 0226 applied, code on main, the Supabase OAuth server switched on, and the
  founder connected Claude and ran tools through it. Phase 1 is live. Phase 2 next.
- 2026-09-21 (later): Phase 2 built. Resources (vocab, catalog, pulse, member, ticket), the five
  prompts, export_rows (5,000 rows CSV, migration 0231 raises the SQL clamp), the search/fetch
  pair, and a 60,000-char result allowance for connector clients. Structural smoke test passed
  without a database. 0231 still to apply.
