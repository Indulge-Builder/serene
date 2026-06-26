# Serene — Claude Project context pack (index)

> **What this folder is.** A self-contained set of `.md` digests of the Serene codebase, written
> to be pasted into a Claude **Project**'s files section. Attach these (plus the root `CLAUDE.md`)
> and a chat will have full context on what Serene is, how it's built, the rules it obeys, and
> what's built vs. planned — without reading the repo.
>
> **Last regenerated:** 2026-06-26 (against `docs/changelog.md` through 2026-06-26 and the
> migration files through `0149`). The repo docs are the source of truth — regenerate these when
> they drift. The single most authoritative live record of change is `docs/changelog.md`.

---

## How to use this pack

1. Create a Claude Project. Upload **every file in this folder** to the Project's files.
2. Also upload the repo's root **`CLAUDE.md`** — it carries the Surface Contract, the 12 Rules,
   the File-Locations registry, and the Never-Do list verbatim. This pack summarises around it;
   it does not duplicate it.
3. For page-level work, additionally attach the matching `docs/pages/<route>.md` spec — those hold
   the full per-route invariant lists this pack only summarises.
4. Treat **"BUILT/LIVE"** as fact and **"PLANNED/IN-PROGRESS"** as roadmap. File 9 is the canonical
   built-vs-planned ledger; when a feature's status matters, check there.

## The files

| File | What it covers |
| ---- | -------------- |
| `0-README.md` | This index. |
| `1-product-and-status.md` | What Serene is, who Indulge is, the modules and their status, the lead journey, trust principles, the sidebar surfaces. Start here. |
| `2-architecture-summary.md` | Tech stack, topology, auth/RBAC, the database at a glance, the three caching layers, the integrations. The system map. |
| `3-pages-summary.md` | One paragraph per route (every sidebar page + admin + auth), describing what it does and its key invariants. |
| `4-design-essentials.md` | The design *laws* beyond the Surface Contract: typography, motion, z-index, the five themes, permanent component decisions, Elaya design language. The quick reference. |
| `5-elaya-jarvis.md` | The Elaya AI subsystem in depth — the "Jarvis" 4-block architecture, the Golden Rule, the 11 read + 11 write tools, propose→confirm, channels (in-app SSE + WhatsApp staff), voice, persona, memory, PII. |
| `6-engineering-rules.md` | The engineering constitution digest — Reuse-First (R-rules) + the canonical-helper registry, and the A/S/D/P/V/Q rule tables with IDs. The conventions a code change must obey. |
| `7-data-model.md` | The Postgres data model — tables grouped by domain, enums, the load-bearing RPCs, RLS posture, storage buckets, the migration numbering reality. |
| `8-integrations-and-jobs.md` | The outside world — lead ingestion, WhatsApp/Gupshup, Trigger.dev jobs, Web Push, Deepgram voice, the LLM provider layer — and the `after()` / Vercel-freeze rule that governs them. |
| `9-roadmap-and-open-items.md` | Built vs. planned. What's live, what's in the working tree but not on prod, what's next (customer WhatsApp bot, notes section, Sia), and the open Elaya audit items. |
| `10-design-system.md` | The buildable design *spec*: exact token scales (type/space/radius/shadow/motion), the 12 core components' anatomy, the micro-details, the form/data-display/toast/transition/data-viz systems, the addenda (dark-surface + lead-status colours, drawer, scroll), and the `ui/` component index. Attach this when building UI from the pack. |

## The one-paragraph version

**Serene** is the internal operating system **Indulge Global** (an ultra-luxury, WhatsApp-first
concierge company based in Goa, India) built for its own team. It runs the entire sales operation
— lead capture from ads, fair round-robin assignment, the worked lead dossier, SLA guardrails,
deals, tasks, performance scoreboards, and a shared WhatsApp inbox — behind one login with
role/domain access control enforced in the database (RLS) and again in every server action.
**Elaya** is the AI presence layered through it: a per-user assistant that can read your work and
make changes on your behalf (with confirmation for risky ones), in-app and over WhatsApp. The
stack is Next.js 16 + Supabase (Postgres/RLS) + TypeScript + Trigger.dev + Upstash Redis + Gupshup
(WhatsApp) + Anthropic (Claude) on Vercel. It is held to luxury-product design standards because
the team lives in it 8–12 hours a day.
