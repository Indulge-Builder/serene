# Serene — Codebase Navigation Wiki

> **Hand-curated navigation layer for the Serene codebase.** This is the map I (Claude) use to
> navigate. It supersedes the machine-generated community clusters in `../GRAPH_REPORT.md` for
> *human/agent navigation* — the report stays the source for raw graph topology, this is the
> source for "where does X live and what must I not break."
>
> Built: 2026-06-15 · Graph commit at build: `a384821` (HEAD) · 431 source files · 122 migrations.
> Regenerate the underlying graph with `graphify update .` after code changes; refresh these pages
> by hand when a subsystem changes shape (new service file, new table, new invariant).

---

## How to use this wiki

1. **Find the subsystem** in the map below, open its page. Each page has the same shape:
   *Purpose → Entry points → Data flow → Canonical helpers → Tables → Invariants/Gotchas → File map.*
2. **Before writing code**, read [`_conventions.md`](_conventions.md) — the cross-cutting laws that
   bite (the `after()` rule, dual-key cache, Zod-first actions, the PII gateway, IST math). These are
   the same rules as the root `CLAUDE.md` "12 Rules" + `docs/rules/The_Rules.md`, indexed by *where they apply*.
3. **Reuse before building** — the [Canonical Helper Registry](#canonical-helper-registry) is the
   single list of "this already exists, extend it." R-01 is the law; this is the index that serves it.

---

## Subsystem Map

Group by layer. Each entry links to its page and names the spine file you'd open first.

### AI & automation (the newest surface — least covered by old clusters)
| Subsystem | Page | Open first | One-liner |
|---|---|---|---|
| **Elaya** (AI compass) | [elaya.md](elaya.md) | `src/lib/elaya/brain.ts` | Staff-facing agent: read tools + propose/confirm writes; provider-neutral |
| **Lead Revival** | [lead-revival.md](lead-revival.md) | `src/trigger/lead-revival.ts` | Nightly note-AI sweep revives silent leads; overflow → human review |
| **Voice dictation** | [voice-dictation.md](voice-dictation.md) | `src/components/ui/DictationButton.tsx` | Deepgram in-memory STT → editable draft on 4 surfaces; never auto-sends |
| **Web Push** | [push-notifications.md](push-notifications.md) | `src/lib/services/push-service.ts` | VAPID push as 2nd channel, fanned out by `createNotification` |
| **SLA engine** | [sla-and-notifications.md](sla-and-notifications.md) | `src/trigger/lead-sla.ts` | Config-driven timers (status + cadence) → breach notifications |

### Core domain
| Subsystem | Page | Open first | One-liner |
|---|---|---|---|
| **Leads** | [leads.md](leads.md) | `src/lib/services/lead-mutations.ts` | Ingestion → round-robin → dossier → 4 mutation cores → dual-key cache |
| **Tasks** | [tasks.md](tasks.md) | `src/lib/services/tasks-service.ts` | Personal/group/Gia tasks; cursor pagination; Trigger.dev reminders |
| **Deals** | [deals.md](deals.md) | `src/lib/services/deals-service.ts` | Lead-won + walk-in deals; founder monthly domain targets |

### Analytics & integrations
| Subsystem | Page | Open first | One-liner |
|---|---|---|---|
| **Performance** | [performance.md](performance.md) | `src/lib/services/performance-service.ts` | RPC-backed agent/manager/founder metrics + Phase-5 drill modals |
| **Campaigns / Budget** | [campaigns-and-budget.md](campaigns-and-budget.md) | `src/lib/utils/campaigns.ts` | Ad creatives, daily Meta spend upload, CPL/CPD math |
| **Call Intelligence / Helpdesk** | [call-intelligence.md](call-intelligence.md) | `src/lib/services/intelligence-service.ts` | Service-case library + conversation hooks; Redis-cached library |
| **WhatsApp** | [whatsapp.md](whatsapp.md) | `src/app/api/webhooks/whatsapp/route.ts` | Dual pipeline: staff → Elaya, else lead ingestion; Gupshup BSP |

### Cross-cutting infrastructure
| Subsystem | Page | Open first | One-liner |
|---|---|---|---|
| **Auth / RBAC / Routing** | [auth-and-rbac.md](auth-and-rbac.md) | `src/lib/actions/_auth.ts` | `requireProfile` guard + `canAccessRoute` domain gating |
| **Theme / Tokens / Motion** | [design-system.md](design-system.md) | `src/styles/design-tokens.css` | 5 themes, surface contract, `m as motion`, no width/height animation |
| **Shared UI / Hooks / Utils** | [shared-toolbox.md](shared-toolbox.md) | `src/components/ui/` | The reuse-first primitive/hook/util registry |
| **Conventions (the laws)** | [_conventions.md](_conventions.md) | — | The patterns that bite, indexed by where they apply |

---

## Task → "Start here" router

| If you're about to… | Read first | Because |
|---|---|---|
| Add/modify a **server action** | [_conventions.md §Actions](_conventions.md#1-server-actions) | Zod-first, `requireProfile` first line, `{ data, error }` never throw |
| Touch a **lead mutation** | [leads.md](leads.md) + `lead-mutations.ts` | The 4 cores own cache + SLA + notify; never re-implement outside a core |
| Add an **outward send** (WhatsApp / fetch) | [_conventions.md §after()](_conventions.md#3-outward-network-sends--after) | Bare `void fetch().catch()` is silently lost on Vercel |
| Add/clear **Redis** in an action | [_conventions.md §Redis](_conventions.md#4-redis-invalidation-p-08) | `await` del before `revalidatePath`; lead actions use `invalidateLeadCaches` |
| Give **Elaya** a new tool | [elaya.md §Tools](elaya.md#4-the-tools) | Wrap a service, never a raw query; PII gateway; propose-vs-inline split |
| Add a **Trigger.dev** job | [_conventions.md §Async](_conventions.md#7-async-work--triggerdev) | >3s or retry → Trigger.dev; config read per-run, never cached |
| Build a **list page** | [design-system.md §Page layout](design-system.md#standard-page-layout) | The canonical header / filter-bar / content contract |
| Add a **colour / animation** | [design-system.md](design-system.md) | Every colour a token; only transform/opacity; `m as motion` |
| Compute a **date boundary** | `src/lib/utils/ist.ts` | THE IST math; never re-fork day/week/month boundaries |
| Format **phone / text** before DB write | `src/lib/utils/phone.ts` + `sanitize.ts` | `normalizeToE164()` + `sanitizeText()` are the only ones (Rule 06) |

---

## Canonical Helper Registry

The "this already exists — extend it, do not fork it" index (R-01–R-04). If your task names one of
these behaviours, the implementation already exists. Search by **behaviour**, not filename.

### Lead writes & cache
- **`invalidateLeadCaches(site, { leadId, slug, domain }, scope)`** — `lib/services/lead-cache.ts` — the only lead Redis-invalidation path; dual-key row del + list version INCRs. Never hand-roll `redis.del` in a lead action.
- **The 4 lead mutation cores** — `lib/services/lead-mutations.ts` — `addLeadNoteCore` / `updateLeadStatusCore` / `assignLeadCore` / `createLeadTaskCore` (+ `reviveLeadCore`). Both `actions/leads.ts` and Elaya write tools call the SAME core.
- **`getNextRoundRobinAgent(domain)`** — `lib/services/leads-service.ts` — the assignable-agent selector.
- **`notifyLeadAssigned(input)`** — `lib/services/lead-assignment-notify.ts` — the post-assignment side-effect orchestrator (agent/founder WhatsApp + in-app + SLA), called inside `after()`.

### Identity, access, scope
- **`requireProfile(roles?)`** — `lib/actions/_auth.ts` — THE session/role guard; first line of every session action. (Exceptions table: `lib/actions/CLAUDE.md`.)
- **`canAccessRoute(profile, pathname)`** — `lib/utils/route-access.ts` — pure route gate, safe in client.
- **`getAssignableUsers({ domain?, agentsOnly? })`** — `lib/services/profiles-service.ts` — THE assignable-users query; never re-declare a `Pick<Profile,…>` assignee shape.
- **`resolveWidgetScope(role, mode)`** — `lib/utils/widget-scope.ts` — manager-vs-domain-picker scope.

### Time & formatting
- **IST math** — `lib/utils/ist.ts` — `toISTMidnight`, `toISTEndOfDay`, `getISTMondayStart`, `getISTMonthStart`, `getISTPrevMonthRange`, `toIst`, `istToUtc`. Every other date file imports from here.
- **`normalizeToE164()`** — `lib/utils/phone.ts` — the only phone normalizer.
- **`sanitizeText()`** — `lib/utils/sanitize.ts` — the only sanitizer (before every DB write).
- **`formatDate()` / `formatCount()` / `formatCurrency()`** — `lib/utils/dates.ts` / `numbers.ts`.
- **`getInitials()` + `hashString()`** — `lib/utils/strings.ts` — initials + deterministic colour-pick hash.

### AI / LLM
- **`resolveLlmForJob('reasoning' | 'routing')`** — `lib/elaya/registry.ts` — DB-config → adapter, read per turn. Reused by Elaya brain *and* the revival gate.
- **`maskPii(result, depth)`** — `lib/elaya/pii.ts` — the PII gateway on every tool result and every note-AI blob.
- **`classifyConfirmation(text)`** — `lib/elaya/confirmation.ts` — the English+Hinglish affirmation gate (default = cancel).

### Domain helpers
- **`normalizeCampaignKey(raw)`** — `lib/utils/campaigns.ts` — campaign-key normalization (DB CHECKs depend on it).
- **`mapRows<TRow,TOut>(data, fn)`** — `lib/utils/rows.ts` — typed boundary for untyped joined/RPC results.
- **`createRateLimiter()` / `getClientIp()` / `safeSecretCompare()` / `readJsonBody()`** — `lib/utils/webhook.ts` — the webhook guards.
- **`defineEnum([{ id, label }])`** — `lib/constants/define-enum.ts` — factory for simple string-enum constants.

### Client toolbox (don't re-inline)
- Hooks: `useWidgetData`, `useUrlFilters`, `usePortalAnchor`, `useMediaQuery`, `useMountOnFirstOpen`, `useDebounce`, `useAudioRecorder`, `usePushSubscription`, `useLeadColumnPreferences` — see [shared-toolbox.md](shared-toolbox.md).
- UI: `FilterBar`, `FloatingPanel`, `ConfirmDialog`, `EmptyState`, `CollapseReveal`, `DictationButton`, `Carousel`, `ChatMarkdown`, `StatTile`, `PageSkeletons`, `CartesianChartFrame`, `TaskFormFields` — see [shared-toolbox.md](shared-toolbox.md).

---

## Authority files (when this wiki isn't enough)
- `CLAUDE.md` (root) — the command layer: 12 Rules, Surface Contract, File Locations, Never-Do list.
- `docs/rules/The_Rules.md` — the constitution: §0 Reuse First + A/S/D/P/V/Q tables + Decision Log.
- `docs/design/DESIGN-DNA.md` — full visual/layout reference.
- `src/styles/design-tokens.css` — exact token values.
- Per-area `CLAUDE.md`: `src/lib/actions/`, `src/lib/services/`, `src/components/`, `supabase/migrations/`.
- `docs/changelog.md` — single source of truth for all changes (chronological).
