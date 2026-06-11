# _archive — Pre-Restructure Originals (2026-06-11)

> Safety-net copies from the docs restructure. **Never cite these files** — each carries known
> drift, listed below. Delete this folder in a later cleanup once nothing misses it.
> The restructure plan itself: `../_restructure-proposal.md`.

## Per-file disposition — where content went, what was dropped, and why

| Archived file | Content went to | Deliberately dropped / corrected (and why) |
| ------------- | --------------- | ------------------------------------------ |
| `master.md` | §1–3 → `architecture/overview.md` · §4–6 → `architecture/auth-and-rbac.md` + `architecture/database.md` + `pages/user-management.md` · §7 → `01-vision.md` · §8 route map → `docs/README.md` + `pages/` · §9 → `architecture/migrations.md` · §10–13 registries → `architecture/overview.md` §5/§8 (pointers to src CLAUDE.md) · §14 → `pages/tasks.md` · §15 → `integrations/whatsapp-gupshup.md` · §16 → `modules/gia.md` · §17–18 → not migrated (drifted copy of The_Rules — e.g. its V-10 differed; The_Rules.md is canonical) · §19 → rows already existed in `rules/The_Rules.md` Decision Log; narrative decisions cited inline in the new docs · §20 → `docs/README.md` reading order · §21 → not migrated (duplicate of DNA/design-system) · §22 → `architecture/caching.md` · §23 → `pages/leads.md` §8 | **Corrected:** GIA_DOMAINS is 4 (code), not 6; `last_seen_at` is written nowhere (not "updated by the proxy"); hooks list was 9 of 13. **Dropped:** the §17/§18/§21 rule/design copies — exact duplicates whose drift was the reason for the one-home rule. |
| `The_Gia.md` | §1, §6, §13, §15 → `modules/gia.md` · §2 → `architecture/database.md` + `pages/leads.md` deep dive · §3–5 → `integrations/lead-ingestion.md` · §7–11 → `pages/lead-dossier.md`/`pages/leads.md`/`pages/tasks.md` deep dives (already covered by the page docs, which were newer) · §12 → `pages/deals.md` · §14 → `integrations/whatsapp-gupshup.md` + `pages/whatsapp.md` · §16 file map → superseded by `architecture/overview.md` §5 · §17 decision log → rows already in `rules/The_Rules.md`; Gia-only rows cited in `modules/gia.md` | **Corrected:** scratchpad rows (dropped 0061), deal columns on leads (dropped 0072–0097), WhatsApp webhook auth (Gupshup `x-gupshup-secret`, not Meta `X-Hub-Signature-256`), `platform: 'whatsapp'` → `source` (0065), default-domain prose ("concierge" → `onboarding`), "logged to Sentry" (no Sentry). **Dropped:** the obsolete "scratchpad on reassignment" decision row; the §2 schema dump (the live dump + database.md are canonical). |
| `lead-page.md` | top → `pages/leads.md` + `pages/lead-dossier.md` (split); §3 ingestion → `integrations/lead-ingestion.md` | **Corrected:** `updateScratchpad` action row + "scratchpad null" in assignLead + `canEditScratchpad` capability row (all 0061); `assignLead` row updated for the F-3 domain checks; `gia-workflow.md` citation removed (deleted doc). |
| `dashboard-page.md` | → `pages/dashboard.md` (body preserved as Deep dive) | nothing dropped. |
| `tasks-page.md` | → `pages/tasks.md`; §6 Trigger.dev → `integrations/trigger-dev.md` | nothing dropped (§6 superset lives in the integration doc). |
| `deals-page.md` | → `pages/deals.md` | `docs/master.md §19` citation re-pointed to The_Rules Decision Log. |
| `campaigns-page.md` | → `pages/campaigns.md` | nothing dropped. |
| `performance-page.md` | → `pages/performance.md` | nothing dropped (doc was already synced to the 0101 RPC consolidation). |
| `whatsapp-page.md` | → `pages/whatsapp.md`; §5 webhook + §7 templates → `integrations/whatsapp-gupshup.md` | §5/§7 not duplicated in the page doc (one home). |
| `whatsapp-notifcation.md` | → `integrations/whatsapp-gupshup.md` (merged with whatsapp-page §5/§7) | **Corrected:** Pipeline-B default domain parenthetical said "concierge" — code is `DEFAULT_LEAD_DOMAIN = 'onboarding'` (the §9 happy-path snippet inherited the same wrong literal). Filename typo retired with the file. |
| `settings-page.md` | → `pages/settings.md` | F-2 fix (2026-06-11) reflected in the new top matter. |
| `user-management-page.md` | → `pages/user-management.md`; §2 authorization principle summarised in `architecture/auth-and-rbac.md` | `The_Profile.md §15` heading citation removed (deleted doc); content kept. |
| `auth-pages.md` | → `pages/auth.md` + `pages/profile.md`; §3 clients + §4 proxy → `architecture/auth-and-rbac.md` §7 | `The_Profile.md` citations replaced (deleted doc); the doc's last_seen_at "spec vs implementation" finding is preserved as the corrected claim in auth-and-rbac.md. |
| `ad-creatives-page.md` | → `pages/ad-creatives.md` | nothing dropped. |
| `decisions-to-take.md` | its single item → `pages/leads.md` §7 Open items (verbatim in substance) | nothing dropped. |

## Not archived (moved or kept live)

`DESIGN-DNA.md` + `design-system.md` → `design/` (corrected in place: DOC-01/04/05/06).
`The_Rules.md` → `rules/`. `call-intelligence-spec.md` → `modules/call-intelligence.md`.
`database_architecture.sql` → `architecture/`. Audits → `audits/` (the performance audit was
subsequently deleted by the Phase-5 completion — see changelog 2026-06-11 — not by this
restructure). `changelog.md` unchanged.
