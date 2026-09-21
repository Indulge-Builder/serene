# MCP connector: Serene inside Claude, ChatGPT and other AI apps

Built 2026-09-19 (Phase 1 of `docs/architecture/mcp-plan.md`). This page is the contract: what
the connector is, how a person connects, what the AI app can do, and what to check when it
misbehaves.

## What it is

Serene is a remote MCP (Model Context Protocol) server at `https://<site>/api/mcp`. An AI app
that speaks MCP (Claude.ai, Claude Desktop, Claude Code, ChatGPT in Developer mode, Cursor,
Gemini CLI) adds that URL as a connector, sends the person to Serene to sign in, and from then on
can call Elaya's read tools as that person, from inside the AI app's own chat.

The connector has no tool list of its own. It publishes the signed-in person's role-gated
toolset from Elaya's registry (`TOOLSET_BY_ROLE`), the same set the in-app and WhatsApp brains
get, and every call runs through `executeTool`: toolset re-check, input validation, the tool's
own per-record gates, PII masking. A new Elaya read tool appears in the connector the day it is
merged. Write tools are not published (Phase 4 of the plan).

Audience today: founder and admin (`MCP_ROLES` in `src/lib/constants/mcp.ts`). Anyone else can
sign in but gets a server with zero tools and a sentence saying so.

## How a person connects

1. In the AI app, add a custom connector with the URL `https://<site>/api/mcp`.
2. The app gets a 401 from Serene with a challenge pointing at
   `/.well-known/oauth-protected-resource`, reads it, and learns the authorization server is the
   project's Supabase Auth (`https://<project>.supabase.co/auth/v1`).
3. The app registers itself (dynamic client registration) and opens the browser at Supabase's
   authorize endpoint, which sends the browser to Serene's consent page, `/oauth/consent`.
4. Not signed in? The login page opens with the consent page as the return path. Sign in.
5. The consent card says which app is asking and as whom. Allow or Deny.
6. The browser returns to the AI app with a code; the app exchanges it for a token. Done.

Tokens are ordinary Supabase user JWTs (one hour) with a `client_id` claim naming the app, plus a
refresh token. On every call Serene verifies the token with `auth.getUser`, reads the role from
`public.profiles`, and builds the principal. Nothing in the token is trusted for authorization.

To disconnect an app: /profile → "Connected AI apps" → Disconnect. Every token that app holds
for the person stops working at once.

## One-time setup in the Supabase dashboard

Authentication → OAuth Server:

| Setting | Value |
| --- | --- |
| OAuth 2.1 server | Enabled |
| Authorization path | `/oauth/consent` |
| Dynamic client registration | Enabled (Claude and ChatGPT register themselves) |

Authentication → URL Configuration → Site URL must be the production site, since the consent
URL is Site URL + Authorization path. Until the server is enabled, the discovery document at
`https://<project>.supabase.co/.well-known/oauth-authorization-server/auth/v1` answers
`feature_disabled` and no app can connect.

Environment: `NEXT_PUBLIC_SITE_URL` (the public origin the metadata names) and
`NEXT_PUBLIC_SUPABASE_URL` (the issuer). No new secret.

## Where the pieces live

| Piece | File |
| --- | --- |
| Vocabulary (paths, audience, rate limit) | `src/lib/constants/mcp.ts` |
| Bearer → principal | `src/lib/mcp/auth.ts` |
| The server, built per request from the principal | `src/lib/mcp/server.ts` |
| RFC 9728 metadata | `src/lib/mcp/metadata.ts`, served by `src/app/.well-known/oauth-protected-resource/route.ts` (and the `/api/mcp` suffix form) |
| The endpoint | `src/app/api/mcp/route.ts` |
| Consent page and its action | `src/app/(auth)/oauth/consent/`, `src/lib/actions/oauth-consent.ts`, `src/lib/services/oauth-server-service.ts` |
| Login return path | `safeReturnPath` in `src/lib/utils/return-path.ts`, honoured by `loginAction` |
| Connected apps card | `src/components/profile/ConnectedApps.tsx`, `src/lib/actions/oauth-grants.ts` |
| Call log | `public.mcp_tool_calls` (migration 0226), written by `src/lib/services/mcp-log-service.ts` |
| Proxy bypass | `/api/mcp` and `/.well-known` in `src/proxy.ts` (bearer, never a cookie) |

## What the AI app gets beyond the tools (Phase 2, 2026-09-21)

| Kind | Name | What it is |
| --- | --- | --- |
| Resource | `serene://vocab` | The exact status, category, role and domain words. Built from the constants; read once before filtering. |
| Resource | `serene://catalog` | The analyst's data dictionary (the views query_database and export_rows read). |
| Resource | `serene://pulse` | The live pulse. |
| Resource | `serene://member/{member}` | One member's 360 dossier, by name or id. |
| Resource | `serene://ticket/{ticket}` | One Sia ticket, by number (T-000042) or id. |
| Prompt | `weekly_review` (domain?) | Last 7 days against the 7 before, per domain, three things to fix. |
| Prompt | `campaign_audit` (days?) | Spend, leads, deals, return per campaign; flags the money burners. |
| Prompt | `sql_help` (question) | A plain question becomes the SQL, the run and the explanation. |
| Prompt | `member_brief` (member) | The one-screen brief before a call. |
| Prompt | `vendor_shortlist` (request, city?) | The ranked vendors with evidence. |
| Tool | `export_rows` | One SELECT, up to 5,000 rows as CSV for the app's sandbox. Founder and admin. Needs migration 0231, else 500. |
| Tool | `search` / `fetch` | The pair ChatGPT deep research requires: leads, members and Freshdesk tickets by words, then the record behind an id. |

Every resource except vocab is a tool's own answer under a different door, so the gates and the
PII mask are the tools'. A prompt only appears when its tool is in the person's toolset. Tool
results for connector clients may be up to 60,000 characters (Elaya's WhatsApp brain keeps
12,000).

## Logs

- `public.mcp_tool_calls`: one row per tool call, with the user, the app's client id, the tool,
  ok or not, and the duration. Append-only. The person sees their own rows, admin and founder
  see all.
- `public.elaya_query_log`: every SQL an app ran through `query_database`, with
  `channel = 'mcp'`.

## Limits

- 60 tool calls a minute per person (`MCP_RATE_LIMIT`), then 429.
- A tool result is capped at the registry's own per-tool size, like Elaya's.
- The route has 60 seconds per request.

## When it misbehaves

| Symptom | Look at |
| --- | --- |
| The app never opens a login page | The Supabase OAuth server is off, or dynamic client registration is off. Check the discovery URL above. |
| Login loops | The consent page could not read the request: the Authorization path in Supabase does not say `/oauth/consent`, or Site URL is wrong. |
| "No tools" in the app | The person's role is outside `MCP_ROLES`, or the profile is inactive. |
| A tool says "not available to this user" | Correct behaviour: the tool is outside the role's toolset. |
| 401 on every call after it worked | The app's token expired and it did not refresh, or the app was disconnected on /profile. Reconnect. |

## Testing locally

The dev server runs against production Supabase, so the discovery document and the 401 challenge
can be checked with curl on localhost. A full login needs the OAuth server enabled and a client
that can reach the site, so it is tested on the deployed URL.

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource
curl -s -D - -o /dev/null -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```
