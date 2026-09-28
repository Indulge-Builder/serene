# Serene: Claude Project context pack (index)

> **Purpose:** the index of a self-contained set of digests of the Serene codebase and docs, written to be uploaded to a claude.ai Project so a chat that cannot read the repo knows what Serene is, how it is built, the rules it obeys, and what is built versus planned.
> **Audience:** whoever sets up or refreshes the claude.ai Project, and the chat itself.
> **Source-of-truth scope:** a generated pack. The repo docs (`docs/`) are the source of truth and the code beats them; the single live record of change is `docs/changelog.md`. Regenerate these files when the docs drift.
> **Last verified:** not re-checked against code (a generated pack).
> **Last regenerated:** 2026-09-26 against the docs refreshed that day (every doc in `docs/` re-verified against the code, seven new docs added), migrations through 0245, with production applied through 0244 (0245 is committed but not applied).

---

## What changed since the 2026-08-24 pack

The August pack described a sales CRM with an AI assistant. Since then Serene grew a second half,
and almost every file was rewritten:

- **The concierge side (Sia) went live:** the Baileys WhatsApp watcher on AWS Fargate (2026-08-27),
  the `/sia` viewer, three queendoms with seats (queen, bishop, genie, joker, and one company-wide
  Joker head), the member twin (profiler, pulse, weekly judgement, health, an encrypted vault),
  Serene-native tickets (sentinel, intake, a founder-approved training loop), the vendor book (about
  21,600 suppliers, a live extractor), the read-only Freshdesk mirror, and Zoho Books. All of it is in
  the **new file 12**.
- **Elaya moved to a Python brain** (FastAPI on ECS Fargate behind CloudFront; both channels since
  2026-09-04; the Node brain frozen, retirement targeted 2026-10-16), grew from 12 + 12 to **36 read +
  16 write tools** with tool search, gained a living memory, improvement requests, playbooks, Teach
  Elaya, an eval set, the founders' **analyst layer** (read-only SQL, pulse, twice-daily brief, alerts,
  deep reads), and a third channel, the **MCP connector** for Claude and ChatGPT. She is switched on
  only for the Gia and concierge teams, admin, founder and the tech workbench (`ELAYA_DOMAINS`,
  2026-09-26).
- **The schema restructure** (2026-09-17): Gia tables moved to `gia`, the clients tables renamed to
  members and moved to `member`; plus the `sia`, `freshdesk` and `elaya_read` schemas.
- **Authorization** now has seats and the queendom boundary at every layer, a tech "workbench", nine
  API routes, and `getClaims()` in the proxy.
