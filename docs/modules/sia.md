# Sia — The Concierge Module

> **Purpose:** the member-operations side of Serene: the WhatsApp group archive, the member
> identity spine, and the intelligence layer on top of both.
> **Audience:** everyone. · **Source-of-truth scope:** status and pointers.
> **Last verified:** 2026-09-15 · **Status:** data layer live, UI live, Freshdesk mirror in code, intelligence layer planned.

Sia is where a member lives after Gia converts them. It is built in layers, each with its own
contract document:

| Layer | Status | Contract |
| --- | --- | --- |
| The WhatsApp group data layer (`sia.wag_*`, the Baileys watcher on Fargate, raw-first ingest) | live since 2026-08-27 | `plan-whatsapp.md` sections 3, 10 and 11 |
| The Sia section in Serene (`/sia`: groups rail, chat viewer, search, media, health, pairing, mapping tool) | live | `src/lib/services/sia-service.ts`, `src/components/sia/` |
| The member identity spine (`public.members`, migration 0181) and the group mapping | live since 2026-09-04, 207 groups mapped | changelog 2026-09-04, `scripts/import-members-and-map-groups.py` |
| The Freshdesk mirror (`freshdesk.*`, migration 0193, the minute sync, `/freshdesk`) | live in code 2026-09-15, awaiting the migration push | `docs/integrations/freshdesk.md` |
| The member profile + Serene-native ticketing (the sentinel, intake, the profile layers) | planned | `member-ticket-plan.md` (supersedes `plan-sia-intelligence.md` where they differ) |

Rules that never change: Sia and Gia never share tables or UI; they meet only in the member
profile. The watcher never speaks. Facts are append only. Unmapped groups are never profiled.
