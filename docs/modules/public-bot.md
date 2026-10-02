# The public Indulge bot

> **Purpose:** the as-built record of the public WhatsApp concierge: the second line, the knowledge
> pack, the turn, the guards, the hand-over, the library, and how to switch it on.
> **Audience:** engineers and whoever switches it on. **Plan and decisions:**
> [../architecture/indulge-bot-plan.md](../architecture/indulge-bot-plan.md).
> **Last verified:** 2026-10-01, against the code in this commit. Migration 0252 is NOT applied and
> the bot is OFF (`public_bot_enabled` false).

## What it is

A second WhatsApp number (the "public" line, display name Indulge) that anyone may message. Every
new number becomes a lead in Gia and the assigned agent gets the usual new-lead alert. On top of
that, the Indulge concierge answers at once from a published knowledge pack, sends brochures,
videos and links from the library, and hands the chat to the agent with a brief when a person is
needed. The agent replies from Serene's inbox on the same number. The staff line (the Serene
number) is unchanged: staff Elaya and every alert still live there.

## The two lines

| | Staff line | Public line |
| --- | --- | --- |
| Env | `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET` | `GUPSHUP_PUBLIC_APP_NAME`, `GUPSHUP_PUBLIC_NUMBER`, `GUPSHUP_PUBLIC_WEBHOOK_SECRET`, `GUPSHUP_PUBLIC_API_KEY` (falls back to `GUPSHUP_API_KEY`) |
| Webhook | `/api/webhooks/whatsapp`, header `x-gupshup-secret` = the staff secret | the same URL, header = the public secret |
| Staff gate | runs first | never runs (staff test it as prospects) |
| Bot | none | the concierge |

The secret IS the line (`lineForSecret` in the route); the envelope's `app` must match the line's
app name or the public event is refused. `constants/whatsapp-lines.ts` names both; `whatsapp-api.ts`
`gupshupApp(line)` reads the right app at send time, so pasting the number into the environment is
all it takes. A conversation carries its `line`; every reply, file and template leaves from it.

## One inbound message on the public line

`route.ts` → `processInboundMessage(..., { line: 'public', referral })`:

1. Dedup on the message id; find the lead by phone. `getPublicInboundContext` says (in code) whether
   the number is a team test phone (`public_bot_test_phones`) or an existing member. A closed lead
   (won / lost / junk) is replaced by a new one unless the person is a member.
2. A new lead is created and assigned as today; the new-lead alert fires, except for a test phone
   or a member (quiet).
