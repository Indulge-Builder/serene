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
- **Suspense:** list pages use filter bar (client) + `<Suspense><*Async /></Suspense>` (server). Never fetch table data inside the filter component.
- **Webhooks only** under `app/api/` — no other API routes (see root CLAUDE).
- **Feature CLAUDE.md** files hold invariants; this file is the index only.
