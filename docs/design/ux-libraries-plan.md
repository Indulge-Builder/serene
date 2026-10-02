# Plan: UX library adoption

> **Status: shipped 2026-08-25** (all three adoptions live; cobe and liveline stay deferred).
> See the changelog entry of the same date for the as-built record.
> **Moved:** from the repo root (`plan-libraries.md`) on 2026-09-30, kept as the record of why
> each library was adopted or deferred. The adopted libraries live inside Serene's own components:
> `AnimatedNumber` (number-flow), `CommandPalette` (cmdk) and Elaya's tool-status line (torph).

Decision plan for the six candidate libraries. Written after reading each library's docs
and surveying the codebase for what already exists (R-01 search first). The verdicts
follow one rule: a library gets in only if it upgrades a real surface Serene already has,
or unlocks one we have real data for. Nothing decorative, nothing duplicated.

Verdict summary:

| Library | Verdict | Why |
| --- | --- | --- |
| recharts | Already in | v3.8.1, 9 consumers, `useChartTokens` bridge. Nothing to do. |
| @number-flow/react | **Adopt** | Becomes the engine inside `AnimatedNumber`. One swap upgrades every stat in the app. |
| cmdk | **Adopt** | Becomes the engine inside the existing `CommandPalette`. Chrome stays ours. |
| torph | **Adopt, one surface** | Elaya's tool-status line only. She is the one presence allowed to feel alive. |
| cobe | **Defer** | No geographic data model exists. A globe today is pure decoration. |
| liveline | **Defer** | No continuously streaming numeric series exists. A live chart of sparse events looks broken. |

---

## 1. @number-flow/react (0.6.2, ~25KB unpacked)

**What we have:** `src/components/ui/AnimatedNumber.tsx`, a rAF count-up (1.4s,
ease-out-cubic) that takes an already formatted string, regex-extracts the numeric run,
and animates it. Used by StatTile (9 consumer pages), the performance MetricCard,
StatAtom, DomainTargetMeter, and 4 dashboard widgets.

**What NumberFlow adds:** true digit-roll transitions when a value changes (not a
re-count from the old number), native `Intl.NumberFormat` (en-IN lakh grouping works),
`prefix`/`suffix` props, `respectMotionPreference` on by default, and `NumberFlowGroup`
for synced multi-stat strips.

**The move (one home, R-01):** NumberFlow goes *inside* `AnimatedNumber`, which keeps
its current public API (formatted string in). The existing regex split already yields
prefix + numeric run + suffix, which maps 1:1 onto NumberFlow's props. Every consumer
upgrades in one diff with zero call-site changes. We keep the mount count-up feel by
initialising at 0 and setting the real value after mount, tuned near `COUNT_UP_MS`.

**Where it shows:** filter changes on `/subscriptions` and `/budget` stat strips,
the 30s-polling `AgentTasksWidget` count, dashboard widget refreshes, performance
tab switches. Numbers roll instead of blinking.

**Extension (the one genuinely new surface):** the mobile rooms' `MetricTile` and
`RowCount` (`src/components/mobile/rooms/room-bits.tsx`) are the biggest un-animated
number surface in the app. Wrapping their values in `AnimatedNumber` makes domain
swipes roll the stats. Same component, no fork.

**Guardrails:** `tabular-nums` stays. Reduced motion is handled by the library, but we
verify against `data-neu="dark"` and both themes. No new number component is created.

## 2. cmdk (1.1.1, ~19KB unpacked)

**What we have:** a complete hand-rolled palette (`src/components/ui/CommandPalette.tsx`
plus `CommandPaletteProvider`), with a debounced server search action, role-gated goto
pages, lazy mount, and its own motion and elevation tokens. It works.

**What cmdk adds:** the part hand-rolled palettes always get wrong. Screen-reader
tested combobox semantics, `aria-activedescendant` management, ranked fuzzy filtering
of static items (actions + 14 goto pages, currently plain matching), keyword aliases,
and `Group`/`Empty`/`Loading` structure. It is fully unstyled.

