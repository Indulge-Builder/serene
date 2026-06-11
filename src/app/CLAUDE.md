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
| `(dashboard)/profile` | — |
| `(dashboard)/admin/users`, `admin/ad-creatives` | `admin/ad-creatives/CLAUDE.md` |
| `(dashboard)/settings` | `(dashboard)/settings/CLAUDE.md` |
| `api/webhooks/*` | `api/webhooks/CLAUDE.md` |

## Cross-cutting rules

- **Auth:** every `(dashboard)` layout child assumes session; pages call `getCurrentProfile()` and `redirect` when missing.
- **Route guard stays in the layout** (perf audit A-3): the `(dashboard)` layout reads `x-pathname` via `headers()` for `canAccessRoute` — this keeps the layout fully dynamic, which is correct (everything is per-user) and not a hot cost (soft navigations don't re-run it). Do not "optimise" the guard into individual pages.
- **Proxy session check is local-CPU** (perf audit A-1 follow-up): `updateSession` uses `auth.getClaims()` — ES256 signature verified against a process-cached JWKS, expired sessions still refreshed via its internal `getSession()`. Never revert to `getUser()` there (a ~50–150ms auth-server round trip per request), and never weaken `getCurrentProfile()` to claims-only — it is the authoritative Rule 09 / A-01 check (`requireProfile` wraps it for actions, A-18).
- **Suspense:** list pages use filter bar (client) + `<Suspense><*Async /></Suspense>` (server). Never fetch table data inside the filter component.
- **Webhooks only** under `app/api/` — no other API routes (see root CLAUDE).
- **PWA surface:** `app/manifest.ts` (Next native convention → `/manifest.webmanifest`; Earth canvas hex hardcoded by sanctioned exception — manifests can't read CSS vars), `app/apple-icon.png` (apple-touch-icon file convention), `public/sw.js` + `public/offline.html` (offline shell), registered by `components/layout/ServiceWorkerRegistration.tsx` in the root layout (production-only). **The SW must never cache RSC payloads, Server Action responses, or any navigation response** — page HTML is role-scoped per user; the SW intercepts GET `mode: navigate` only, network-first, and caches nothing but the static offline shell + icons. POSTs pass through untouched. The proxy matcher excludes the whole PWA surface (manifest/sw.js/offline.html/icons/apple-icon) — it is fetched outside any auth context, like the webhook bypass. Bump `CACHE_VERSION` in `sw.js` when offline.html or the icons change.
- **Feature CLAUDE.md** files hold invariants; this file is the index only.
