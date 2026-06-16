# App Router — CLAUDE.md

Thin orchestrators in `src/app/`. Data fetching lives in async children (`*Async.tsx`) or page-level `Promise.all` when the whole page is one unit (dossier, dashboard).

## Route map

| Path | Area CLAUDE |
| --- | ------------- |
| `(auth)/login`, `forgot-password`, `update-password` | — |
| `(dashboard)/dashboard` | `(dashboard)/CLAUDE.md` — widgets, `initialData` RSC |
| `(dashboard)/leads`, `leads/[id]` | `(dashboard)/leads/CLAUDE.md` |
| `(dashboard)/deals` | `(dashboard)/deals/CLAUDE.md` |
| `(dashboard)/campaigns`, `campaigns/[id]` | `(dashboard)/campaigns/CLAUDE.md` |
| `(dashboard)/performance` | `(dashboard)/performance/CLAUDE.md` |
| `(dashboard)/tasks`, `tasks/[id]` | `(dashboard)/tasks/CLAUDE.md` |
| `(dashboard)/whatsapp` | `(dashboard)/CLAUDE.md` § WhatsApp |
| `(dashboard)/helpdesk` | `docs/modules/call-intelligence.md` — RSC library fetch, client-side filter only |
| `(dashboard)/escalations` | `docs/pages/escalations.md` — manager+ breach surface; live sla-service reads, no cache |
| `(dashboard)/elaya` | `docs/modules/elaya.md` — Elaya chat (all roles); RSC seeds conversation + transcript; client streams from `/api/elaya/chat` |
| `api/elaya/chat` | `docs/modules/elaya.md` — THE Elaya SSE endpoint (sanctioned P-02 exception); auth → burst limit → Zod → daily cap, all before any model call |
| `api/manifest` | dynamic per-icon Web App Manifest (sanctioned PWA P-02 carve-out — static JSON, the dynamic twin of `app/manifest.ts`). `GET ?icon=<key>` → validate via `isIconKey` (fallback `DEFAULT_ICON`) → `buildManifest(icon)`. No DB/session/business logic; fetched outside any auth context (proxy bypass). The root layout's `generateMetadata` points `<link rel="manifest">` here so an install bakes the user's saved icon. |
| `(dashboard)/profile` | — |
| `(dashboard)/admin/users`, `admin/ad-creatives` | `admin/ad-creatives/CLAUDE.md` |
| `(dashboard)/admin/usage` | adoption monitoring (admin/founder only) — active-time per agent per domain, today + 30-day history. RSC seeds via `usage-service.getAgentUsage`; `UsageDashboard` (`components/admin/usage/`). Active time is collected by the Redis-only heartbeat (`UsagePresence` in the dashboard layout → `recordPresenceAction`, **no DB write**), snapshotted + rolled up by two Trigger.dev jobs (`usage-snapshot` / `usage-rollup`). See changelog 2026-06-16 + `docs/architecture/caching.md` (`presence:*`). |
| `(dashboard)/settings` | `(dashboard)/settings/CLAUDE.md` |
| `api/webhooks/*` | `api/webhooks/CLAUDE.md` |

## Cross-cutting rules

- **Auth:** every `(dashboard)` layout child assumes session; pages call `getCurrentProfile()` and `redirect` when missing.
- **Route guard stays in the layout** (perf audit A-3): the `(dashboard)` layout reads `x-pathname` via `headers()` for `canAccessRoute` — this keeps the layout fully dynamic, which is correct (everything is per-user) and not a hot cost (soft navigations don't re-run it). Do not "optimise" the guard into individual pages.
- **Proxy session check is local-CPU** (perf audit A-1 follow-up): `updateSession` uses `auth.getClaims()` — ES256 signature verified against a process-cached JWKS, expired sessions still refreshed via its internal `getSession()`. Never revert to `getUser()` there (a ~50–150ms auth-server round trip per request), and never weaken `getCurrentProfile()` to claims-only — it is the authoritative Rule 09 / A-01 check (`requireProfile` wraps it for actions, A-18).
- **Suspense:** list pages use filter bar (client) + `<Suspense><*Async /></Suspense>` (server). Never fetch table data inside the filter component.
- **Webhooks + `/api/elaya/chat` + `/api/manifest` only** under `app/api/` — no other API routes (P-02; the Elaya SSE route is the sanctioned streaming exception, Decision Log 2026-06-12; `/api/manifest` is the sanctioned PWA carve-out — static per-icon manifest JSON, the dynamic twin of `app/manifest.ts`, no DB/session/business logic).
- **PWA surface:** `app/manifest.ts` (Next native convention → `/manifest.webmanifest`; exports `buildManifest(icon)` + `EARTH_CANVAS` — Earth canvas hex hardcoded by sanctioned exception, manifests can't read CSS vars), `app/api/manifest/route.ts` (the dynamic per-icon twin — `?icon=` validated, reuses `buildManifest`; the root layout's `generateMetadata` points the manifest `<link>` here so an install bakes `profiles.app_icon`), `app/apple-icon.png` (static apple-touch-icon file convention — fallback; `metadata.icons.apple` is the per-user authoritative one), `public/sw.js` + `public/offline.html` (offline shell), registered by `components/layout/ServiceWorkerRegistration.tsx` in the root layout (production-only). The home-screen-icon picker (IconSelector on `/profile`, InstallPrompt's first-install card) writes `profiles.app_icon` via the existing `updateProfile` action; the `serene-app-icon` cookie mirrors it for SSR (IconInitializer syncs it). **The SW must never cache RSC payloads, Server Action responses, or any navigation response** — page HTML is role-scoped per user; the SW intercepts GET `mode: navigate` only, network-first, and caches nothing but the static offline shell + icons. POSTs pass through untouched. The proxy matcher excludes the whole PWA surface (manifest.webmanifest/api/manifest/sw.js/offline.html/icons/apple-icon) — it is fetched outside any auth context, like the webhook bypass. Bump `CACHE_VERSION` in `sw.js` when offline.html or the icons change.
- **Feature CLAUDE.md** files hold invariants; this file is the index only.