**The move:** swap the interior of `CommandPalette.tsx` onto bare `<Command>` parts.
Not `Command.Dialog` (that pulls Radix Dialog; our portal, scrim, `PALETTE_DURATION`
motion, and blur contract stay exactly as they are). Server results render with
`shouldFilter` off for that section since the action already ranks them; static
actions and goto pages get cmdk's filtering with keyword aliases ("prefs" finds
Settings). Styling via the `cmdk-*` data attributes, tokens only.

**Guardrails:** the file keeps its name and mount point. `paletteSearchAction`,
`useDebounce`, `canAccessRoute` gating, and `useMountOnFirstOpen` are untouched.
Visually the palette should look identical after the swap.

## 3. torph (0.1.0, dependency-free)

**What we have:** nothing morphs, scrambles, or animates text anywhere today. That is
mostly correct for a luxury ops tool, and it stays that way.

**The one surface that earns it:** Elaya's tool-status line. `elaya-stream.ts` rotates
~25 phrases ("Looking through your leads…" → "Pulling your numbers…") with a plain
swap. Morphing between phrases is contained, brand-true (Elaya is the presence that
breathes), and reaches desktop and mobile chat through the one shared transport.

**The move:** wrap the status line rendering in `<TextMorph>` where the status text is
displayed (desktop `ElayaChatShell` and mobile `ElayaChatScreen` share the stream;
the morph lives in the shared status component, one place). Spring config from taste,
duration under the `PAGE_DURATION` ceiling.

**Deliberate non-uses:** the dashboard greeting (random per load, never changes at
runtime, nothing to morph), the mobile greeting (server-computed for hydration
agreement, a client scramble would flash), page titles, empty states, the Elaya
message stream itself (ChatMarkdown owns half-streamed tokens; character animation
around it would fight the parser).

**Risk note:** v0.1.0. It is dependency-free and isolated to one non-critical line.
If it misbehaves, removal is a one-file revert. We gate it with `useReducedMotion`
ourselves rather than trusting the library.

## 4. cobe: defer

`leads` has only a sparsely populated `city` (no country, no lat/lng), the business is
structurally India-only (IST everywhere, INR ladder, domains are business functions,
not geographies), and no aggregation query exists to feed a globe. A globe today is
exactly the decoration the brief says to avoid.

**The future case that would change this:** `service_cases` carries `city` + `country`,
which is where the concierge actually delivered. If that dataset grows international,
a small "delivered across the world" moment (helpdesk or a brand surface) fed by a new
aggregation RPC would be genuinely meaningful, and cobe's 5KB footprint fits. Revisit
then. Not installed now.

## 5. liveline: defer

Every chart in Serene is seeded once from the server and re-renders on filter change.
The realtime layer (8 Supabase channels) carries discrete events, a few per hour, not
a continuous numeric series. liveline's sweet spot is 60fps streaming values; feeding
it sparse events produces a flat line that reads as broken. It is also v0.0.7 with its
own light/dark theming that sits outside our token system.

**The future case:** a genuinely streaming metric, for example live inbound lead rate
on `/budget` during an active campaign blast, or WhatsApp message throughput. If one
ships, liveline is the right tool and `resolveColorMap()` already gives it hex accents.
Not installed now.

## 6. recharts

Already the chart layer (3.8.1, dynamic imports, `ChartSkeleton`, token bridge, max 3
colours per chart). No action.

---

## Build order

1. **NumberFlow inside AnimatedNumber** + mobile `MetricTile`/`RowCount` adoption.
   Verify: en-IN grouping, currency strings, percent strings, dark mode, reduced motion,
   `/subscriptions` filter change, dashboard widget refresh.
2. **cmdk inside CommandPalette.** Verify: identical visuals, keyboard nav, screen
   reader pass, role gating unchanged, server results ordering preserved.
3. **torph on the Elaya status line.** Verify: desktop + mobile chat, reduced motion,
   mid-stream status swaps.

Each step: `pnpm typecheck`, `pnpm lint`, the token build gate, a changelog entry, and
registry-row updates in CLAUDE.md where a canonical home changes. `graphify update .`
after code lands.

Hard constraints carried through all three: no bare `{ motion }` framer import inside
anything we write (LazyMotion strict throws), tokens only (the build gate greps for raw
colours), transform and opacity only, nothing over the 500ms ceiling.
