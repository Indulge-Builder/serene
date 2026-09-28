# /elaya: Elaya chat

> **Purpose:** spec for the `/elaya` chat page and the three other places the same chat opens: the floating Elaya button, the dashboard Elaya widget, and `/m/elaya` on the phone.
> **Audience:** engineers. · **Source-of-truth scope:** these surfaces' behaviour. How Elaya thinks, her tools and her rules live in [../modules/elaya.md](../modules/elaya.md).
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/elaya/`, `src/app/(dashboard)/layout.tsx`, `src/components/elaya/`, `src/components/dashboard/widgets/ElayaPresenceCard.tsx`, `src/app/(client)/m/elaya/`, `src/lib/services/elaya-service.ts`, `src/lib/constants/elaya.ts`, `src/lib/utils/route-access.ts`.

## 1. Purpose

The page where a teammate talks to Elaya in the app. One chat surface, `ElayaChatShell`, is
rendered in four places, so every capability appears in all of them without a fork. All four
continue the person's single active conversation, which is also the one their WhatsApp messages
to Elaya continue.

## 2. Who sees it

Everyone for whom `hasElayaAccess(profile)` is true: admin, founder, the tech workbench, and the
domains in `ELAYA_DOMAINS` (concierge and the four Gia domains). Finance, marketing, business and
guests do not. The check is the dashboard layout's `canAccessRoute`, which asks `hasElayaAccess`
for any `/elaya` path (the route left `ALWAYS_ALLOWED_PREFIXES` on 2026-09-26); a refused visitor
is sent to `/dashboard`. Sidebar: `MAIN_NAV`, Sparkles icon, labelled "Elaya"; the founder's
sidebar lists it too.

What a person can reach once inside is decided per principal in the tool layer, never by this
page. See [../modules/elaya.md](../modules/elaya.md) section 3.

## 3. Data sources

| Need | Source |
| --- | --- |
| The seed: conversation id, transcript, greeting, messages left today, and the viewer's role and domain | `resolveElayaChatSeed(profile)` in `elaya-service.ts`. Server pages call it directly (`/elaya`, `/m/elaya`, and `/settings/elaya-playbooks` for its Try-it box); the client surfaces (the floating button, the dashboard card) call it through `getElayaChatSeedAction()` (`src/lib/actions/elaya.ts`). One function, never a re-inlined copy |
| The 24-hour session | `getOrCreateActiveConversation` (window from `session_expiry_hours`), one per user across channels |
| The greeting | `getElayaTimeGreeting` + `pickElayaDailyLine` (`constants/elaya.ts`): deterministic, no model call on load |
| Starters and the reach list | `getElayaStarters(viewer)` and `getElayaCapabilities(viewer)` (`constants/elaya.ts`): six questions and a "She can read" list that fit the person's role and domain. A `[bracket]` is a blank the person fills in |
| Sending a message | `POST /api/elaya/chat` over SSE, through `streamElayaChat()` in `components/elaya/elaya-stream.ts` (the one transport, shared with the phone screen) |

The route: session → `hasElayaAccess` (403 `elayaNotEnabled`) → 20-a-minute burst limit → Zod →
the brain switch. Today the Python brain answers and owns the cap, the session and both message
rows. Full order and the rollback path: [../modules/elaya.md](../modules/elaya.md) sections 5 and 9.

## 4. Components

| Component | Role |
| --- | --- |
| `app/(dashboard)/elaya/page.tsx` | RSC: profile → seed → `ElayaChatShell`. Renders the `<h1>` with the page-title dot and the `PageControls` cluster when `TOP_BAR_ENABLED` |
| `components/elaya/ElayaChatShell.tsx` | THE chat surface. On the page it owns the `.serene-dossier-grid--340` grid: the chat card in the wide column, a 340px rail on the right (stacked below under lg) with `ElayaFeedbackCard` (the suggestion inbox entry) above `ElayaIdentityCard`. `hideIdentity` gives chat-only; `embedded` strips the card chrome to fill a modal or widget flush; `onClose` puts a close X in the presence header |
| `components/elaya/ElayaIdentityCard.tsx` | the breathing glyph tile, "Ask her" starters (prefill the composer, never send; long prompts wrap inside the pill), "She can read" list |
| `components/elaya/ElayaMessageBubble.tsx` | bubbles; Elaya's show her breathing glyph; model text renders through `ChatMarkdown` |
| `components/elaya/ElayaStatusText.tsx` | the tool-status line ("Looking through your leads…", "Thinking…"), morphing between phrases (torph); the one place Elaya animates text |
| `DictationButton` (`variant="composer"`) | the mic in the composer's leading slot. The transcript lands as an editable draft; never auto-sends. See [../modules/voice-dictation.md](../modules/voice-dictation.md) |
| `components/elaya/ElayaWidget.tsx` | the floating button, bottom-right, on every dashboard route except `/elaya`. Mounted by the dashboard layout only when `hasElayaAccess(profile)`. Prefetches the seed and the shell chunk on hover or focus; the click opens a `Dialog` (portaled to `document.body`) with `EmbeddedElayaChat` |
| `components/elaya/EmbeddedElayaChat.tsx` | THE body of every embedded surface: resolve (or receive) the seed, render the shell in `embedded` mode, hold the seat with a breathing glyph while it loads. The shell loads with `next/dynamic` on intent |
| `components/dashboard/widgets/ElayaPresenceCard.tsx` | the dashboard widget `elaya-presence` (`constants/dashboard-widgets.ts`, `domains: ELAYA_DOMAINS`), composing `EmbeddedElayaChat` |
| `components/mobile/screens/ElayaChatScreen.tsx` | `/m/elaya`: the phone knob. Same seed, same transport, the neumorphic mobile chrome, the generic `ELAYA_STARTER_PROMPTS`, no mic. The page redirects to `/m` without `hasElayaAccess`. Mobile layer: [../modules/mobile-ops.md](../modules/mobile-ops.md) |

**The floating button's geometry** is three tokens on `:root` (`--elaya-fab-size`,
`--elaya-fab-inset`, `--elaya-fab-clearance`). Scrolling mains reserve the clearance as bottom
padding so the last row always ends above the button; `.serene-fab-clear-x` keeps right-anchored
controls (the shared `Pagination`) clear of it; a page's own floating action stacks above it with
`.serene-above-elaya-fab`. On a phone the widget fills the sheet and follows the keyboard.

## 5. States

- **Loading:** `app/(dashboard)/elaya/loading.tsx` mirrors the grid (header, chat card with a few
  bubble shapes, the rail). Embedded surfaces show the breathing glyph until the seed lands.
- **Empty conversation:** the deterministic greeting, plus the starters in the rail.
- **Streaming:** the status line morphs through the tool phrases; the reply streams in.
- **Daily cap reached:** the header says "Daily limit reached" and the composer is replaced by a
  quiet notice. There is no visible message counter. The server is the authority (a 429 with
  `capReached`).
- **Not enabled for this team:** the page redirects; the chat route answers 403 with
  `formErrors.elayaNotEnabled`.
- **Errors:** user-safe copy in a toast; a rejected send restores the draft. On the Python path
  the brain's own failure line ("my AI account has reached its usage limit, please tell the tech
  team") is saved and shown as her reply.

## 6. Invariants

- One seed function (`resolveElayaChatSeed`) and one transport (`elaya-stream.ts`) for every
  surface. Never fork the shell.
- The floating button hides on `/elaya`, so two live shells never stream on one conversation or
  count the cap twice.
- The cap and the session are enforced on the server, never only in the browser.
- Starters and dictated text only fill the composer; nothing sends without the person pressing
  send.
- Never render Elaya data that did not come from a tool round trip.
- A propose tool never changes anything in its own turn; the change lands only after the person's
  yes (see [../modules/elaya.md](../modules/elaya.md) section 7).
- Style settings, memory, notes and playbooks are context, never permission.

## 7. Open items

- `getElayaChatSeedAction()` does not ask `hasElayaAccess`; it only resolves a conversation, and
  every consumer is already gated, but a direct call by a teammate without Elaya would create an
  empty conversation row. Low risk.
- The tech workbench has Elaya on the page and the button, but not the dashboard widget:
  `widgetAllowedFor` checks the widget's `domains` (`ELAYA_DOMAINS`), which does not list `tech`.
- The page file's header comment still says `/elaya` is in `ALWAYS_ALLOWED_PREFIXES`; the code
  path is correct (the layout's `canAccessRoute`).
- The Approve/Dismiss proposal card is not built; confirmation is a typed yes or no.

## 8. Deep dive

- The customer WhatsApp Elaya never touches this page:
  [../modules/customer-welcome-blast.md](../modules/customer-welcome-blast.md).
- `/notes` (context Elaya reads): [notes.md](notes.md).
- The per-user style settings (`ElayaPersonaSettings`) and "What Elaya has learned about you"
  (`ElayaMemoryCard`) live on `/profile`: [profile.md](profile.md) and
  [../modules/elaya.md](../modules/elaya.md) sections 11 and 12.
- Teaching Elaya (playbooks, requests, training): [../modules/elaya.md](../modules/elaya.md)
  section 13.