- The whole company was onboarded from the roster on 2026-09-26 (73 accounts, nine domains).
- **Design:** the live design law is `docs/design/DESIGN-DNA.md` (patched with a "what changed since
  July" table). The old `docs/design/design.md` is now `docs/design/design-serene.md`, a superseded July
  snapshot; do not treat it as current.
- The old pack had stale claims worth unlearning: Sia "not started", "client records" as the current
  focus, the Tasks "Gia tab" (deleted in June), WhatsApp resolve/reopen (removed in June), five API
  routes, a TTS layer, and Elaya's `retrieveMemoryContext`.

## How to use this pack

1. Create a Claude Project and upload **every file in this folder**.
2. Also upload the repo's root **`CLAUDE.md`**: it carries the Surface Contract, the 12 Rules, the File
   Locations registry and the Never-Do list verbatim. This pack summarises around it.
3. Paste **`docs/ai/claude-project-instructions.md`** into the Project's custom instructions. That file
   is the working method; this pack is the knowledge it works over. (The in-repo twin of the method is
   `.claude/skills/serene-engineer/SKILL.md`.)
4. For page-level or module-level work, also attach the matching `docs/pages/<route>.md` or
   `docs/modules/<x>.md`: they hold the full invariant lists this pack only summarises.
5. Treat **built / live** as fact and **planned / not built** as roadmap. File 9 is the canonical
   built-vs-planned ledger. Whether a migration is **applied** in production is a separate question
   from whether it is **written**; file 9 and `docs/architecture/migrations.md` say which.

## The files

| File | What it covers |
| --- | --- |
| `0-README.md` | This index. |
| `1-product-and-status.md` | What Serene is, who Indulge is, every module and its status, who uses it, the journey of a lead and of a member request, the surfaces, the trust principles. Start here. |
| `2-architecture-summary.md` | The stack (web app, Python brain, watcher), where everything runs, the nine API routes, request flow, auth and RBAC with seats and the workbench, the schemas, caching, background work, outside services. The system map. |
| `3-pages-summary.md` | One paragraph per route in `src/app`: auth and consent, every dashboard page (sales floor, concierge floor, money and configuration, every settings sub-route), and the `/m` phone layer. |
| `4-design-essentials.md` | The design laws: the neumorphic material, eight themes, dark mode, typography, motion, z-index, empty states, controls and focus, Elaya's design language. The quick reference. |
| `5-elaya-jarvis.md` | Elaya in depth: the Golden Rule, access (`ELAYA_DOMAINS`), models, the two brains and the bridge, the 36 + 16 tools, propose-then-confirm, the PII gateway, the channels (in-app, WhatsApp, MCP, customer), living memory, requests, playbooks, the analyst layer, evals, what is not built. |
| `6-engineering-rules.md` | The engineering constitution digest: Reuse First (R-rules) and the canonical-helper registry, the A/S/D/P/V/Q rule tables with IDs, working across schemas (`giaDb()`, `memberDb()`, no cross-schema embeds), and what ESLint and the token guard enforce by machine. |
| `7-data-model.md` | The Postgres data model by schema (`public`, `gia`, `member`, `sia`, `freshdesk`, `elaya_read`), enums, load-bearing RPCs, RLS postures, storage buckets, the migration numbering and production status. |
| `8-integrations-and-jobs.md` | The outside world: lead ingestion, Gupshup and its templates, the Sia connector (the WhatsApp watcher), Freshdesk, Zoho, the MCP connector, the LLM tiers and the two brains, Deepgram, Web Push; all 26 Trigger.dev tasks; the deploy targets (Vercel, Trigger.dev, AWS, Supabase); and the `after()` rule that governs outward sends. |
| `9-roadmap-and-open-items.md` | Built vs planned as of 2026-09-26: module status, what is written but not applied, the current focus, what is next, and the open items by area. |
| `10-design-system.md` | The buildable design spec: token values, shadow recipes, radii, the pastel families, the dark block, component anatomy, the form, data-display and toast systems, the `ui/` index. Attach it when building UI. |
| `11-mobile-and-pwa.md` | The `/m` phone layer (four rooms and the Elaya knob), the mobile tokens, the room registry, the PWA (manifest, icons, service worker, boot screen), appearance wiring, and the responsive shell. |
| `12-sia-concierge.md` | **New.** The whole concierge side: queendoms and seats, who sees what, the WhatsApp archive and its watcher, the member twin, Serene tickets, vendors, the Freshdesk mirror, Zoho member finance, the model calls and jobs, the rules that never change. |

## The one-paragraph version

**Serene** is the internal operating system **Indulge Global** (an ultra-luxury, WhatsApp-first concierge
company based in Goa, India) built for its own team. It runs the **sales floor** (Gia: lead capture from
ads and the Shop app, fair round-robin assignment, the worked lead dossier, SLA guardrails, deals,
campaigns, budget, performance, a shared WhatsApp inbox) and, increasingly, the **concierge floor** (Sia:
a silent archive of every member's WhatsApp group, a member record that fills itself from the chats,
Serene's own tickets proposed from those chats, a ranked book of 21,600 suppliers, a read-only Freshdesk
mirror, live Zoho money), with every concierge teammate seated in one of three queendoms and seeing only
its members. Access is enforced in the database (RLS) and again in every server action, from one fact:
the `profiles` row. **Elaya** is the AI presence across both floors: she answers and acts as the person
asking, in the app, on WhatsApp and inside Claude or ChatGPT (read only there), proposes risky changes
for a human yes, remembers how each person works, and gives the founders an analyst and a twice-daily
brief. She thinks in a Python brain on AWS; every write goes back through the same Node cores the app
uses. The surface is a neumorphic soft-UI on one cream material with eight accent themes and a dark mode,
plus a phone layer at `/m`. The stack is Next.js 16 + Supabase (Postgres, RLS, Auth, Realtime) +
TypeScript + Trigger.dev + Upstash Redis + Gupshup + Anthropic on Vercel, with the brain and the WhatsApp
watcher on AWS ECS Fargate. It is held to luxury-product standards because the team lives in it 8 to 12
hours a day.