3. The thread is found or opened per line (and pointed at the person's newest lead).
4. The inbound row is stored. Then `handlePublicInbound` (`services/elaya-customer.ts`):
   - OFF unless `public_bot_enabled` is exactly true; quiet when the agent took over (`bot_active`
     false) or the person opted out.
   - "stop", "unsubscribe", "band karo" → opted out, one fixed line, never messaged again.
   - An existing member → one fixed line, their queen and bishops told in-app, the bot stays out.
   - A file with no words → a fixed line and a hand-over (a person looks at it).
   - Settle 5 s (a newer message takes over), the conversation lock, the per-phone ceilings
     (Upstash: 20 an hour, 60 a day), the daily spend cap (summed from the ledger).
   - No published pack → the bot stays quiet (the agent has the chat).
   - The turn (`customer-brain.ts`): the persona + pack as one cached system prompt; the latest
     message carries the time, their name, what was already sent, the ad they came from; three
     tools that read nothing; the last call's text is the reply.
   - The output guard (`bot-guards.ts`). A hit: a fixed safe line, a hand-over, ledger `blocked`.
   - The reply, then the queued library items (two at most, two seconds apart).
   - A hand-over: the `concierge_brief` lead activity, `bot_state` handed_over, the agent alerted
     (in-app always; WhatsApp when `GUPSHUP_HANDOVER_TEMPLATE_ID` is set). Shop enquiries also
     tell the Shop managers. Press, vendor and job enquiries alert nobody.
   - One `gia.whatsapp_bot_turns` row: model, pack version, tokens, cost, tools, guard verdicts.

## The knowledge pack

Items live in `public.elaya_training_assets` (the library page, `/admin/elaya-training`): facts,
stories, answers, objections, news, the never-say list, and the library (files, links, ready
messages). Every item is a draft until an admin or founder approves it. Publish compiles every
approved, active, unexpired item (plus `gia.service_cases` approved for the public) into one text
in a fixed order, runs the pack leak check (names, phones and emails that are not Indulge's, card
and ID shapes; the Never say section is skipped), and writes a new row of
`public.bot_knowledge_versions`. The bot reads the newest row (Redis five minutes; a publish clears
it). Restore publishes an older text again as a new row.

## Security, in one list

- The model has no door: three tools, none reads anything; the lead id comes from the principal.
- ESLint walls the four bot files off from staff Elaya and every data service.
- Nothing secret in the prompt: the pack is what we would print in a brochure.
- Input: card / Aadhaar / PAN / passport shapes removed, phones and emails masked, length cut.
- Output: full names of staff and members, the never-say phrases, contacts and links not in the
  pack, foreign currencies, prices not in the pack (or said by the person), and talk of prompts,
  tools, Serene or the model all hold a reply back.
- Brakes: the switch, per-phone ceilings, the daily cap, the Anthropic workspace limit on its own
  key (`ANTHROPIC_PUBLIC_BOT_API_KEY`), a lock per conversation.

## The inbox

A number filter (`?line=`) and an "Indulge" mark on public rows. On a public chat: who is
answering, with Take over / Hand back to the concierge (`setChatHandlerAction`); the Library
button in the composer (`sendLibraryItemAction`, sends on the chat's own line and takes a public
chat over); Correct under the concierge's messages (the corrections queue on the library page).

## Switching it on (in this order)

1. Apply migration 0252 from a clean worktree of main (the `supabase db push --dry-run` list must
   show only what you mean to push), then deploy the app.
2. Gupshup: a new app for the new number, approved display name "Indulge"; callback URL
   `https://<app>/api/webhooks/whatsapp` with header `x-gupshup-secret` = a new secret. Set
   `GUPSHUP_PUBLIC_APP_NAME`, `GUPSHUP_PUBLIC_NUMBER`, `GUPSHUP_PUBLIC_WEBHOOK_SECRET` (and
   `GUPSHUP_PUBLIC_API_KEY` if the app is on another account) on Vercel.
3. Anthropic: the "Indulge public bot" workspace with a monthly limit; `ANTHROPIC_PUBLIC_BOT_API_KEY`
   on Vercel.
4. The hand-over template on the STAFF Gupshup app (params: agent first name, prospect name, the
   brief, the promised call); `GUPSHUP_HANDOVER_TEMPLATE_ID`. Until then the alert is in-app only.
5. The pack: `scripts/public-bot/seed-pack.ts --apply` files the launch content as drafts; the
   founder reads, edits and approves each item, uploads the brochure and videos, then Publish.
6. Test phones in `elaya_settings.public_bot_test_phones`; run `scripts/public-bot/bench.ts all`.
7. `public_bot_enabled` = true. One ad set first; read every transcript for two weeks.

## Benches

- `scripts/public-bot/guards-bench.ts`: free, no model, no database; 30 cases. Run after any change
  to `bot-guards.ts`.
- `scripts/public-bot/bench.ts redteam|sales|all [--model id] [--only n]`: the real turn on the
  launch pack in memory, tools dry. A few rupees a full run on Haiku. Both need the `server-only`
  shim tsconfig the other benches use (see `scripts/test-revival-gate.ts`).

## Not built yet

The story approval control on the helpdesk (the compile already reads `public_approved_at`), the
story miner and the news desk (plan 7d, 7e), the click-to-WhatsApp referral written to the lead's
attribution (today it only reaches the bot's context), a separate Shop lead at a Shop hand-over
(today the Shop managers are told in-app), reading images (today: a hand-over), the one follow-up
template after 24 hours, and a typing indicator.
