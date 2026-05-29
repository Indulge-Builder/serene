# Eia — Design System

### Version 1.0

> The single source of truth for every visual decision in Eia.
> Every colour, font, space, radius, shadow, animation, and component lives here.
> Nothing is hardcoded anywhere else. Everything derives from this file.

---

## 0. Design Philosophy

Eia is a luxury operating system for people who run a world-class concierge brand. The people using it spend 8-12 hours a day inside it. The design must be calm enough to never tire them, precise enough to earn their trust, and refined enough to reflect the brand they represent.

- The two-layer shell: dark textured canvas + floating cream paper content area
- Playfair Display for headings — it is the editorial soul of the brand
- The sidebar-left, content-right layout
- The paper shadow treatment that makes the content float, uplifted, with depth
- Subtle grain texture on both the canvas and the paper surface so it looks premium

**What we fix:**

- Every colour comes from a token. Zero hardcoded hex anywhere.
- One elevation system. One radius system. Both consistent everywhere.
- Semantic tokens — so one day, if we add a true dark mode, we change 10 values not 400 files.
- Responsive from day one. Every component built mobile → tablet → desktop.

---

## THE SURFACE CONTRACT

**Memorise this before writing a single className.**
Every text colour decision in Eia flows from one rule:

| Surface you are on                                                              | Token to use for text                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--theme-paper` (cream/white — the content area)                                | `--theme-text-primary`                                                |
| `--theme-paper-subtle` (inset areas, sidebar rail bg)                           | `--theme-text-primary`                                                |
| `--theme-canvas` (the dark shell behind everything)                             | `--theme-canvas-text`                                                 |
| `--theme-accent` (coloured fills — buttons, active badges)                      | `--theme-accent-fg`                                                   |
| `--color-success` / `--color-danger` / `--color-warning` / `--color-info` fills | Use the matching `*-text` token (e.g. `--color-success-text`)         |
| Secondary labels on paper                                                       | `--theme-text-secondary`                                              |
| Placeholders, timestamps, muted labels on paper                                 | `--theme-text-tertiary`                                               |
| Sidebar nav items                                                               | `--theme-sidebar-text` (inactive) / `--theme-sidebar-active` (active) |

**The two tokens most commonly misused:**

- `--theme-text-inverse` — this is the paper colour used as text on the darkest fills. Use it only for text sitting directly on `--theme-canvas` or `--theme-accent` fills that need maximum contrast. For most canvas text, prefer `--theme-canvas-text` which has the correct opacity.
- `--theme-accent-fg` — always use this for text ON accent-coloured fills (button labels, active pill text). Never use `--theme-text-inverse` on accent fills — they are different surfaces.

## 1. The Five Themes

Eia ships with five themes. Each theme is a complete colour palette applied to every token in the system. Switching themes changes everything — backgrounds, accents, borders, badges, buttons — globally.

The default theme is **Earth**. Users choose their theme in profile settings.

---

# Theme 01 — Earth (Default)

> Warm. Grounded. Heritage.
> When Earth is active, Eia looks and feels eye pleasing, asthetic, magentic, easy on eyes, beutiful, new gen soft, warm, thats gives psycologiacl relief and never strainf our user.

## Token Map: Earth

| Earth Token                   | Atlas Source                                 | Value                    |
| ----------------------------- | -------------------------------------------- | ------------------------ |
| `--theme-canvas`              | `--color-sidebar-bg`                         | `#0d0c0a`                |
| `--theme-accent`              | `--color-brand-gold`                         | `#D4AF37`                |
| `--theme-accent-hover`        | `--color-brand-gold-dark` (deep)             | `#a88b25`                |
| `--theme-accent-muted`        | `--color-brand-gold-light`                   | `#7a6b5d`                |
| `--theme-sidebar-active-pill` | Active left bar — `#D4AF37`                  | `#D4AF37`                |
| `--theme-text-primary`        | Primary body text                            | `#1a1a1a`                |
| `--theme-text-secondary`      | Secondary/muted text                         | `#6b6b6b`                |
| `--theme-text-tertiary`       | `--color-taupe`                              | `#b5a99a`                |
| `--theme-sidebar-text`        | Inactive nav (implied dark sidebar)          | `rgba(255,255,255,0.55)` |
| `--theme-sidebar-active`      | Active nav text — `#D4AF37` rendered on dark | `#D4AF37`                |
| `--theme-sidebar-hover-bg`    | `--color-sidebar-hover` `#1a1a1a`            | `rgba(255,255,255,0.06)` |
| `--theme-sidebar-active-bg`   | `--color-sidebar-active` `#1e1a0a`           | `rgba(212,175,55,0.10)`  |

---

## CSS — Earth Theme

```css
/* ============================================================
   THEME 01 — EARTH
   ============================================================ */

[data-theme="earth"] {
  /* --- Canvas ------------------------------------------------ */
  --theme-canvas: #0d0c0a;
  --theme-canvas-glow: rgba(212, 175, 55, 0.08);
  --theme-canvas-text: rgba(255, 255, 255, 0.85);
  /* Earth-specific canvas atmosphere — other themes define their own when enhanced */
  --theme-canvas-grain-opacity: 0.055;
  --theme-canvas-gradient-1: radial-gradient(
    ellipse 70% 55% at 8% 8%,
    rgba(130, 95, 52, 0.16) 0%,
    transparent 60%
  );
  --theme-canvas-gradient-2: radial-gradient(
    ellipse 55% 70% at 92% 92%,
    rgba(72, 78, 56, 0.13) 0%,
    transparent 60%
  );
  --theme-canvas-gradient-3: radial-gradient(
    ellipse 18% 100% at 0% 50%,
    rgba(95, 83, 72, 0.06) 0%,
    transparent 100%
  );

  /* --- Paper ------------------------------------------------- */
  --theme-paper: #ffffff;
  --theme-paper-subtle: #f9f9f6;
  --theme-paper-border: #e5e4df;

  /* --- Accent ------------------------------------------------ */
  --theme-accent: #d4af37;
  --theme-accent-hover: #a88b25;
  --theme-accent-muted: #7a6b5d;
  --theme-accent-surface: rgba(212, 175, 55, 0.1);
  --theme-accent-fg: #0a0a0a;

  /* --- Text -------------------------------------------------- */
  --theme-text-primary: #1a1a1a;
  --theme-text-secondary: #6b6b6b;
  --theme-text-tertiary: #b5a99a;
  --theme-text-inverse: #ffffff;

  /* --- Sidebar ---------------------------------------------- */
  --theme-sidebar-bg: #0d0c0a;
  --theme-sidebar-border: #2a2a2a;
  --theme-sidebar-text: rgba(255, 255, 255, 0.55);
  --theme-sidebar-active: #d4af37;
  --theme-sidebar-hover-bg: #1a1a1a;
  --theme-sidebar-active-bg: #1e1a0a;
  --theme-sidebar-active-pill: #d4af37;
}
```

## Usage Note for Cursor / Claude Code

When implementing Earth theme:

1. The `[data-theme="earth"]` attribute goes on the `<html>` element
2. The default (no attribute) should also resolve to Earth — set it as the `:root` fallback
3. `--theme-accent-fg` is `#0a0a0a` (dark) — all buttons and filled badges using `--theme-accent` as background must use this for text, not white
4. The sidebar has its own explicit bg token `--theme-sidebar-bg` — do not use `--theme-canvas` for sidebar background, they happen to be the same value in Earth but will differ in other themes
5. Canvas atmosphere is composed by `.layout-canvas` in `globals.css` — grain SVG (shared) + `--theme-canvas-gradient-*` tokens (Earth-only today). See Section 3.5.

# Theme 02 — Air

> Still. Luminous. Breathless.
> The sky before sunrise over Cappadocia. Cold high air. The colour of held breath and quiet thought.
> Air is Eia at its most focused — when the user needs clarity, not warmth.

---

## Token Map: Air

| Air Token                     | Inspiration                                     | Value                       |
| ----------------------------- | ----------------------------------------------- | --------------------------- |
| `--theme-canvas`              | Sky at 5:47am — deep blue-black, suspended      | `#07090f`                   |
| `--theme-canvas-glow`         | First light — cool blue wash, barely there      | `rgba(148, 174, 214, 0.07)` |
| `--theme-canvas-text`         | Text on dark sky                                | `rgba(255, 255, 255, 0.82)` |
| `--theme-paper`               | Morning haze — white with a breath of blue      | `#f7f8fc`                   |
| `--theme-paper-subtle`        | Mist on still water — inset, quieter            | `#eef0f6`                   |
| `--theme-paper-border`        | The edge where haze meets light                 | `#dde0ea`                   |
| `--theme-accent`              | Cirrus edge — high altitude blue-grey           | `#7b9fc4`                   |
| `--theme-accent-hover`        | Deeper sky — pressure of altitude               | `#5a80a8`                   |
| `--theme-accent-muted`        | Thin air — faded, distant                       | `#a4bcd4`                   |
| `--theme-accent-surface`      | Breath on glass — accent at near-invisible fill | `rgba(123, 159, 196, 0.10)` |
| `--theme-accent-fg`           | Text on accent fills — dark enough to read      | `#ffffff`                   |
| `--theme-text-primary`        | Ink on haze paper                               | `#111827`                   |
| `--theme-text-secondary`      | Faded ink — secondary labels                    | `#64748b`                   |
| `--theme-text-tertiary`       | A whisper — timestamps, placeholders            | `#a8b4c4`                   |
| `--theme-text-inverse`        | Text on dark canvas                             | `#f7f8fc`                   |
| `--theme-sidebar-bg`          | Deep sky before sunrise                         | `#07090f`                   |
| `--theme-sidebar-border`      | A hairline — the barest horizon                 | `#181d28`                   |
| `--theme-sidebar-text`        | Stars not yet gone — inactive nav               | `rgba(255, 255, 255, 0.48)` |
| `--theme-sidebar-active`      | The exact moment the sky turns — cirrus accent  | `#94aed6`                   |
| `--theme-sidebar-hover-bg`    | A cloud passing — subtle fill                   | `rgba(255, 255, 255, 0.05)` |
| `--theme-sidebar-active-bg`   | Moonlight pooling — cool blue tint, very low    | `rgba(123, 159, 196, 0.12)` |
| `--theme-sidebar-active-pill` | The 3px breath — accent bar                     | `#7b9fc4`                   |

---

## CSS — Air Theme

```css
/* ============================================================
   THEME 02 — AIR
   The sky at 5:47am over Göreme. Cold high air.
   Cirrus-edge blue. The colour of a held breath.
   ============================================================ */

[data-theme="air"] {
  /* --- Canvas ------------------------------------------------ */
  /* Deep blue-black sky — suspended before first light          */
  --theme-canvas: #07090f;
  --theme-canvas-glow: rgba(148, 174, 214, 0.07);
  --theme-canvas-text: rgba(255, 255, 255, 0.82);

  /* --- Paper ------------------------------------------------- */
  /* Morning haze — white with the faintest suggestion of blue   */
  --theme-paper: #f7f8fc;
  --theme-paper-subtle: #eef0f6;
  --theme-paper-border: #dde0ea;

  /* --- Accent ------------------------------------------------ */
  /* Cirrus edge — the blue-grey of high altitude cold air       */
  --theme-accent: #7b9fc4;
  --theme-accent-hover: #5a80a8;
  --theme-accent-muted: #a4bcd4;
  --theme-accent-surface: rgba(123, 159, 196, 0.1);
  --theme-accent-fg: #ffffff;

  /* --- Text -------------------------------------------------- */
  /* Ink pressed into haze — clear but never harsh               */
  --theme-text-primary: #111827;
  --theme-text-secondary: #64748b;
  --theme-text-tertiary: #a8b4c4;
  --theme-text-inverse: #f7f8fc;

  /* --- Sidebar ---------------------------------------------- */
  /* The deep sky — balloons rising, stars not yet gone          */
  --theme-sidebar-bg: #07090f;
  --theme-sidebar-border: #181d28;
  --theme-sidebar-text: rgba(255, 255, 255, 0.48);
  --theme-sidebar-active: #94aed6;
  --theme-sidebar-hover-bg: rgba(255, 255, 255, 0.05);
  --theme-sidebar-active-bg: rgba(123, 159, 196, 0.12);
  --theme-sidebar-active-pill: #7b9fc4;
}
```

---

## Usage Note for Cursor / Claude Code

1. `[data-theme="air"]` on the `<html>` element activates this theme
2. `--theme-accent-fg` is `#ffffff` — unlike Earth, Air's accent is dark enough for white text
3. Paper surfaces carry a blue undertone — do not override with pure white `#ffffff` anywhere in Air
4. The sidebar active state is a cool blue-grey, never gold — any hardcoded `#D4AF37` references
   from Earth will break Air's visual language; use `var(--theme-sidebar-active)` throughout
5. Canvas glow is extremely subtle — do not increase its opacity; Air's power is in restraint

# Theme 03 — Water

> Deep. Fluid. Ancient memory.
> The North Atlantic in November. Múlafossur falling into the sea.
> Water is Eia in its most contemplative state — depth without heaviness, calm without stillness.

---

## Token Map: Water

| Water Token                   | Inspiration                                          | Value                       |
| ----------------------------- | ---------------------------------------------------- | --------------------------- |
| `--theme-canvas`              | North Atlantic deep — darkness with depth, not void  | `#060d0f`                   |
| `--theme-canvas-glow`         | Bioluminescence — the sea's own cold light           | `rgba(56, 178, 172, 0.07)`  |
| `--theme-canvas-text`         | Text on deep water                                   | `rgba(255, 255, 255, 0.83)` |
| `--theme-paper`               | Múlafossur foam — white that has been moving forever | `#f4fafa`                   |
| `--theme-paper-subtle`        | Shallow tidal pool — inset, cooler                   | `#e8f4f4`                   |
| `--theme-paper-border`        | Waterline — the edge where still meets moving        | `#cde4e4`                   |
| `--theme-accent`              | Shallow over volcanic rock — that 3-foot miracle     | `#2a9d8f`                   |
| `--theme-accent-hover`        | Deeper pull — water darkening with depth             | `#1f7a6e`                   |
| `--theme-accent-muted`        | Sea glass — worn smooth, faded, carried far          | `#6abfb8`                   |
| `--theme-accent-surface`      | Tide on stone — accent barely covering the surface   | `rgba(42, 157, 143, 0.10)`  |
| `--theme-accent-fg`           | Text on teal fills                                   | `#ffffff`                   |
| `--theme-text-primary`        | Deep ink — the colour of the deep before it's black  | `#0d1f1e`                   |
| `--theme-text-secondary`      | Kelp shadow — secondary, present but receding        | `#4a7a78`                   |
| `--theme-text-tertiary`       | Sea mist — timestamps, placeholders                  | `#8ab8b5`                   |
| `--theme-text-inverse`        | Foam — text on dark fills                            | `#f4fafa`                   |
| `--theme-sidebar-bg`          | The deep — past where light reaches                  | `#060d0f`                   |
| `--theme-sidebar-border`      | Thermocline — the boundary layer, barely visible     | `#0f2020`                   |
| `--theme-sidebar-text`        | Phosphorescence — inactive nav, barely glowing       | `rgba(255, 255, 255, 0.46)` |
| `--theme-sidebar-active`      | Shallow teal — the accent where life lives           | `#4dbdb5`                   |
| `--theme-sidebar-hover-bg`    | A current passing — the softest fill                 | `rgba(255, 255, 255, 0.05)` |
| `--theme-sidebar-active-bg`   | Cold upwelling — teal tint rising from the deep      | `rgba(42, 157, 143, 0.12)`  |
| `--theme-sidebar-active-pill` | The 3px current — accent bar                         | `#2a9d8f`                   |

---

## CSS — Water Theme

```css
/* ============================================================
   THEME 03 — WATER
   The North Atlantic in November. Múlafossur falling into the sea.
   Bioluminescent dark. Volcanic teal. Foam-white paper.
   Water remembers everywhere it has been.
   ============================================================ */

[data-theme="water"] {
  /* --- Canvas ------------------------------------------------ */
  /* Deep ocean — darkness that has depth, not absence           */
  --theme-canvas: #060d0f;
  --theme-canvas-glow: rgba(56, 178, 172, 0.07);
  --theme-canvas-text: rgba(255, 255, 255, 0.83);

  /* --- Paper ------------------------------------------------- */
  /* Múlafossur foam — white that has been moving for centuries  */
  --theme-paper: #f4fafa;
  --theme-paper-subtle: #e8f4f4;
  --theme-paper-border: #cde4e4;

  /* --- Accent ------------------------------------------------ */
  /* Shallow water over dark volcanic rock — 3 feet of miracle   */
  --theme-accent: #2a9d8f;
  --theme-accent-hover: #1f7a6e;
  --theme-accent-muted: #6abfb8;
  --theme-accent-surface: rgba(42, 157, 143, 0.1);
  --theme-accent-fg: #ffffff;

  /* --- Text -------------------------------------------------- */
  /* Ink that knows the ocean — deep, never harsh                */
  --theme-text-primary: #0d1f1e;
  --theme-text-secondary: #4a7a78;
  --theme-text-tertiary: #8ab8b5;
  --theme-text-inverse: #f4fafa;

  /* --- Sidebar ---------------------------------------------- */
  /* The deep — past where light reaches, alive with cold glow   */
  --theme-sidebar-bg: #060d0f;
  --theme-sidebar-border: #0f2020;
  --theme-sidebar-text: rgba(255, 255, 255, 0.46);
  --theme-sidebar-active: #4dbdb5;
  --theme-sidebar-hover-bg: rgba(255, 255, 255, 0.05);
  --theme-sidebar-active-bg: rgba(42, 157, 143, 0.12);
  --theme-sidebar-active-pill: #2a9d8f;
}
```

---

## Usage Note for Cursor / Claude Code

1. `[data-theme="water"]` on the `<html>` element activates this theme
2. `--theme-accent-fg` is `#ffffff` — teal is dark enough to carry white text cleanly
3. Paper carries a cyan-green undertone — `#f4fafa` not `#ffffff`. Never override with pure white
   in Water; it will feel clinical and break the immersion
4. `--theme-text-secondary` is `#4a7a78` — notably more chromatic than Earth or Air secondaries.
   This is intentional. Water's secondary text has colour in it, like depth has colour in it
5. The sidebar border `#0f2020` is almost invisible against the canvas — a thermocline, not a wall.
   Do not increase its contrast; the borderlessness is the point
6. Canvas glow is bioluminescent teal — do not increase opacity. Restraint is the entire philosophy

---

### # Theme 04 — Fire

> Alive. Unapologetic. Ancient exhale.
> Stromboli at 2am. The earth cracking open and breathing out.
> Fire is Eia at its most awake — high energy, high focus, zero compromise.

## Token Map: Fire

| Fire Token                    | Inspiration                                             | Value                       |
| ----------------------------- | ------------------------------------------------------- | --------------------------- |
| `--theme-canvas`              | Cooled basalt — charcoal that was once liquid           | `#0c0905`                   |
| `--theme-canvas-glow`         | Lava light bleeding through crust — amber heat radiance | `rgba(224, 107, 28, 0.10)`  |
| `--theme-canvas-text`         | Text above the fire                                     | `rgba(255, 255, 255, 0.87)` |
| `--theme-paper`               | Ash-filtered daylight — warm white, never clean         | `#fdf8f3`                   |
| `--theme-paper-subtle`        | Cooled pumice surface — inset, slightly darker          | `#f5ede2`                   |
| `--theme-paper-border`        | The crust line — warm amber-brown edge                  | `#e8d5bf`                   |
| `--theme-accent`              | Fresh lava break — that nameless colour, approximated   | `#e05c1a`                   |
| `--theme-accent-hover`        | Deeper into the breach — the hotter core                | `#c04510`                   |
| `--theme-accent-muted`        | Cooling ember — amber pulling back from orange          | `#d4875a`                   |
| `--theme-accent-surface`      | Heat shimmer on stone — barely visible warmth           | `rgba(224, 92, 26, 0.10)`   |
| `--theme-accent-fg`           | Text on fire fills — must survive the heat              | `#ffffff`                   |
| `--theme-text-primary`        | Carbon ink — dark, absolute, forged                     | `#1a0f08`                   |
| `--theme-text-secondary`      | Warm soot — secondary, still carries heat               | `#7a5540`                   |
| `--theme-text-tertiary`       | Ash drift — placeholders, timestamps, fading            | `#b89880`                   |
| `--theme-text-inverse`        | Pale ash — text on dark fills                           | `#fdf8f3`                   |
| `--theme-sidebar-bg`          | Basalt dark — the cooled face of the mountain           | `#0c0905`                   |
| `--theme-sidebar-border`      | Fault line — the hairline crack before the breach       | `#261408`                   |
| `--theme-sidebar-text`        | Starlight through ash — inactive nav, amber-dimmed      | `rgba(255, 235, 210, 0.45)` |
| `--theme-sidebar-active`      | The break — active nav in lava colour                   | `#f07840`                   |
| `--theme-sidebar-hover-bg`    | Heat rising — the softest amber fill                    | `rgba(255, 200, 150, 0.06)` |
| `--theme-sidebar-active-bg`   | Magma pooling — deep amber tint beneath active item     | `rgba(224, 92, 26, 0.13)`   |
| `--theme-sidebar-active-pill` | The 3px breach — molten left bar                        | `#e05c1a`                   |

---

## CSS — Fire Theme

```css
/* ============================================================
   THEME 04 — FIRE
   Stromboli at 2am. The earth exhaling.
   Cooled basalt canvas. Lava-break accent.
   The colour that has no name in any language.
   ============================================================ */

[data-theme="fire"] {
  /* --- Canvas ------------------------------------------------ */
  /* Cooled basalt — charcoal that was once liquid               */
  --theme-canvas: #0c0905;
  --theme-canvas-glow: rgba(224, 107, 28, 0.1);
  --theme-canvas-text: rgba(255, 255, 255, 0.87);

  /* --- Paper ------------------------------------------------- */
  /* Ash-filtered daylight — warm white, carrying the event      */
  --theme-paper: #fdf8f3;
  --theme-paper-subtle: #f5ede2;
  --theme-paper-border: #e8d5bf;

  /* --- Accent ------------------------------------------------ */
  /* Fresh lava break — closest approximation of the nameless    */
  --theme-accent: #e05c1a;
  --theme-accent-hover: #c04510;
  --theme-accent-muted: #d4875a;
  --theme-accent-surface: rgba(224, 92, 26, 0.1);
  --theme-accent-fg: #ffffff;

  /* --- Text -------------------------------------------------- */
  /* Forged ink — text that survived the heat                    */
  --theme-text-primary: #1a0f08;
  --theme-text-secondary: #7a5540;
  --theme-text-tertiary: #b89880;
  --theme-text-inverse: #fdf8f3;

  /* --- Sidebar ---------------------------------------------- */
  /* The mountain face — basalt dark, fault-line border          */
  --theme-sidebar-bg: #0c0905;
  --theme-sidebar-border: #261408;
  --theme-sidebar-text: rgba(255, 235, 210, 0.45);
  --theme-sidebar-active: #f07840;
  --theme-sidebar-hover-bg: rgba(255, 200, 150, 0.06);
  --theme-sidebar-active-bg: rgba(224, 92, 26, 0.13);
  --theme-sidebar-active-pill: #e05c1a;
}
```

---

## Usage Note for Cursor / Claude Code

1. `[data-theme="fire"]` on the `<html>` element activates this theme
2. `--theme-accent-fg` is `#ffffff` — the lava-orange accent is dark enough to hold white text
3. Paper `#fdf8f3` carries a warm amber undertone — never override with pure white in Fire;
   it will feel sterile against the warm canvas and break the volcanic atmosphere
4. `--theme-sidebar-text` uses `rgba(255, 235, 210, 0.45)` — a warm amber-tinted white,
   not neutral white. Inactive nav items glow faintly amber, like starlight through ash.
   Do not replace with `rgba(255,255,255,0.45)` — the warmth is load-bearing
5. `--theme-text-secondary` is `#7a5540` — like Water, Fire's secondary text is chromatic,
   not grey. It carries the burnt-sienna warmth of the event. Never substitute with a grey
6. Canvas glow opacity is `0.10` — slightly stronger than Air and Water because fire
   actually emits light. Still restrained. Never push past `0.14`

---

### # Theme 05 — Cosmos

> Vast. Intelligent. Before everything.
> The Atacama salt flat at 3am. The Milky Way as structure, not smear.
> Cosmos is Eia at its most sovereign — the darkness that was here before the first light,
> and the light that makes the darkness legible.

---

## Token Map: Cosmos

| Cosmos Token                  | Inspiration                                                | Value                       |
| ----------------------------- | ---------------------------------------------------------- | --------------------------- |
| `--theme-canvas`              | Atacama sky — deep blue-violet dark, not black             | `#07060f`                   |
| `--theme-canvas-glow`         | Galactic core light — warm violet dust through 26,000 ly   | `rgba(139, 92, 246, 0.09)`  |
| `--theme-canvas-text`         | Starlight on dark — text above the void                    | `rgba(255, 255, 255, 0.88)` |
| `--theme-paper`               | Salt flat surface at night — white touched by violet sky   | `#f8f7fe`                   |
| `--theme-paper-subtle`        | Moonlit salt — inset, the faintest violet cast             | `#f0eefb`                   |
| `--theme-paper-border`        | The horizon line — where salt flat meets star field        | `#dddaf4`                   |
| `--theme-accent`              | Veil Nebula — ionised hydrogen at the edge of a dying star | `#8b6fd4`                   |
| `--theme-accent-hover`        | Deeper into the nebula — pressure of ionisation            | `#6d50b8`                   |
| `--theme-accent-muted`        | Distant arm — the same hue, seen through more dust         | `#b09ee0`                   |
| `--theme-accent-surface`      | Aurora trace — accent at the edge of visible               | `rgba(139, 111, 212, 0.10)` |
| `--theme-accent-fg`           | Text on nebula fills                                       | `#ffffff`                   |
| `--theme-text-primary`        | The oldest ink — deep violet-black, absolute               | `#0f0d1a`                   |
| `--theme-text-secondary`      | Dust lane — secondary, warm violet-grey                    | `#6b6485`                   |
| `--theme-text-tertiary`       | Interstellar medium — placeholders, barely there           | `#a89ec0`                   |
| `--theme-text-inverse`        | Starlight — text on dark fills                             | `#f8f7fe`                   |
| `--theme-sidebar-bg`          | The void — pre-light darkness with violet intelligence     | `#07060f`                   |
| `--theme-sidebar-border`      | Event horizon — the boundary you sense but cannot see      | `#14102a`                   |
| `--theme-sidebar-text`        | Distant stars — inactive nav, cool violet-white            | `rgba(220, 215, 255, 0.42)` |
| `--theme-sidebar-active`      | A star resolving — the accent at full luminosity           | `#a98fe8`                   |
| `--theme-sidebar-hover-bg`    | Dark matter — present, felt, invisible                     | `rgba(139, 111, 212, 0.07)` |
| `--theme-sidebar-active-bg`   | Nebula pooling — violet depth beneath the active item      | `rgba(139, 111, 212, 0.14)` |
| `--theme-sidebar-active-pill` | The 3px quasar — violet light compressed to a line         | `#8b6fd4`                   |

---

## CSS — Cosmos Theme

```css
/* ============================================================
   THEME 05 — COSMOS
   Paranal, Atacama. Salt flat at 3am. 13.4 billion light years.
   The darkness that was here before the first star.
   The intelligence that arranged everything.
   ============================================================ */

[data-theme="cosmos"] {
  /* --- Canvas ------------------------------------------------ */
  /* Atacama sky — deep blue-violet, the oldest dark             */
  --theme-canvas: #07060f;
  --theme-canvas-glow: rgba(139, 92, 246, 0.09);
  --theme-canvas-text: rgba(255, 255, 255, 0.88);

  /* --- Paper ------------------------------------------------- */
  /* Salt flat touched by violet starlight — never pure white    */
  --theme-paper: #f8f7fe;
  --theme-paper-subtle: #f0eefb;
  --theme-paper-border: #dddaf4;

  /* --- Accent ------------------------------------------------ */
  /* Veil Nebula — ionised hydrogen at the edge of transformation */
  --theme-accent: #8b6fd4;
  --theme-accent-hover: #6d50b8;
  --theme-accent-muted: #b09ee0;
  --theme-accent-surface: rgba(139, 111, 212, 0.1);
  --theme-accent-fg: #ffffff;

  /* --- Text -------------------------------------------------- */
  /* Ink from before language — deep violet-black, absolute      */
  --theme-text-primary: #0f0d1a;
  --theme-text-secondary: #6b6485;
  --theme-text-tertiary: #a89ec0;
  --theme-text-inverse: #f8f7fe;

  /* --- Sidebar ---------------------------------------------- */
  /* The void — pre-light, patient, arranged                     */
  --theme-sidebar-bg: #07060f;
  --theme-sidebar-border: #14102a;
  --theme-sidebar-text: rgba(220, 215, 255, 0.42);
  --theme-sidebar-active: #a98fe8;
  --theme-sidebar-hover-bg: rgba(139, 111, 212, 0.07);
  --theme-sidebar-active-bg: rgba(139, 111, 212, 0.14);
  --theme-sidebar-active-pill: #8b6fd4;
}
```

---

## Usage Note for Cursor / Claude Code

1. `[data-theme="cosmos"]` on the `<html>` element activates this theme
2. `--theme-accent-fg` is `#ffffff` — the nebula violet is deep enough to hold white text cleanly
3. Paper `#f8f7fe` has a violet undertone — do not override with pure white in Cosmos.
   The violet in the paper is what connects the light surfaces to the dark canvas.
   Remove it and the theme becomes a generic dark-purple UI
4. `--theme-sidebar-text` is `rgba(220, 215, 255, 0.42)` — a cool violet-white, not neutral white.
   Inactive nav items carry the colour of distant stars. Do not replace with `rgba(255,255,255,0.42)`
5. `--theme-text-secondary` is `#6b6485` — violet-grey, chromatic like Water and Fire secondaries.
   Cosmos secondary text lives in the dust lane. Never substitute with a neutral grey
6. Canvas glow `rgba(139, 92, 246, 0.09)` sits between Air and Fire in intensity — the galactic
   core emits light, but from 26,000 light years it arrives as atmosphere, not illumination
7. `--theme-sidebar-active-bg` at `0.14` is the strongest active background of all five themes —
   Cosmos rewards the active state with the most visible nebula pool. This is intentional.
   The selected item should feel like a star that has resolved out of the field

## 2. Global Design Tokens

These tokens are **always present**, regardless of theme. They do not change between themes.

/_ ============================================================
SECTION 2.1 — SEMANTIC COLOUR TOKENS
Base values are theme-agnostic and always present.
Per-theme overrides sit inside each [data-theme] block
and only touch what the paper/canvas shift demands.
============================================================ _/

/_ --- Base (Earth / fallback) ------------------------------- _/

:root {
/_ Success _/
--color-success: #3a7d52;
--color-success-light: #eaf5ee;
--color-success-text: #2a6040;

/_ Warning _/
--color-warning: #b87a10;
--color-warning-light: #fef5dc;
--color-warning-text: #8a5c08;

/_ Danger _/
--color-danger: #b83a28;
--color-danger-light: #faecea;
--color-danger-text: #8a2c1c;

/_ Info _/
--color-info: #2860a0;
--color-info-light: #e8f0fa;
--color-info-text: #1c4880;

/_ Neutral _/
--color-neutral: #6b6560;
--color-neutral-light: #f0eeea;
--color-neutral-text: #4a4540;
}
:root {
/_ Focus ring — used by all interactive elements _/
--color-focus-ring: color-mix(in srgb, var(--theme-accent) 40%, transparent);

/_ Selection highlight — text selection across the app _/
--color-selection-bg: color-mix(in srgb, var(--theme-accent) 18%, transparent);
--color-selection-text: var(--theme-text-primary);
}

/_ --- Air overrides ----------------------------------------- _/
/_ Paper is blue-tinted. Warm success/warning lights look off. _/
[data-theme="air"] {
--color-success-light: #e8f5f0; /_ cooler green tint _/
--color-warning-light: #faf4e8; /_ less amber, more neutral _/
--color-info-light: #e4eef8; /_ pulls toward Air's blue paper _/
--color-neutral-light: #edf0f5; /_ matches paper-subtle tone _/
--color-neutral: #64748b; /_ aligns with Air text-secondary _/
--color-neutral-text: #475569;
}

/_ --- Water overrides --------------------------------------- _/
/_ Paper has cyan undertone. Neutral must carry it. _/
[data-theme="water"] {
--color-success-light: #e4f5f0; /_ teal-shifted green _/
--color-success: #2a9070; /_ slightly cooler, sits with teal _/
--color-info-light: #e0f0f4; /_ teal-cool, not flat blue _/
--color-neutral-light: #e8f2f2; /_ matches Water paper-subtle _/
--color-neutral: #4a7a78; /_ Water text-secondary — chromatic _/
--color-neutral-text: #2e5a58;
}

/_ --- Fire overrides ---------------------------------------- _/
/_ Paper is amber-warm. Cool info/neutral lights look jarring. _/
[data-theme="fire"] {
--color-warning-light: #fdf0dc; /_ richer amber — fire owns warm _/
--color-warning: #c07818; /_ slightly deeper in fire's heat _/
--color-info-light: #edeaf8; /_ desaturated — fire is not cool _/
--color-info: #4a6890; /_ pulled toward warm blue-grey _/
--color-neutral-light: #f2e8e0; /_ matches Fire paper-subtle _/
--color-neutral: #7a5540; /_ Fire text-secondary — warm soot _/
--color-neutral-text: #5a3a28;
}

/_ --- Cosmos overrides -------------------------------------- _/
/_ Paper is violet-tinted. Green/red semantics need grounding. _/
[data-theme="cosmos"] {
--color-success-light: #e8f0f4; /_ desaturated — cosmos is not green _/
--color-success: #3a7a6a; /_ teal-shifted green, less jarring _/
--color-danger-light: #f4eaf2; /_ violet-shifted — danger in cosmos _/
--color-info-light: #ece8fb; /_ pulls toward Cosmos paper tone _/
--color-info: #6858b8; /_ violet-blue — feels native here _/
--color-info-text: #4a3a9a;
--color-neutral-light: #eeecf8; /_ matches Cosmos paper-subtle _/
--color-neutral: #6b6485; /_ Cosmos text-secondary — dust lane _/
--color-neutral-text: #4a4268;
}

/\* ============================================================
SECTION 2.2 — TYPOGRAPHY
Three voices. One system.

Geist Sans — the workhorse. UI, body, data, labels.
Swiss precision. Never decorative.

Playfair — the soul. Display moments, module names,
Lia's voice, empty states, hero text.
Used sparingly. Every appearance is an event.

Geist Mono — the honest one. Code, IDs, timestamps,
technical values. Never apologises for
what it is.
============================================================ \*/

/_ --- Font Family ------------------------------------------- _/

--font-sans: var(--font-geist-sans), "Geist Sans", system-ui, -apple-system, sans-serif;
--font-serif: var(--font-playfair), "Playfair Display", Georgia, serif;
--font-mono: var(--font-geist-mono), "Geist Mono", "Fira Code", monospace;

/_ ============================================================
SECTION 2.3 — TYPE SCALE
Built on a 1.250 Major Third modular scale.
Every step is a conscious decision, not a round number.
============================================================ _/

--text-2xs: 0.625rem; /_ 10px — micro labels, legal, kbd hints _/
--text-xs: 0.75rem; /_ 12px — badges, captions, table meta _/
--text-sm: 0.875rem; /_ 14px — body copy, table rows, form labels _/
--text-base: 1rem; /_ 16px — nav items, card body, default UI _/
--text-md: 1.125rem; /_ 18px — card titles, section leads _/
--text-lg: 1.25rem; /_ 20px — page sub-headings, dialog titles _/
--text-xl: 1.5rem; /_ 24px — page titles on mobile _/
--text-2xl: 1.875rem; /_ 30px — page titles on desktop _/
--text-3xl: 2.25rem; /_ 36px — hero headings, module names _/
--text-display: 3rem; /_ 48px — Lia empty state, landing hero _/
--text-giant: 4rem; /_ 64px — reserved: full-bleed moments only _/

/_ ============================================================
SECTION 2.4 — LINE HEIGHT
The vertical rhythm. The breath between lines.
Tight for display. Generous for reading. Never arbitrary.
============================================================ _/

--leading-none: 1; /_ display text, single-line labels _/
--leading-tight: 1.2; /_ headings — 2xl and above _/
--leading-snug: 1.35; /_ subheadings — lg to xl _/
--leading-normal: 1.5; /_ body copy — the default reading rhythm _/
--leading-relaxed: 1.65; /_ long-form prose, Lia responses _/
--leading-loose: 1.8; /_ small text — xs and 2xs for legibility _/

/_ ============================================================
SECTION 2.5 — LETTER SPACING
The silence between letters.
Display text is tracked out slightly — it needs room to breathe.
Body text is never tracked. Mono is never tracked.
============================================================ _/

--tracking-tighter: -0.03em; /_ large display — Playfair at 3xl+ _/
--tracking-tight: -0.01em; /_ headings — 2xl, xl _/
--tracking-normal: 0em; /_ body — never touch this _/
--tracking-wide: 0.04em; /_ UI labels, nav items, small caps _/
--tracking-wider: 0.08em; /_ badges, status pills, ALL CAPS labels _/
--tracking-widest: 0.14em; /_ section dividers, eyebrow text _/

/_ ============================================================
SECTION 2.6 — FONT WEIGHT
Named by intention, not by number.
============================================================ _/

--weight-light: 300; /_ Playfair at display sizes — rare, intentional _/
--weight-normal: 400; /_ body copy, table data, default everything _/
--weight-medium: 500; /_ nav items, card titles, form labels _/
--weight-semibold: 600; /_ page headings, dialog titles, active states _/
--weight-bold: 700; /_ strong emphasis, metric values, alert titles _/

/_ ============================================================
SECTION 2.7 — SPACING SCALE
Base unit: 4px.
Every value is a multiple of 4.
Never use arbitrary values outside this scale in components.
============================================================ _/

--space-px: 1px; /_ 1px — hairlines, borders, dividers _/
--space-0: 0rem; /_ 0px — explicit zero _/
--space-1: 0.25rem; /_ 4px — icon nudges, tight gaps _/
--space-2: 0.5rem; /_ 8px — inline gaps, badge padding _/
--space-3: 0.75rem; /_ 12px — input padding, small component gaps _/
--space-4: 1rem; /_ 16px — standard component padding _/
--space-5: 1.25rem; /_ 20px — card padding (compact) _/
--space-6: 1.5rem; /_ 24px — card padding (default) _/
--space-7: 1.75rem; /_ 28px — section gaps (tight) _/
--space-8: 2rem; /_ 32px — section gaps (default) _/
--space-10: 2.5rem; /_ 40px — section gaps (loose) _/
--space-12: 3rem; /_ 48px — page section rhythm _/
--space-14: 3.5rem; /_ 56px — large layout gaps _/
--space-16: 4rem; /_ 64px — page top padding, hero breathing room _/
--space-20: 5rem; /_ 80px — full-bleed section padding _/
--space-24: 6rem; /_ 96px — reserved for landing / Lia hero _/

/_ ============================================================
SECTION 2.8 — BORDER RADIUS SCALE
Earth is warm and rounded — never sharp, never pill-heavy.
The scale follows the same philosophy across all themes.
============================================================ _/

--radius-none: 0; /_ tables, flush-edge containers _/
--radius-xs: 0.25rem; /_ 4px — tight chips, inline code, kbd _/
--radius-sm: 0.5rem; /_ 8px — buttons, inputs, controls _/
--radius-md: 0.75rem; /_ 12px — dropdowns, tooltips, small cards _/
--radius-lg: 1rem; /_ 16px — cards, dialogs, popovers _/
--radius-xl: 1.5rem; /_ 24px — paper surface, panels, sheets _/
--radius-2xl: 2rem; /_ 32px — large feature cards, Lia surface _/
--radius-full: 9999px; /_ pills, avatars, status dots, sliders _/

/_ ============================================================
SECTION 2.9 — TYPOGRAPHIC COMPOSITIONS
Pre-composed patterns for the most common text moments.
Use these in components rather than assembling tokens each time.
============================================================ _/

/_ Eyebrow — the small label above a heading _/
--type-eyebrow:
font-family: var(--font-sans);
font-size: var(--text-xs);
font-weight: var(--weight-semibold);
letter-spacing: var(--tracking-widest);
line-height: var(--leading-none);
text-transform: uppercase;

/_ Page title — the h1 of every dashboard page _/
--type-page-title:
font-family: var(--font-serif);
font-size: var(--text-2xl);
font-weight: var(--weight-light);
letter-spacing: var(--tracking-tighter);
line-height: var(--leading-tight);

/_ Card title — the primary label inside a card _/
--type-card-title:
font-family: var(--font-sans);
font-size: var(--text-md);
font-weight: var(--weight-semibold);
letter-spacing: var(--tracking-tight);
line-height: var(--leading-snug);

/_ Body — default reading text _/
--type-body:
font-family: var(--font-sans);
font-size: var(--text-sm);
font-weight: var(--weight-normal);
letter-spacing: var(--tracking-normal);
line-height: var(--leading-normal);

/_ Label — form labels, table headers, nav items _/
--type-label:
font-family: var(--font-sans);
font-size: var(--text-sm);
font-weight: var(--weight-medium);
letter-spacing: var(--tracking-wide);
line-height: var(--leading-none);

/_ Caption — secondary descriptive text _/
--type-caption:
font-family: var(--font-sans);
font-size: var(--text-xs);
font-weight: var(--weight-normal);
letter-spacing: var(--tracking-normal);
line-height: var(--leading-loose);

/_ Mono — code, IDs, technical values _/
--type-mono:
font-family: var(--font-mono);
font-size: var(--text-sm);
font-weight: var(--weight-normal);
letter-spacing: var(--tracking-normal);
line-height: var(--leading-relaxed);

/_ Lia display — the large empty state and hero voice _/
--type-lia-display:
font-family: var(--font-serif);
font-size: var(--text-display);
font-weight: var(--weight-light);
letter-spacing: var(--tracking-tighter);
line-height: var(--leading-tight);

/\* ============================================================
SECTION 2.6 — ELEVATION & SHADOW SCALE

Philosophy:
Shadows are not decoration. They are physics.
An object floating above a surface casts a shadow
coloured by the ambient light of that surface.

On Earth's warm-black canvas, shadows are warm-black.
On Cosmos's violet canvas, shadows carry violet.
On Water's teal canvas, shadows carry teal-dark.

Two layers always:
— a tight, dark contact shadow (the object touching the surface)
— a loose, soft ambient shadow (the air between)

The contact shadow grounds. The ambient shadow lifts.
Together they tell the eye exactly how high something floats.
============================================================ \*/

/_ --- Shadow Colour Primitives ------------------------------ _/
/_ These are the raw ingredients. Do not use directly. _/
/_ Use the named elevation tokens below. _/

:root {
/_ Base shadow colour — pure black for Earth / fallback _/
--shadow-color: 0 0 0;
--shadow-color-accent: var(--theme-accent);
}

/_ Each theme tints its shadows with its own ambient light _/

[data-theme="earth"] {
--shadow-color: 10 8 2; /_ warm black — the basalt beneath gold _/
}

[data-theme="air"] {
--shadow-color: 8 12 20; /_ blue-black — cold altitude dark _/
}

[data-theme="water"] {
--shadow-color: 4 18 18; /_ teal-black — depth, not void _/
}

[data-theme="fire"] {
--shadow-color: 18 8 2; /_ amber-black — basalt holding heat _/
}

[data-theme="cosmos"] {
--shadow-color: 8 6 18; /_ violet-black — the oldest dark _/
}

/_ ============================================================
ELEVATION SCALE
============================================================ _/

/_ --- Elevation 0 — flat ------------------------------------ _/
/_ No shadow. Border does the separation work. _/
--shadow-0: none;

/_ --- Elevation 1 — card resting on paper ------------------- _/
/_ The card has barely lifted. It is almost flush. _/
/_ Contact shadow only — 1–3px, very soft. _/
--shadow-1:
0 1px 2px 0 rgb(var(--shadow-color) / 0.04),
0 1px 4px 0 rgb(var(--shadow-color) / 0.06);

/_ --- Elevation 2 — dropdown, popover, tooltip -------------- _/
/_ Floating above the page. User action caused this. _/
/_ Contact shadow + ambient lift. _/
--shadow-2:
0 2px 4px -1px rgb(var(--shadow-color) / 0.06),
0 4px 16px -2px rgb(var(--shadow-color) / 0.10),
0 1px 0 0 rgb(var(--shadow-color) / 0.04);

/_ --- Elevation 3 — modal, drawer, command palette ---------- _/
/_ High above the surface. Everything else dims beneath it. _/
/_ Three layers: contact, ambient, and the far-field diffusion._/
--shadow-3:
0 2px 4px -2px rgb(var(--shadow-color) / 0.08),
0 8px 24px -4px rgb(var(--shadow-color) / 0.14),
0 24px 48px -8px rgb(var(--shadow-color) / 0.12);

/_ --- Elevation 4 — notification, toast --------------------- _/
/_ Arrives from outside. Highest z. Most assertive. _/
--shadow-4:
0 2px 8px -2px rgb(var(--shadow-color) / 0.10),
0 12px 32px -4px rgb(var(--shadow-color) / 0.16),
0 32px 64px -8px rgb(var(--shadow-color) / 0.14),
inset 0 1px 0 rgb(255 255 255 / 0.06);

/_ ============================================================
SPECIAL SURFACE SHADOWS
============================================================ _/

/_ --- Paper shadow — the main content surface on canvas ----- _/
/_ The paper is not a card. It is a world floating in another. _/
/_ Four layers: inner highlight, edge ring, near lift, far halo_/
--shadow-paper:
inset 0 1px 0 rgb(255 255 255 / 0.055),
0 0 0 1px rgb(var(--shadow-color) / 0.18),
0 4px 24px 0 rgb(var(--shadow-color) / 0.28),
0 24px 80px 0 rgb(var(--shadow-color) / 0.42);

/_ --- Sidebar shadow — the left rail on canvas -------------- _/
/_ Subtle. It should not fight the paper. _/
--shadow-sidebar:
1px 0 0 0 rgb(var(--shadow-color) / 0.12),
4px 0 24px -4px rgb(var(--shadow-color) / 0.14);

/_ --- Inset shadow — pressed states, active inputs ---------- _/
/_ The surface pressed in. Negative elevation. _/
--shadow-inset:
inset 0 1px 3px rgb(var(--shadow-color) / 0.10),
inset 0 1px 1px rgb(var(--shadow-color) / 0.06);

/_ ============================================================
ACCENT SHADOWS
Live interactions — focus, hover glow, primary button depth.
All use color-mix against --theme-accent so they shift
automatically with every theme.
============================================================ _/

/_ --- Focus ring — keyboard navigation, input focus --------- _/
/_ 3px offset ring. Accessibility-grade visible. Accent-tinted._/
--shadow-focus:
0 0 0 2px var(--theme-paper),
0 0 0 4px color-mix(in srgb, var(--theme-accent) 55%, transparent);

/_ --- Accent ring — subtle border glow on hover ------------- _/
/_ Lighter than focus. Used on cards, nav pills, active items. _/
--shadow-accent-ring:
0 0 0 1px color-mix(in srgb, var(--theme-accent) 22%, transparent),
0 0 0 3px color-mix(in srgb, var(--theme-accent) 08%, transparent);

/_ --- Accent glow — primary button, active badge ------------ _/
/_ The button knows it is important. Two layers: _/
/_ a crisp 1px ring that traces the edge, _/
/_ a loose warm halo that diffuses beneath. _/
--shadow-accent-glow:
0 0 0 1px color-mix(in srgb, var(--theme-accent) 30%, transparent),
0 2px 8px color-mix(in srgb, var(--theme-accent) 20%, transparent),
0 4px 20px color-mix(in srgb, var(--theme-accent) 10%, transparent);

/_ --- Accent lift — primary button on hover/press ----------- _/
/_ The button lifting toward the user's finger. _/
--shadow-accent-lift:
0 0 0 1px color-mix(in srgb, var(--theme-accent) 35%, transparent),
0 4px 12px color-mix(in srgb, var(--theme-accent) 25%, transparent),
0 8px 32px color-mix(in srgb, var(--theme-accent) 12%, transparent);

/_ --- Gold shimmer — Earth only, luxury surface highlight --- _/
/_ A single warm highlight on the top edge of elevated cards. _/
/_ Only activate under [data-theme="earth"]. _/
--shadow-gold-shimmer:
inset 0 1px 0 rgba(212, 175, 55, 0.12),
0 0 0 1px rgba(212, 175, 55, 0.06);

/_ ============================================================
SECTION 2.7 — BREAKPOINTS
Mobile-first. Every value is a min-width boundary.
Eia is a dashboard — lg and above is the primary target.
sm and md exist for responsive moments, not full layouts.
============================================================ _/

--bp-xs: 480px; /_ large phone — portrait edge case _/
--bp-sm: 640px; /_ mobile landscape / small tablet _/
--bp-md: 768px; /_ tablet portrait _/
--bp-lg: 1024px; /_ desktop — primary Eia viewport _/
--bp-xl: 1280px; /_ wide desktop _/
--bp-2xl: 1536px; /_ ultra-wide / external monitor _/
--bp-3xl: 1920px; /_ reserved — full HD, data-heavy views _/

/\* ============================================================
SECTION 2.8 — MOTION & TRANSITION TOKENS

Philosophy:
Motion is not decoration. Motion is information.
Something entering deserves a different curve than
something leaving. Something responding to a tap
deserves a different speed than something loading.

Three easing families:
— Expo slow start, fast middle, abrupt settle
used for elements entering from outside
— Spring overshoots slightly, snaps back
used for interactive elements responding to touch
— In-out symmetrical, calm
used for state changes with no directionality

Four duration steps:
— instant felt, not seen — micro-responses
— fast UI feedback — hover, toggle, badge
— base the default — most transitions live here
— slow considered — panels, modals, page elements
— enter arrivals — things coming from off-screen
============================================================ \*/

/_ --- Easing Curves ----------------------------------------- _/

--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
/_ Enters fast, settles with authority.
Use for: dropdowns, drawers, toasts entering,
any element sliding in from outside the viewport. _/

--ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);
/_ Starts slow, exits fast — disappears with intent.
Use for: elements leaving, toasts dismissing,
modals closing. Never use for entering. _/

--ease-spring: cubic-bezier(0.22, 1, 0.36, 1);
/_ Has a personality. Overshoots and snaps.
Use for: buttons on press, toggles, active pill,
any element that responds directly to a tap or click. _/

--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
/_ Calm, symmetrical. No opinion about direction.
Use for: colour transitions, opacity fades,
theme switching, focus ring appearing. _/

--ease-out-soft: cubic-bezier(0.25, 0.46, 0.45, 0.94);
/_ Gentle deceleration. Less dramatic than expo.
Use for: sidebar expanding, card height changes,
any layout shift that should feel unhurried. _/

/_ --- Duration Steps ---------------------------------------- _/

--duration-instant: 100ms; /_ micro — checkbox tick, toggle snap _/
--duration-fast: 150ms; /_ UI feedback — hover fill, badge colour _/
--duration-base: 200ms; /_ default — most transitions live here _/
--duration-slow: 350ms; /_ deliberate — panel open, tab switch _/
--duration-enter: 400ms; /_ arrivals — modal, drawer, toast in _/
--duration-exit: 250ms; /_ departures — always faster than entering _/
--duration-page: 500ms; /_ page-level — route transitions, Lia load _/

/_ --- Named Transition Compositions ------------------------- _/
/_ The combinations components actually reach for. _/
/_ Use these rather than assembling curves each time. _/

/_ Hover state — colour, background, border _/
--transition-hover:
background-color var(--duration-fast) var(--ease-in-out),
color var(--duration-fast) var(--ease-in-out),
border-color var(--duration-fast) var(--ease-in-out);

/_ Focus ring — appearing on keyboard navigation _/
--transition-focus:
box-shadow var(--duration-fast) var(--ease-in-out),
outline var(--duration-fast) var(--ease-in-out);

/_ Interactive element — button, toggle, nav pill _/
--transition-interactive:
background-color var(--duration-fast) var(--ease-spring),
color var(--duration-fast) var(--ease-spring),
box-shadow var(--duration-base) var(--ease-in-out),
transform var(--duration-instant) var(--ease-spring);

/_ Panel / sheet entering _/
--transition-enter:
transform var(--duration-enter) var(--ease-out-expo),
opacity var(--duration-enter) var(--ease-out-expo);

/_ Panel / sheet leaving _/
--transition-exit:
transform var(--duration-exit) var(--ease-in-expo),
opacity var(--duration-exit) var(--ease-in-expo);

/_ Layout shift — sidebar width, card height, grid reflow _/
--transition-layout:
width var(--duration-slow) var(--ease-out-soft),
height var(--duration-slow) var(--ease-out-soft),
padding var(--duration-slow) var(--ease-out-soft),
margin var(--duration-slow) var(--ease-out-soft);

/_ Theme switch — the full canvas recolour _/
--transition-theme:
background-color var(--duration-slow) var(--ease-in-out),
color var(--duration-slow) var(--ease-in-out),
border-color var(--duration-slow) var(--ease-in-out),
box-shadow var(--duration-slow) var(--ease-in-out);

/_ Opacity only — skeleton loaders, ghost states, fade _/
--transition-fade:
opacity var(--duration-base) var(--ease-in-out);

---

## 3. Layout Structure

### 3.1 The Shell

Eia is a two-layer world.
The canvas is the earth, the sky, the ocean, the void — depending on which theme is active.
The paper is where work happens. It floats. It has weight. It has shadow.
Nothing else in the UI should compete with this hierarchy.
┌─────────────────────────────────────────────────────────────────┐
│ .layout-canvas │
│ background: var(--theme-canvas) │
│ background-image: SVG grain at 0.055 opacity + theme gradients │
│ Earth: espresso top-left, olive bottom-right, umber left rail │
│ Other themes: grain only until --theme-canvas-gradient-* defined │
│ │
│ ┌──────────┐ ┌── gap-3 (12px) ─────────────────────────────┐ │
│ │ │ │ │ │
│ │ .eia- │ │ .eia-paper │ │
│ │ sidebar │ │ background: var(--theme-paper) │ │
│ │ │ │ border-radius: var(--radius-xl) │ │
│ │ 240px │ │ box-shadow: var(--shadow-paper) │ │
│ │ fixed │ │ overflow: hidden │ │
│ │ z-40 │ │ flex: 1 │ │
│ │ │ │ min-height: calc(100dvh - 24px) │ │
│ │ bg: │ │ — dvh not vh: respects mobile browser chrome│ │
│ │ canvas │ │ │ │
│ │ shows │ │ │ │
│ │ through │ │ │ │
│ │ │ │ │ │
│ └──────────┘ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

**Two details that separate this from generic dashboard shells:**

Earth's three radial washes are placed at the corners and left rail — not centre.
A centred radial glow looks like a spotlight on a stage. Corner and edge washes
imply light entering from outside the frame. `--theme-canvas-glow` remains as a
token but Earth canvas atmosphere is driven by `--theme-canvas-gradient-1/2/3`.

The paper uses `min-height: calc(100dvh - 24px)` — `dvh` instead of `vh` because
on mobile, `100vh` includes the browser chrome and causes a scroll jump when the
address bar hides. `dvh` is dynamic — it follows the actual visible height.

---

### 3.2 Sidebar

.eia-sidebar
├── width: 240px (desktop) → 64px (tablet) → 0 / bottom-bar (mobile)
├── position: fixed, full height, z-40
├── background: var(--theme-sidebar-bg)
├── border-right: 1px solid var(--theme-sidebar-border)
├── transition: var(--transition-layout)
│
├── .sidebar-header (h-16, px-4)
│ └── wordmark / logo — Playfair Display, --text-md
│
├── .sidebar-nav (flex-1, overflow-y-auto, px-2, py-2)
│ └── .nav-item
│ ├── height: 40px
│ ├── padding: 0 var(--space-3)
│ ├── border-radius: var(--radius-md)
│ ├── color: var(--theme-sidebar-text)
│ ├── transition: var(--transition-interactive)
│ │
│ ├── :hover
│ │ └── background: var(--theme-sidebar-hover-bg)
│ │
│ └── [data-active]
│ ├── background: var(--theme-sidebar-active-bg)
│ ├── color: var(--theme-sidebar-active)
│ └── ::before — 3px × 16px pill
│ ├── position: absolute, left: 0
│ ├── background: var(--theme-sidebar-active-pill)
│ └── border-radius: 0 var(--radius-full) var(--radius-full) 0
│
├── .sidebar-section-label (--type-eyebrow, px-3, mt-6, mb-1)
│ └── domain groupings — CONCIERGE, FINANCE, TECH etc.
│
└── .sidebar-footer (h-16, px-4, border-top)
└── user avatar + name + role badge

**Responsive behaviour:**

- **Desktop `lg+`** — 240px fixed. Full labels. Section labels visible.
- **Tablet `md`** — 64px icon-only rail. Labels hidden. Section labels hidden.
  Tooltips on hover reveal the label. Active pill becomes a dot.
- **Mobile `< md`** — Sidebar off-canvas. Triggered by hamburger in TopBar.
  Slides in over canvas with `var(--transition-enter)`. Backdrop dims canvas.
  Bottom navigation bar optional for primary 4–5 nav items.

---

### 3.3 TopBar

.eia-topbar
├── height: 56px (h-14)
├── position: sticky, top: 0, z-30
├── background: var(--theme-paper) ← same as paper — no separate bg
├── border-bottom: 1px solid var(--theme-paper-border)
├── backdrop-filter: blur(8px) ← paper bleeds through on scroll
├── padding: 0 var(--space-6) md:var(--space-8)
│
├── LEFT — page title (--type-page-title at --text-lg, --weight-semibold)
│ breadcrumb on deeper pages
│
├── CENTRE — reserved (global search, Lia prompt bar)
│
└── RIGHT — action cluster
notification bell → avatar → quick actions
gap: var(--space-3)

**One rule:** The TopBar has no background of its own — it is the paper, sticky.
As content scrolls beneath it, `backdrop-filter: blur(8px)` creates the sense
that the paper is a physical surface and content is sliding under it.
Do not give TopBar a separate background colour. Ever.

---

### 3.4 Page Content Structure

Inside the paper, below the TopBar:
.eia-page
├── padding: var(--space-6) md:var(--space-8)
├── max-width: governed by content type (see below)
├── margin-inline: auto
│
├── .page-header (mb-6 md:mb-8)
│ ├── eyebrow label (--type-eyebrow — domain name, module name)
│ ├── page title (--type-page-title)
│ └── page subtitle (--type-body, --theme-text-secondary)
│
└── .page-body
└── content zones (see max-width table)

**Content width by type:**

| Zone     | Max Width            | Used For                                |
| -------- | -------------------- | --------------------------------------- |
| Narrow   | `max-w-2xl` (672px)  | Forms, settings, single-record detail   |
| Standard | `max-w-5xl` (1024px) | Task lists, lead lists, standard tables |
| Wide     | `max-w-7xl` (1280px) | CRM, analytics, multi-column dashboards |
| Full     | none                 | Messaging, Lia full-screen, map views   |

---

### 3.5 The Canvas Texture

The dashboard shell uses `.layout-canvas` (`src/app/globals.css`), applied on the
outer wrapper in `src/app/(dashboard)/layout.tsx`.

Every theme's canvas carries a subtle SVG grain texture. Earth adds three radial
warmth washes via CSS variables. Other themes omit the gradient tokens and render
a flat canvas until their atmosphere is enhanced.

```css
.layout-canvas {
  background-color: var(--theme-canvas);
  background-image:
    url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.055'/></svg>"),
    var(--theme-canvas-gradient-1),
    var(--theme-canvas-gradient-2),
    var(--theme-canvas-gradient-3);
}
```

**Grain:** `baseFrequency='0.68'`, opacity `0.055` hardcoded in the SVG data URI
(CSS variables cannot be referenced inside data URIs — one URI per theme if
intensities differ). `--theme-canvas-grain-opacity` documents the intended value.

**Earth gradients (defined in `:root` and `[data-theme="earth"]` only):**

| Token | Placement | Character |
| ----- | --------- | --------- |
| `--theme-canvas-gradient-1` | top-left (8% 8%) | Espresso warmth |
| `--theme-canvas-gradient-2` | bottom-right (92% 92%) | Olive wash |
| `--theme-canvas-gradient-3` | left rail (0% 50%) | Umber edge glow |

**Load flash prevention:** `html` and `body` in `globals.css` use `#0d0c0a` directly
(Earth default) so the canvas colour is correct before the layout wrapper mounts.

---

### 3.6 Z-Index Scale

Named. Never raw numbers in components.

```css
--z-base: 0; /* document flow                              */
--z-raised: 10; /* cards on hover, sticky table headers       */
--z-dropdown: 20; /* dropdowns, popovers, tooltips              */
--z-sticky: 30; /* TopBar, sticky section headers             */
--z-sidebar: 40; /* sidebar — above content, below overlays    */
--z-overlay: 50; /* modal backdrops, drawer backdrops          */
--z-modal: 60; /* modals, drawers, command palette           */
--z-toast: 70; /* toasts, notifications — always on top      */
--z-cursor: 80; /* Lia floating cursor, drag handles          */
```

## 4. Typography Rules

### Philosophy

Three voices. Strict roles. No improvisation.

Playfair speaks once per view — the title, the empty state, the Lia welcome.
It is the soul of the screen. Use it twice and it loses meaning.
Use it three times and it becomes wallpaper.

Geist Sans does everything else. It never competes with Playfair.
It is precise, neutral, invisible in the best way —
the way good furniture disappears when a room is working.

Geist Mono appears only when the content is technical in nature —
a record ID, a code block, a phone number, a date-time stamp.
It signals: this value is exact. Do not paraphrase it.

---

### 4.1 Display & Heading — Playfair Display

**Used for:**

- Page title in the TopBar — the primary H1 of every view
- Empty state headlines — when a module has no content yet
- Lia's welcome message and conversational display moments
- Section openers on the main dashboard (sparingly)
- Module name reveals — Gia, Sia, on their landing views

**Rules:**

- Never below `--text-lg` (20px). Playfair at small sizes loses its character
  and competes with Geist without winning.
- Preferred weight: `--weight-normal` (400) for editorial / italic moments,
  `--weight-semibold` (600) for titles with authority
- Always pair with `--tracking-tighter` (`-0.03em`) at `--text-2xl` and above.
  At large sizes, Playfair's natural spacing is too loose — it needs pulling in.
- At `--text-lg` and `--text-xl`, use `--tracking-tight` (`-0.01em`).
- Line height: always `--leading-tight` (1.2) for headings,
  `--leading-snug` (1.35) for subheadings
- Italic is a legitimate voice for Playfair — use it for Lia's tone,
  for quotes, for empty state sub-copy. Never for navigation or data.
- Maximum one Playfair instance per view at display size.
  Two Playfair headings on the same screen is one too many.

---

### 4.2 Body & UI — Geist Sans

**Used for:** everything that is not a heading and not technical —
navigation, tables, forms, badges, labels, descriptions, chat, tooltips,
button text, modal copy, section headers below H2.

**Rules:**

- Default: `--text-sm` (14px), `--weight-normal` (400), `--leading-normal` (1.5)
- Navigation items: `--text-sm`, `--weight-medium` (500), `--leading-none`
- Table headers: `--text-xs`, `--weight-semibold` (600), `--tracking-wide` — always uppercase
- Button text: `--text-sm`, `--weight-medium` (500), `--tracking-wide` (0.04em)
- Never bold (700) in body copy. Bold is a shout. Semibold is emphasis.
  If you need bold in a paragraph, the paragraph is doing too much.
- Never italic in UI. Italic is Playfair's domain.
  Geist italic only appears in code comments inside `--font-mono` blocks.

---

### 4.3 Micro Labels — Geist Sans, uppercase

The micro label is a specific pattern used throughout Eia.
It is not a font size — it is a composed style.

```css
/* The micro label — applied as a utility class: .label-micro */
font-family: var(--font-sans);
font-size: var(--text-2xs); /* 10px */
font-weight: var(--weight-semibold);
letter-spacing: var(--tracking-widest); /* 0.14em */
line-height: var(--leading-none);
text-transform: uppercase;
color: var(--theme-text-tertiary);
```

**Used for:**

- Field labels above inputs
- Section dividers in the sidebar — CONCIERGE, FINANCE, TECH
- Column headers in data tables
- Eyebrow labels above page titles
- Timestamps when space is extremely tight

**One rule:** micro labels are always uppercase and always tertiary colour.
A micro label in primary colour is a heading pretending to be a label.

---

### 4.4 Technical Values — Geist Mono

**Used for:** record IDs, phone numbers, timestamps (full ISO format),
code blocks, API keys, numerical metrics in data tables, version numbers.

**Rules:**

- Always `--font-mono`, never Geist Sans for these values
- Size: match the surrounding Geist Sans size — `--text-sm` in tables,
  `--text-xs` in badges, `--text-base` in detail views
- Never bold. Mono's character comes from its structure, not its weight.
- Colour: inherit from context — do not override to tertiary just because
  it is a technical value. A record ID in a table header is secondary.
  A record ID in a detail view primary field is primary.

---

### 4.5 Typography Hierarchy

| Level     | Font       | Size Token                  | Weight Token                          | Tracking             | Leading             | Used For                               |
| --------- | ---------- | --------------------------- | ------------------------------------- | -------------------- | ------------------- | -------------------------------------- |
| Display   | Playfair   | `--text-display`            | `--weight-light`                      | `--tracking-tighter` | `--leading-tight`   | Lia hero, empty states                 |
| H1        | Playfair   | `--text-2xl` / `--text-3xl` | `--weight-semibold`                   | `--tracking-tighter` | `--leading-tight`   | Page title in TopBar                   |
| H2        | Geist      | `--text-lg`                 | `--weight-semibold`                   | `--tracking-tight`   | `--leading-snug`    | Section headings                       |
| H3        | Geist      | `--text-md`                 | `--weight-semibold`                   | `--tracking-tight`   | `--leading-snug`    | Card titles, group headers             |
| Body      | Geist      | `--text-sm`                 | `--weight-normal`                     | `--tracking-normal`  | `--leading-normal`  | All content text                       |
| Body Lead | Geist      | `--text-base`               | `--weight-normal`                     | `--tracking-normal`  | `--leading-relaxed` | Introductory paragraphs, Lia responses |
| Small     | Geist      | `--text-xs`                 | `--weight-normal` / `--weight-medium` | `--tracking-normal`  | `--leading-loose`   | Captions, meta, helper text            |
| Micro     | Geist      | `--text-2xs`                | `--weight-semibold`                   | `--tracking-widest`  | `--leading-none`    | Uppercase labels, section dividers     |
| Mono      | Geist Mono | match context               | `--weight-normal`                     | `--tracking-normal`  | `--leading-relaxed` | IDs, timestamps, code, metrics         |

---

### 4.6 The Rules That Prevent the Common Failures

These are the mistakes that turn a premium interface into a generic dashboard.
They are written here so they never have to be fixed.

**Never mix Playfair and Geist in the same line.**
A heading is one or the other. A card title is Geist semibold.
A page title is Playfair. They do not share a line.

**Never use more than three type sizes in a single component.**
A card with `--text-2xs`, `--text-xs`, `--text-sm`, and `--text-base`
is four sizes. Pick three. The eye needs a hierarchy, not a scale demonstration.

**Never track body text.** `--tracking-normal` is zero. Leave it at zero.
Letter-spacing in body copy is a 1990s web design habit.
It signals that someone was trying to make text look designed.
Designed text does not need to try.

**Never use colour alone to convey hierarchy.**
A primary text label and a secondary text label should differ in size or weight,
not just colour. Colour-only hierarchy fails in low-vision conditions
and collapses on monochrome displays.

**Playfair italic is a mood, not an emphasis.**
`<em>` tags in Playfair contexts render italic. That is correct.
Do not use italic Playfair to emphasise a word inside a sentence.
Use it for tone — Lia's voice, a welcome, a reflection.

# Section 5 — Components

## Philosophy

Components are not features. They are the atoms of the interface.
Every screen in Eia is assembled from the same atoms.
When the atoms are right, the screens take care of themselves.

Three principles govern every component in this system:

**Restraint over expression.**
A component should not try to be beautiful on its own.
It should be invisible in the right context and precise in the wrong one.
The premium feeling comes from consistency, not from individual flourish.

**Tokens, always. Hardcoded values, never.**
Every colour, every shadow, every radius, every spacing value in every component
references a token. No exceptions. This is what makes theme-switching instant
and what makes the codebase readable in three years.

**One component, one job.**
A button is a button. It does not contain business logic.
It does not know what domain it lives in.
It receives props and renders. That is all.

---

## The Rules Cursor Follows When Building Any Component

These rules apply to every component built in Eia, now and in the future.
They are not suggestions. They are the contract.

```
RULE 01 — Token first
         Every visual property uses a CSS variable from the design system.
         No hex values. No rgb() literals. No hardcoded Tailwind colours
         like text-gray-500 or bg-white. Use text-[var(--theme-text-secondary)]
         or the equivalent utility.

RULE 02 — Transition on interactive elements, always
         Every element the user can click, hover, or focus must have
         var(--transition-interactive) or var(--transition-hover).
         A UI that does not respond to presence feels broken.

RULE 03 — Focus states are not optional
         Every interactive element must have a visible focus style using
         --shadow-focus. This is not for aesthetics. It is for keyboard
         navigation and accessibility. It ships with the component, not later.

RULE 04 — Loading states are not optional
         Any component that triggers async work must have a loading state.
         Buttons show a Loader2 spinner. Width is preserved — no layout shift.
         Lists show skeleton rows. Grids show skeleton cards.

RULE 05 — Empty states are not optional
         Any component that renders a list, table, or collection must have
         an empty state. Empty state uses --type-lia-display or --type-body
         depending on prominence. Never a blank white box.

RULE 06 — Error states are not optional
         Form fields show inline errors below the field, never above.
         Error text: text-xs --color-danger. Border: --color-danger.
         Ring: 0 0 0 3px --color-danger-light.

RULE 07 — Responsive is assumed
         Every component works at --bp-lg (desktop primary) and degrades
         gracefully to --bp-md (tablet) and --bp-sm (mobile).
         No component is desktop-only unless explicitly documented as such.

RULE 08 — No inline styles
         All custom styles go through CSS variables or Tailwind utilities.
         style={{ color: '#something' }} is a violation of Rule 01.

RULE 09 — Icons from lucide-react only
         All icons are from lucide-react. Size w-4 h-4 in most contexts,
         w-5 h-5 for prominence, w-3 h-3 for tight spaces.
         Never import from multiple icon libraries in the same component.

RULE 10 — Compound components over prop drilling
         A component with more than 5 visual sub-sections should be
         split into compound components (Card, Card.Header, Card.Body, Card.Footer)
         not solved with 12 boolean props.

RULE 11 — CVA for variants
         All variant logic uses class-variance-authority (CVA).
         No ternary chains for className. No string interpolation for variants.

RULE 12 — Framer Motion for entrance animations only
         Motion is used for: components entering the DOM, tabs switching,
         sidebar transitions, Lia responses appearing.
         Not for: hover effects (use CSS transitions), colour changes,
         or anything that runs on every render.
```

---

## Core Components

The following 12 components appear on every screen in Eia.
They are specified completely. Build them once, correctly.
Every other component in the system assembles from these.

---

### 5.01 — Button

The primary button should feel like pressing a well-made physical key.
It has depth. It responds to presence before it responds to a click.

**Variants:**

| Variant     | Background             | Text                   | Border                     | Shadow                                           |
| ----------- | ---------------------- | ---------------------- | -------------------------- | ------------------------------------------------ |
| `primary`   | `--theme-accent`       | `--theme-accent-fg`    | none                       | `--shadow-accent-glow`                           |
| `secondary` | `--theme-paper-subtle` | `--theme-text-primary` | `1px --theme-paper-border` | `--shadow-1`                                     |
| `ghost`     | transparent            | `--theme-text-primary` | none                       | none                                             |
| `outline`   | transparent            | `--theme-accent`       | `1px --theme-accent`       | none                                             |
| `danger`    | `--color-danger`       | white                  | none                       | `0 0 0 1px rgb(from --color-danger r g b / 0.2)` |
| `success`   | `--color-success`      | white                  | none                       | none                                             |

**Sizes:**

| Size           | Height | Padding | Font          | Radius        |
| -------------- | ------ | ------- | ------------- | ------------- |
| `xs`           | 28px   | `px-3`  | `--text-xs`   | `--radius-sm` |
| `sm`           | 32px   | `px-3`  | `--text-sm`   | `--radius-sm` |
| `md` (default) | 36px   | `px-4`  | `--text-sm`   | `--radius-sm` |
| `lg`           | 44px   | `px-6`  | `--text-base` | `--radius-sm` |
| `icon`         | 36px   | `w-9`   | —             | `--radius-sm` |
| `icon-sm`      | 28px   | `w-7`   | —             | `--radius-xs` |

**States:**

```
default  → resting shadow-accent-glow on primary
hover    → --theme-accent-hover bg, --shadow-accent-lift, translateY(-1px)
active   → scale(0.98) 80ms --ease-spring. The key pressing down.
focus    → --shadow-focus. The white gap ring.
loading  → Loader2 spin replaces label. Width locked. cursor-wait.
disabled → opacity-40, cursor-not-allowed, shadow removed, pointer-events-none
```

**The one rule:**
`--theme-accent-fg` on primary buttons, not `--theme-text-inverse`.
They are different tokens. On Earth, `--theme-accent-fg` is `#0a0a0a` (dark on gold).
On Air and Water, it is `#ffffff`. The button does not decide — the token does.

---

### 5.02 — Input

A quiet field. Not trying to be noticed until it needs to be.
The moment focus arrives, it signals clearly.

```
Structure:
  [Label — .label-micro, --theme-text-tertiary        ]
  [Input field                                         ]
  [Hint or error — text-xs below                       ]

Input base:
  height: h-9 (md default), h-8 (sm), h-11 (lg)
  padding: px-3
  border: 1px solid --theme-paper-border
  background: --theme-paper
  border-radius: --radius-sm
  font: --text-sm --theme-text-primary
  placeholder: --theme-text-tertiary
  transition: --transition-hover

States:
  focus  → border --theme-accent, --shadow-focus
  error  → border --color-danger, ring 0 0 0 3px --color-danger-light
  hint   → text-xs --theme-text-tertiary below field
  error  → text-xs --color-danger below field, replaces hint
```

---

### 5.03 — Badge / Pill

Status indicators, tags, labels. Elevated. Never flat.
The 1px border and subtle shadow are what separate these from painted text.

```
Base:
  display: inline-flex, align-items: center, gap: 4px
  padding: px-2.5 py-0.5 (md), px-2 py-0 (sm), px-3 py-1 (lg)
  font: --text-xs --weight-medium (md), --text-2xs (sm), --text-sm (lg)
  border-radius: --radius-full
  border: 1px solid (colour per variant)
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06)
```

**Variants:**

| Variant   | Background               | Text                   | Border                   |
| --------- | ------------------------ | ---------------------- | ------------------------ |
| `neutral` | `--color-neutral-light`  | `--color-neutral-text` | `--color-neutral-light`  |
| `success` | `--color-success-light`  | `--color-success-text` | `--color-success-light`  |
| `warning` | `--color-warning-light`  | `--color-warning-text` | `--color-warning-light`  |
| `danger`  | `--color-danger-light`   | `--color-danger-text`  | `--color-danger-light`   |
| `info`    | `--color-info-light`     | `--color-info-text`    | `--color-info-light`     |
| `accent`  | `--theme-accent-surface` | `--theme-accent`       | `--theme-accent-surface` |
| `dark`    | `--theme-canvas`         | `--theme-text-inverse` | transparent              |

**With status dot:**
Optional leading `w-1.5 h-1.5 rounded-full` in matching text colour.
Used when the badge communicates a live state — Online, Active, Processing.

---

### 5.04 — Card

The card is the primary content surface inside the paper.
It sits on the paper. It does not try to float away from it.

```
Base:
  background: --theme-paper
  border: 1px solid --theme-paper-border
  border-radius: --radius-lg
  box-shadow: --shadow-1
  overflow: hidden
  transition: --transition-hover (on interactive cards)

Interactive (hoverable) card adds:
  hover → --shadow-2, translateY(-1px)

Compound structure:
  Card              → the shell
  Card.Header       → px-5 py-4, border-b --theme-paper-border
                      bg --theme-paper-subtle (intentionally different)
  Card.Body         → px-5 py-4
  Card.Footer       → px-5 py-4, border-t --theme-paper-border
                      flex justify-end gap-3

Section label inside Card.Header:
  .label-micro (--text-2xs, --weight-semibold, uppercase, --tracking-widest)
  --theme-text-tertiary
```

**Tones (for special surfaces):**

| Tone      | Fill                     | Border                  | Use              |
| --------- | ------------------------ | ----------------------- | ---------------- |
| `default` | `--theme-paper`          | `--theme-paper-border`  | Standard         |
| `subtle`  | `--theme-paper-subtle`   | `--theme-paper-border`  | Inset zones      |
| `accent`  | `--theme-accent-surface` | `--theme-accent` at 30% | Highlighted data |
| `dark`    | `--theme-canvas`         | white at 10%            | Inverted panels  |

---

### 5.05 — Avatar

Squarish with rounded corners. Image if available. Initials if not.
Never a circle — the rounded square is more human, less icon.

```
Shape:    border-radius --radius-sm
          aspect-ratio 1:1, overflow hidden

Image:    object-cover, w-full h-full

Initials: background --theme-accent-surface
          color --theme-accent
          font --text-sm --weight-semibold (md)
          initials: first letter of first + last name

Sizes:
  xs  w-6  h-6    table rows, tight lists
  sm  w-8  h-8    sidebar footer, compact views
  md  w-10 h-10   cards, message headers (default)
  lg  w-12 h-12   profile panels
  xl  w-16 h-16   profile hero

Stack (AvatarStack):
  overlap: -8px margin-left per subsequent avatar
  max 3 visible
  overflow: +N badge — Pill sm neutral variant
  z-index stacks in reverse (first avatar on top)

Ring:
  optional 2px solid --theme-paper on dark backgrounds
  keeps avatars from bleeding into each other when stacked
```

---

### 5.06 — Modal

Two types. One for interruption, one for context.

**Type A — Overlay Modal (interruption)**

```
Overlay:    fixed inset-0, bg black/50, backdrop-blur-sm
            z-[--z-overlay]
            entrance: opacity 0→1, 200ms --ease-in-out

Container:  bg --theme-paper
            border-radius --radius-lg
            box-shadow --shadow-3
            max-w-lg w-full mx-4
            z-[--z-modal]
            entrance: translateY(8px)→0, scale(0.98)→1
                      300ms --ease-out-expo

Header:     px-6 py-4
            bg --theme-paper-subtle
            border-b 1px --theme-paper-border
            title: --text-base --weight-semibold --theme-text-primary
            close: X icon ghost button top-right

Body:       px-6 py-5
            --text-sm --theme-text-primary
            --leading-normal

Footer:     px-6 py-4
            border-t 1px --theme-paper-border
            flex justify-end gap-3
```

**Type B — Contextual Panel (no overlay)**

```
Used for: info sections, highlighted data zones, Lia suggestion panels.

Container:  bg --theme-accent-surface
            border 1px --theme-paper-border
            border-radius --radius-md
            padding var(--space-4)

Title:      .label-micro --theme-accent
Body:       --text-sm --theme-text-primary
```

---

### 5.07 — Table

Clean, readable, breathing room.
The column header shade is distinct from the row shade — immediately scannable.

```
Container:
  border 1px --theme-paper-border
  border-radius --radius-md
  overflow hidden
  box-shadow --shadow-1

Header row:
  bg --theme-paper-subtle
  border-b 1px --theme-paper-border
  th: px-4 py-3
      .label-micro (--text-2xs, --weight-semibold, uppercase, --tracking-widest)
      --theme-text-tertiary
      text-left

Data rows:
  bg --theme-paper
  td: px-4 py-3, --text-sm --theme-text-primary
  border-b 1px --theme-paper-border (last row: none)
  hover: bg --theme-paper-subtle, transition-colors --duration-fast

Empty state:
  py-16 text-center
  Playfair italic --text-lg --theme-text-tertiary
  sub-text: --text-sm --theme-text-tertiary, mt-2

Loading state:
  Skeleton rows — bg --theme-paper-subtle, animate-pulse
  h-4 rounded-full, varying widths (60%, 80%, 45%, 70%) for realism

Responsive:
  Below --bp-md: table becomes card stack
  Each row → card with label: value pairs
  Table header hidden on mobile
```

---

### 5.08 — Toggle

Satisfying. Instant. The thumb lands with weight.

```
Track:
  w-10 h-6, border-radius --radius-full
  off: bg --theme-paper-border
  on:  bg --theme-accent
  transition: background --duration-fast --ease-in-out

Thumb:
  w-4 h-4 bg white border-radius full
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15)
  off: translateX(2px)
  on:  translateX(18px)
  transition: transform --duration-fast --ease-spring

Label (optional):
  --text-sm --theme-text-primary, ml-3
  Description: --text-xs --theme-text-secondary, display block below label

Disabled:
  opacity-50, cursor-not-allowed
  thumb shadow removed
```

---

### 5.09 — Dropdown / Select

The dropdown opens into the same world it came from.
It is a continuation of the surface, not a foreign object landing on top.

```
Trigger:
  h-9, px-3, gap-2, --radius-sm
  border 1px --theme-paper-border
  bg --theme-paper-subtle
  --text-sm --theme-text-primary
  ChevronDown w-3.5 h-3.5 --theme-text-tertiary
  transition: --transition-hover
  focus: --shadow-focus
  active/open: border --theme-accent

Content panel:
  bg --theme-paper
  border 1px --theme-paper-border
  border-radius --radius-md
  box-shadow --shadow-2
  py-1, min-w-[160px]
  entrance: translateY(-4px)→0, opacity 0→1
            150ms --ease-out-expo

Item:
  px-3 py-2, --text-sm --theme-text-primary
  hover: bg --theme-paper-subtle
  selected: bg --theme-accent-surface, --theme-accent
            Check icon w-4 h-4 --theme-accent, right side
  disabled: opacity-40, cursor-not-allowed

Separator:  1px --theme-paper-border, my-1
Group label: .label-micro px-3 py-1.5
```

---

### 5.10 — Search Bar

An inviting field. The cursor blinks in accent colour.
The shortcut chip tells you the keyboard knows this too.

```
Container: relative, w-full or fixed 280px (TopBar)

Icon:
  Search w-4 h-4 --theme-text-tertiary
  absolute left-3, top-50% translateY(-50%)
  always visible — does not move on focus

Input:
  pl-9, pr-4 (pr-8 when clear button present)
  h-9, --radius-sm
  bg --theme-paper-subtle
  border 1px --theme-paper-border
  --text-sm --theme-text-primary
  placeholder --theme-text-tertiary
  caret-color: --theme-accent
  transition: --transition-hover
  focus: border --theme-accent, bg --theme-paper, --shadow-focus

Clear button:
  X icon w-4 h-4 --theme-text-tertiary
  absolute right-3, top-50%
  visible only when value.length > 0
  hover: --theme-text-primary

Keyboard shortcut chip (TopBar version):
  ⌘K
  --text-2xs --font-mono
  border 1px --theme-paper-border
  bg --theme-paper-subtle
  px-1.5 py-0.5 --radius-xs
  absolute right-3
  hidden when focused or value present
```

---

### 5.11 — Message Bar

The primary input for all conversational surfaces —
Lia chat, ticket notes, team messages.
Inspired by the calm of the best messaging interfaces.

```
Container:
  w-full
  bg --theme-paper-subtle
  border 1px --theme-paper-border
  border-radius --radius-lg
  px-4 py-3 (mobile: px-3 py-2)
  focus-within: border --theme-accent, --shadow-accent-ring
  transition: --transition-hover

Layout: flex items-end gap-3

Left (optional):
  Paperclip or Smile icon
  w-5 h-5 --theme-text-tertiary
  hover: --theme-text-primary

Textarea (centre):
  flex-1, no border, no ring, no bg
  --text-sm --theme-text-primary
  --leading-relaxed
  resize: none
  min-h: 24px, max-h: 120px (5 lines)
  auto-grows with content
  placeholder: --theme-text-tertiary

Send button (right):
  w-8 h-8, --radius-sm
  disabled (empty): bg --theme-paper-border, icon --theme-text-tertiary
  enabled: bg --theme-accent, icon --theme-accent-fg
  transition: --transition-interactive
  Send icon w-4 h-4
```

---

### 5.12 — Skeleton / Loading State

The skeleton is a promise. It tells the user the shape of what is coming.
It should never be more prominent than the content it represents.

```
Base:
  bg --theme-paper-subtle
  border-radius --radius-sm
  animation: pulse 1.5s --ease-in-out infinite

Variants:
  text line:   h-4, varying widths — 80%, 60%, 70%, 45%
               gap-2 between lines, last line shorter (content feels natural)

  card:        matches Card shell — same radius, same border
               Header zone: h-8, full width
               Body: 3-4 text lines at gap-3

  table row:   cells at correct column widths
               h-4 per cell, --radius-full (softer than sharp rects)

  avatar:      w-10 h-10, --radius-sm (matches Avatar shape)

  button:      matches target button height and width

Rule: skeleton shapes must match the component they replace.
      A skeleton that looks nothing like the loaded content
      creates a layout jump that breaks trust.
```

---

## Components Built As Needed

Everything beyond the 12 above is built as the feature requires it.
When building any new component, the author consults:

1. The 12 rules at the top of this section
2. The token map in Section 2
3. The layout rules in Section 3
4. The typography rules in Section 4

And asks three questions before writing a single line:

- **Does this component already exist** in a simpler form I can extend?
- **Can this be solved with composition** of the 12 core components?
- **Am I hardcoding anything** that should be a token?

If the answer to question 1 is yes — extend, do not duplicate.
If the answer to question 2 is yes — compose, do not build.
If the answer to question 3 is yes — stop, find the token, continue.

---

## The Never-Do List

These are the patterns that appear in every large codebase
and take months to undo. They are forbidden from day one.

```
NEVER   hardcode a colour value in a component
NEVER   import from another feature's component folder directly
NEVER   build a modal wider than max-w-2xl without documented justification
NEVER   use z-index values not in the --z-* scale
NEVER   create a component that does both data fetching and rendering
        (fetch in the page/server component, render in the UI component)
NEVER   stack more than 3 Framer Motion wrappers on a single element
NEVER   write a loading state that shifts the layout when content arrives
NEVER   use text-gray-* or bg-gray-* — the neutral palette is in the tokens
NEVER   duplicate a component that already exists — extend it instead
```

# Section 5.99 — The Micro-Details

> This section exists for one reason only:
> token names tell you _what_. These recipes tell you _how they combine_.
>
> Every detail here is something that cannot be derived from the token map alone.
> These are the decisions that separate Eia from generic SaaS.
> Read this before building any of the 12 core components.
> If a detail is already covered in 5.01–5.12, it is not repeated here.

---

## 01 — The Sidebar Active State Is Three Layers

This is the most replicated pattern in Eia. It appears on every screen, every session.
Get it wrong and nothing feels right. It is always three layers together.
Remove any one and it looks like a mistake.

```
Layer 1 — fill
  background: var(--theme-sidebar-active-bg)
  This is the accent at ~10–12% opacity. The item glows without shouting.

Layer 2 — border
  border: 1px solid — the same active-bg colour at 18% opacity
  This is a FULL border on all four sides. Not left-side only.
  Left-side only looks cheap. Four sides looks intentional.

Layer 3 — pill (the detail that moves)
  position: absolute, left: 0
  width: 3px, height: 16px
  background: var(--theme-sidebar-active-pill)
  border-radius: 0 --radius-xs --radius-xs 0
  animated with Framer Motion layoutId="active-pill"
  This is what slides between nav items on route change.
  It is the soul of the sidebar. It must be animated, not toggled.
```

**Icon size in sidebar nav: `w-[15px] h-[15px]`**
Not `w-4 h-4` (16px). Not `w-3.5 h-3.5` (14px).
15px is the specific size where sidebar icons feel neither too heavy nor too thin.
This is a hardcoded exception to the icon rule. It is intentional.

**Nav item font: `text-[13px] font-medium tracking-[0.01em]`**
Not `text-sm` (14px). 13px keeps the sidebar feeling light.
14px makes it feel like body copy. The difference is one pixel. It matters.

---

## 02 — The Sidebar Logo Divider

Below the wordmark or logo, before the nav begins:

```css
height: 1px;
background: linear-gradient(
  to right,
  transparent,
  color-mix(in srgb, var(--theme-sidebar-active-pill) 22%, transparent),
  transparent
);
margin: 0 var(--space-4) var(--space-2);
```

A flat `border-b` here looks assembled. This gradient divider looks designed.
The centre of the line glows in the accent colour. The edges fade to nothing.
It costs one line of CSS and makes the sidebar feel like it has a spine.

**Logo glow:**

```css
filter: drop-shadow(
  0 0 12px color-mix(in srgb, var(--theme-accent) 30%, transparent)
);
```

The logo knows where it is. It breathes a warm glow into the dark sidebar.

---

## 03 — The TopBar Title Has a Period

The page title in the TopBar ends with a period in accent colour.

```jsx
<h1>
  Leads
  <span style={{ color: "var(--theme-accent)" }}>.</span>
</h1>
```

This is a typographic full stop. It is the Atlas signature.
It signals: this is a complete thought. This page knows what it is.
The period is in accent — gold on Earth, teal on Water, violet on Cosmos.
It is the smallest possible branding moment. It is the right one.

**TopBar background:**

```css
background: color-mix(in srgb, var(--theme-paper) 80%, transparent);
backdrop-filter: blur(12px);
border-bottom: 1px solid
  color-mix(in srgb, var(--theme-paper-border) 50%, transparent);
```

The border at 50% opacity — not full opacity. As content scrolls beneath the TopBar,
the border is a whisper, not a wall.

---

## 04 — Empty States Use Playfair Italic

Every empty state in Eia — no leads, no tasks, no messages, nothing yet — follows this pattern:

```
Icon:     w-12 h-12, --theme-text-tertiary, strokeWidth={1.5}
          mb-4, opacity 60%

Heading:  Playfair Display, text-lg, font-normal, ITALIC
          --theme-text-secondary
          Examples: "Nothing here yet."
                    "No leads to show."
                    "The queue is clear."
          Short. One sentence. Ends with a period.
          Never: "No data available" or "No results found"

Sub:      Geist Sans, text-sm, --theme-text-tertiary
          max-w-xs, leading-relaxed, mt-2
          Optional — only if there is a genuine action to suggest.

CTA:      Button primary sm, mt-6 — only when there is a direct action
```

The italic Playfair in the empty state is a design signature.
It gives the absence of data a voice — calm, not clinical.
Without it, empty states become the loudest admission that nothing was designed here.

---

## 05 — The Card Border Is the Primary Elevation Signal

```
border: 1px solid var(--theme-paper-border)   ← this is what makes the card exist
shadow: var(--shadow-1)                        ← this is secondary, supporting
```

**Border first. Always.**
If you have a border but no shadow — it looks intentional. The card is grounded.
If you have a shadow but no border — it looks like a mistake. A floating rectangle.

The shadow on a card is the breath of space between the card and the paper.
The border is the card's skin. You need both, but the border is load-bearing.

On hover:

```css
box-shadow: var(--shadow-2);
transform: translateY(-1px);
transition: var(--transition-hover);
```

The card lifts one pixel. The shadow deepens. That is all.
No colour change. No border change. Just one pixel of lift.

---

## 06 — The Focus Ring Has a White Gap

```css
box-shadow:
  0 0 0 2px var(--theme-paper),
  /* ← the white gap */ 0 0 0 4px
    color-mix(in srgb, var(--theme-accent) 55%, transparent);
```

The white gap between the element and the accent ring is not decoration.
It creates visible contrast between the focus ring and any background colour —
dark canvas, light paper, coloured surface. The ring is always visible.

Without the gap: the ring merges into dark backgrounds and becomes invisible.
With the gap: keyboard navigation is always clear, regardless of theme.

This is the accessibility detail that looks like a design detail.
It is both.

---

## 07 — Pill Shadows Are What Make Them Feel Lifted

Every badge and status pill carries:

```css
box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06);
```

This shadow is imperceptible in isolation. Side-by-side with a pill that has no shadow,
the difference is immediate. One feels printed on. One feels placed on.

Never remove this shadow in the name of "simplicity."
It is doing more visual work than its 0.06 opacity suggests.

---

## 08 — Skeleton Widths Are Not Uniform

Loading skeleton text lines use varying widths:

```
Line 1: 80%
Line 2: 60%
Line 3: 75%
Line 4: 45%   ← always shortest, signals end of content
```

Uniform width skeletons (all 100%) look like a loading bar, not a text preview.
Varying widths look like real content about to arrive.
The last line is always the shortest. Real paragraphs end before the margin.

---

## 09 — Buttons Do Not Change Width on Loading

When a button enters loading state:

```jsx
<Button loading>
  <Loader2 className="w-4 h-4 animate-spin" />
  {/* label hidden but width preserved via: */}
  <span className="sr-only">Saving</span>
</Button>
```

The button width is set by the label. On loading, the label becomes `sr-only` (screen-reader only —
still in the DOM, still occupying space, invisible to the eye). The Loader2 icon sits in the
visual centre. The button never resizes.

A button that shrinks when loading and expands when done creates a layout jump
that breaks the user's spatial memory of where the button lives.

---

## 10 — The Noise Texture Frequency Is 0.9

The canvas SVG noise texture uses `baseFrequency='0.9'`.

Below 0.6: the grain becomes visible pattern — looks like a texture pack.
Above 1.2: the grain disappears entirely — smooth rectangle again.
At 0.9: it exists only when you look for it. The canvas feels like a physical surface.
The eye registers it as material without processing it as graphics.

Never change this value. If the texture feels too strong, reduce opacity (currently 4%).
If it feels too subtle, increase opacity — maximum 6%.
Do not touch the frequency.

# Section 6 — Motion, Icons, Texture & Atmosphere

> The most expensive things in the world do not announce themselves.
> The best leather does not shine. The best wool does not itch.
> The best room does not echo. They simply feel right,
> and you cannot immediately say why.
>
> This section is about that feeling.
> Not effects. Not features. Atmosphere.

---

## 6.1 — Motion Philosophy

Eia moves the way a well-made door moves.
It has weight. It has intent. It does not slam and it does not drift.

**Three reasons motion exists in Eia:**

1. **Spatial honesty** — where did this panel come from? Where did it go?
   Motion answers these questions so the user never has to ask them.

2. **State communication** — something changed. Motion is the announcement.
   Not a flash. Not a colour pop. A movement that carries meaning.

3. **Presence feedback** — you are here. The interface knows.
   Hover, focus, press — the UI acknowledges every approach.

**Motion never exists for the fourth reason: because it looks cool.**
The moment animation becomes decoration, it becomes noise.
Noise costs attention. Attention is the most precious thing a user gives us.

---

## 6.2 — Motion Rules

```
RULE M-01 — Entrances move in one axis only
            y: 6px → 0 + opacity: 0 → 1
            Nothing scales on enter. Scaling feels like a magic trick.
            We are not doing magic tricks. We are opening doors.

RULE M-02 — Exits are faster than entrances. Always.
            The user decided to leave. Respect that decision immediately.
            Exit duration is always --duration-exit (250ms) or faster.
            Entrance is --duration-enter (400ms) or --duration-slow (350ms).

RULE M-03 — Only one element moves at a time per interaction
            If a dropdown opens, the dropdown animates.
            The trigger does not also animate. The overlay does not also animate.
            One motion per cause. Stacking animations reads as instability.

RULE M-04 — Data never flashes. Data transitions.
            Numbers counting up to their value, not jumping.
            Tables fading in row by row, not snapping.
            If data arrives, it arrives — it does not teleport.

RULE M-05 — Reduced motion is respected, always
            Every animation wraps with: useReducedMotion()
            If true: instant state changes, no transforms, opacity only.
            This is not optional. It is in the component.

RULE M-06 — Performance is the ceiling
            60fps is not a goal. It is the floor.
            Only transform and opacity are animated.
            Never animate: width, height, top, left, padding, margin.
            Layout animations use Framer Motion layoutId — never CSS width transitions.
```

---

## 6.3 — Motion Vocabulary

The complete set of animations used in Eia.
Nothing outside this list is built without a documented reason.

```css
/* --- Entrance — the standard arrival ----------------------- */
/* Every panel, card, modal, dropdown that enters the DOM      */
initial:   { opacity: 0, y: 6 }
animate:   { opacity: 1, y: 0 }
duration:  var(--duration-enter) — 400ms
easing:    var(--ease-out-expo)

/* --- Exit — the standard departure ------------------------- */
exit:      { opacity: 0, y: -4 }
duration:  var(--duration-exit) — 250ms
easing:    var(--ease-in-expo)

/* --- Modal enter ------------------------------------------- */
initial:   { opacity: 0, y: 10, scale: 0.98 }
animate:   { opacity: 1, y: 0, scale: 1 }
duration:  350ms
easing:    var(--ease-out-expo)

/* --- Modal exit -------------------------------------------- */
exit:      { opacity: 0, scale: 0.97 }
duration:  150ms
easing:    var(--ease-in-out)

/* --- Dropdown / popover enter ------------------------------ */
initial:   { opacity: 0, y: -4 }
animate:   { opacity: 1, y: 0 }
duration:  200ms
easing:    var(--ease-out-expo)

/* --- Card hover lift --------------------------------------- */
/* CSS only — not Framer. Fast enough for hover.              */
transform: translateY(-1px)
transition: var(--transition-hover) — 200ms --ease-in-out
No shadow change on transform. Shadow deepens separately via box-shadow transition.

/* --- Sidebar nav item hover -------------------------------- */
whileHover: { x: 2 }
transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }  ← ease-spring

/* --- Sidebar active pill ----------------------------------- */
Framer Motion layoutId="active-pill"
transition: { type: "spring", stiffness: 380, damping: 30 }
The pill slides between nav items. It does not toggle. It travels.
Spring physics — arrives with a tiny overshoot that settles.
This is the detail that makes the nav feel alive.

/* --- Button press ------------------------------------------ */
whileTap:  { scale: 0.97 }
transition: { duration: 0.08, ease: [0.22, 1, 0.36, 1] }
80ms. The key pressing down.

/* --- Page content entrance --------------------------------- */
initial:   { opacity: 0, y: 8 }
animate:   { opacity: 1, y: 0 }
duration:  var(--duration-page) — 500ms
easing:    var(--ease-out-expo)
stagger:   children stagger 60ms — header first, then content zones

/* --- Staggered list items ---------------------------------- */
Each item: { opacity: 0, y: 4 } → { opacity: 1, y: 0 }
duration:  200ms per item
stagger:   40ms between items — max 8 items animated, rest instant
Beyond 8: the stagger becomes too long and the user waits for their data.
```

---

## 6.4 — Lia Motion (Special)

Lia is alive in a way the rest of the UI is not.
She is not a panel. She is not a form. She is a presence.
Her animations reflect that — slower, more breathing, more organic.

```
liaBreathe — the ambient glow around Lia's avatar/glyph
  opacity: 0.35 ↔ 0.85
  duration: 3s
  easing: ease-in-out
  repeat: infinite, alternating
  This is the heartbeat. It is always running when Lia is present.
  It is the reason Lia feels alive even when she is not responding.

liaDotPulse — the thinking indicator (three dots)
  Three dots. Staggered start: 0ms / 160ms / 320ms
  Each dot: scale 0.6 → 1.0 → 0.6, duration 1.2s, ease-in-out, infinite
  Colour: var(--theme-accent) at 60% opacity
  The dots breathe. They do not bounce.
  Bouncing dots feel like a loading bar. Breathing dots feel like thought.

liaMessageArrive — each message entering the conversation
  initial:  { opacity: 0, y: 6 }
  animate:  { opacity: 1, y: 0 }
  duration: 300ms
  easing:   var(--ease-out-expo)
  No stagger between message content blocks — they arrive as one.

liaTypingCursor — the blinking cursor inside Lia's streaming text
  A 2px × 16px rect in var(--theme-accent)
  opacity: 1 ↔ 0
  duration: 500ms
  easing:   steps(1)  ← hard blink, not a fade. Cursors do not fade.
  Disappears when streaming completes.
```

---

## 6.5 — Icon System

Icons are the punctuation of the interface.
Used correctly they are invisible — the eye reads them without registering them.
Used incorrectly they become visual noise that competes with content.

**Library: `lucide-react` exclusively.**
No mixing. No fallback libraries. No inline SVGs unless a custom glyph is required
and documented with justification in the Decision Log.

**Why Lucide:**
Consistent 24px grid. 1.5px stroke default. Geometric without being sterile.
The strokes carry the same lightness as Geist Sans — they were built for the same world.

### Size Standards

| Context                   | Size                       | Stroke                                |
| ------------------------- | -------------------------- | ------------------------------------- |
| Sidebar navigation        | `w-[15px] h-[15px]`        | `1.5`                                 |
| Buttons, form fields, nav | `w-4 h-4`                  | `1.5`                                 |
| Compact / dense UI        | `w-3.5 h-3.5`              | `2` — heavier stroke at smaller sizes |
| Emphasis / standalone     | `w-5 h-5`                  | `1.5`                                 |
| Empty state illustration  | `w-10 h-10` or `w-12 h-12` | `1` — lighter, more delicate at large |
| Toast, alert header       | `w-4 h-4`                  | `2`                                   |

**The stroke width rule:**
`strokeWidth={1.5}` is the default for most contexts.
At sizes below `w-4 h-4`, increase to `strokeWidth={2}` — thin strokes at small sizes
become invisible on non-retina displays.
At empty state sizes (`w-10+`), reduce to `strokeWidth={1}` — the icon is illustrative,
not functional. It should feel drawn, not stamped.
Never `strokeWidth={1}` on interactive icons. Never `strokeWidth={2.5}` anywhere.

### Colour — Always Theme-Aware

```
Inactive / supporting:   var(--theme-text-tertiary)
Active / selected:       var(--theme-accent)
On dark fills (canvas):  var(--theme-canvas-text) at 70%
On accent fills:         var(--theme-accent-fg)
Semantic icons:
  success action:        var(--color-success)
  warning signal:        var(--color-warning)
  danger / destructive:  var(--color-danger)
  information:           var(--color-info)
```

Never hardcode icon colours.
An icon that uses `text-gray-400` will be `text-gray-400` in every theme.
An icon that uses `var(--theme-text-tertiary)` will be gold-dimmed in Earth,
blue-dimmed in Air, violet-dimmed in Cosmos.
The same icon, five personalities.

### Icon Semantic Assignments

These icons represent the same concept everywhere in Eia.
Consistency here builds the user's visual vocabulary.

```
Navigation & Structure
  Home / Dashboard:   LayoutDashboard
  Tasks:              CheckSquare
  Leads / CRM:        Users
  Finance:            BarChart2
  Settings:           Settings2
  Search:             Search
  Filter:             SlidersHorizontal
  Sort:               ArrowUpDown
  Menu / More:        MoreHorizontal (inline), MoreVertical (row actions)
  Close:              X
  Back:               ArrowLeft
  External link:      ExternalLink

Actions
  Add / Create:       Plus
  Edit:               Pencil
  Delete:             Trash2
  Save:               Check
  Cancel:             X
  Send:               Send
  Upload:             Upload
  Download:           Download
  Copy:               Copy
  Refresh:            RefreshCw

Status & Communication
  Success:            CheckCircle2
  Warning:            AlertTriangle
  Error / Danger:     AlertCircle
  Info:               Info
  Loading:            Loader2  (animate-spin)
  Notification:       Bell
  Message:            MessageSquare
  Phone:              Phone
  Email:              Mail

Data & Content
  Calendar:           Calendar
  Clock / Time:       Clock
  Tag:                Tag
  Attachment:         Paperclip
  Note:               FileText
  Link:               Link2
  Image:              Image
  Chart:              TrendingUp (growth), BarChart2 (comparison)

Lia / AI
  Lia avatar glyph:   custom SVG — the Lia mark, not a Lucide icon
  Lia thinking:       liaDotPulse (see 6.4)
  Lia suggestion:     Sparkles
  Lia action:         Zap
```

---

## 6.6 — Texture

_In Marrakech I ran my hand across a piece of hand-woven wool that cost more than
a flight to London. It was not the colour. It was not the pattern.
It was the texture — the way the surface held light differently at every angle.
That is what texture does. It proves something was made, not generated._

Texture in Eia works the same way.
It is not seen. It is felt. It is the difference between a surface that looks rendered
and a surface that looks real.

### Canvas Texture

The canvas is the world. Every theme's canvas is a different world.
The texture is what makes it a surface instead of a fill.

Implementation: `.layout-canvas` in `src/app/globals.css` (see Section 3.5).

```css
.layout-canvas {
  background-color: var(--theme-canvas);
  background-image:
    /* Layer 1 — SVG fractal grain (opacity hardcoded in data URI) */
    url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.68' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.055'/></svg>"),
    /* Layers 2–4 — theme-scoped radial washes (Earth only today) */
    var(--theme-canvas-gradient-1),
    var(--theme-canvas-gradient-2),
    var(--theme-canvas-gradient-3);
}
```

**Grain frequency: `0.68`. Noise opacity: `0.055`.**
**Gradient tokens:** Earth defines `--theme-canvas-gradient-1/2/3`. Other themes
omit them — layers resolve to `initial` and the canvas stays flat.
When enhancing Air/Water/Fire/Cosmos, define theme-specific gradient tokens;
`.layout-canvas` picks them up automatically.

### Paper Texture

The paper is where work happens. It must feel like a surface you can write on.
Not clinical white. Not blank. A surface with memory.

```css
.eia-paper {
  background-color: var(--theme-paper);
  background-image:
    /* Top edge — the paper catching light from above */
    linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.4) 0px,
      rgba(255, 255, 255, 0) 80px
    ),
    /* Very fine grain — quieter than canvas */
    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.025'/%3E%3C/svg%3E");
  background-size:
    auto,
    200px 200px;
  background-repeat: no-repeat, repeat;
}
```

The paper noise is quieter than canvas noise — frequency `0.75`, opacity `0.025`.
Canvas is a world. Paper is a desk. The desk is more refined.
The top-edge highlight (`rgba(255,255,255,0.40)` fading over 80px) gives the paper
a sense of light coming from above — as if a lamp is shining on it.
This is the detail that makes the paper feel three-dimensional without moving.

---

## 6.7 — Backdrop Blur & Atmospheric Effects

_I am going to be direct about this, because it is where most interfaces go wrong._

Backdrop blur is a material property. It means: this surface is translucent.
Light passes through it and diffuses. The world behind it is still there, just softened.

Used correctly, it signals hierarchy — this surface is above that one.
Used incorrectly, it becomes glassmorphism: a trend that aged poorly because
it prioritised the effect over the reason for the effect.

**Eia's position:** We use backdrop blur in exactly three places.
In those three places, it earns its presence. Nowhere else.

### Where Backdrop Blur Is Used

**1 — The TopBar (sticky chrome)**

```css
background: color-mix(in srgb, var(--theme-paper) 82%, transparent);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
```

The TopBar is paper, becoming translucent as it sticks.
When content scrolls beneath it, you can sense the depth — the paper is above the content.
This is spatial information, not decoration.

**2 — The Mobile Sidebar Overlay**

```css
/* The backdrop behind the drawer on mobile */
background: color-mix(in srgb, var(--theme-canvas) 60%, transparent);
backdrop-filter: blur(4px);
```

A light blur that dims the page without fully covering it.
The user knows where they came from. They can see it through the veil.

**3 — The Command Palette Overlay**

```css
background: color-mix(in srgb, black 40%, transparent);
backdrop-filter: blur(8px);
```

When the command palette opens, the entire canvas blurs behind it.
The palette is the only thing in focus. Literally.

### Where Backdrop Blur Is Never Used

```
Cards           — cards are paper on paper. No blur.
Dropdowns       — dropdowns are solid. They have a border and a shadow.
Modals          — the modal overlay is semi-transparent. No blur on the modal itself.
Tooltips        — solid. Border. Shadow. Done.
Badges / Pills  — solid. Never translucent.
Sidebar         — solid. The sidebar is the darkest thing. It should not blur.
```

### What We Use Instead of Glass

The temptation with dark themes is to reach for glass everywhere.
Earth canvas is dark. Cosmos canvas is dark. Air canvas is dark.
Floating glass cards on dark backgrounds look modern for six months
and generic for six years.

Instead of glass, Eia uses:

**Accent surfaces** — `var(--theme-accent-surface)` is the tinted fill.
It is a solid colour at low opacity. It is warmer and more intentional than blur.

**Elevation** — shadows tell the depth story.
A card with `--shadow-2` is higher than one with `--shadow-1`.
No blur required.

**Border contrast** — `var(--theme-paper-border)` against the paper is enough.
The border is the card's skin. It defines it without floating it.

The result is an interface that feels premium and grounded, not futuristic and weightless.
Weightless interfaces feel like prototypes.
Grounded interfaces feel like products.

---

## 6.8 — The Lia Glyph

Lia is not a chatbot. She is not an assistant icon.
She is a presence — named, specific, with her own visual identity inside Eia.

The Lia glyph is a custom SVG mark — not a Lucide icon.
It lives at `src/components/ui/lia-glyph.tsx`.

**Visual character:**

- Minimal. A geometric mark, not an illustration.
- Carries the `liaBreathe` animation at all times when Lia is present.
- Rendered in `var(--theme-accent)` — gold in Earth, teal in Water, violet in Cosmos.
- The glow behind it: `filter: drop-shadow(0 0 8px color-mix(in srgb, var(--theme-accent) 40%, transparent))`
- Never static. The breathing is always running.
- Sizes: `sm` (24px) inline in TopBar or chat, `md` (40px) in the Lia panel header,
  `lg` (64px) in the empty/welcome state.

**The breathing glow is the identity.**
When someone closes their eyes and thinks of Lia, they see a softly glowing mark.
That is what the animation is building. Not novelty. Recognition.

# Section 9 — Responsiveness

## Philosophy

Eia is a professional dashboard. Its primary home is a desktop browser
at 1280px or wider. That is where agents spend eight hours a day.
That is where the design is optimised first.

Mobile is not an afterthought — it is a different mode.
On mobile, Eia shifts from a productivity surface to a monitoring surface.
Agents check status, respond to urgent items, take quick actions.
They do not process 200 leads from a phone.

This distinction matters because it means we do not try to squeeze the desktop
experience onto a small screen. We design a different experience for a different intent.

---

## 9.1 — Breakpoint Reference

These are the breakpoints defined in Section 2.7.
Use only these. No arbitrary breakpoints in components.

| Token      | Value  | Primary Use                              |
| ---------- | ------ | ---------------------------------------- |
| `--bp-xs`  | 480px  | Large phone — edge cases, fold points    |
| `--bp-sm`  | 640px  | Mobile landscape / small tablet          |
| `--bp-md`  | 768px  | Tablet portrait — the layout shifts here |
| `--bp-lg`  | 1024px | Desktop — the primary Eia viewport       |
| `--bp-xl`  | 1280px | Wide desktop — comfortable dashboard     |
| `--bp-2xl` | 1536px | External monitor — breathing room        |
| `--bp-3xl` | 1920px | Full HD — data-heavy views, wide tables  |

**In Tailwind:** `sm:` `md:` `lg:` `xl:` `2xl:` — always mobile-first (min-width).

---

## 9.2 — Responsive Behaviour by Element

| Element            | Mobile `< md`                                                                    | Tablet `md`                                   | Desktop `lg+`                                   |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| **Sidebar**        | Off-canvas drawer + bottom nav bar (4–5 primary items)                           | Icon-only rail — 64px, tooltips on hover      | Full sidebar — 240px, labels, section dividers  |
| **Page padding**   | `px-4 py-5`                                                                      | `px-6 py-6`                                   | `px-8 py-8`                                     |
| **TopBar title**   | `--text-xl` (24px)                                                               | `--text-2xl` (30px)                           | `--text-3xl` (36px) with trailing accent period |
| **TopBar actions** | Icon-only buttons                                                                | Icon + label on primary action                | Full labels on all actions                      |
| **Tables**         | Card stack — each row becomes a label:value card                                 | Horizontally scrollable table, column pinning | Full table, all columns, fixed header           |
| **Modals**         | Bottom sheet — slides up from bottom, full width, `--radius-xl` top corners only | Centred — `max-w-lg`, standard radius         | Centred — `max-w-lg`, standard radius           |
| **Cards grid**     | Single column, full width                                                        | 2-column grid                                 | 3–4 column grid depending on content type       |
| **Message bar**    | Fixed bottom, safe-area-inset aware                                              | Inline, bottom of chat container              | Inline, bottom of chat container                |
| **Search bar**     | Full width, below TopBar                                                         | 240px in TopBar                               | 280px in TopBar with ⌘K chip                    |
| **Lia panel**      | Full-screen takeover                                                             | Side sheet — 400px                            | Side panel or split view                        |
| **Data charts**    | Simplified — key metric + single bar/line                                        | Standard chart, reduced legend                | Full chart, full legend, hover tooltips         |

---

## 9.3 — Mobile-Specific Rules

```
RULE R-01 — Use dvh, not vh
            min-height: 100dvh on the shell.
            100vh includes the browser chrome on mobile and causes layout jumps
            when the address bar hides. dvh is dynamic — it follows the actual
            visible viewport. One character difference. Prevents a persistent bug.

RULE R-02 — Safe area insets on fixed bottom elements
            Any element fixed to the bottom on mobile:
            padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom))
            This prevents content from hiding behind the iPhone home indicator.
            The Message Bar and bottom nav require this. Always.

RULE R-03 — Touch targets are minimum 44px
            Every interactive element on mobile has a minimum touch target of 44×44px.
            The visual element can be smaller — use padding to extend the tap area.
            A 16px icon button gets padding to reach 44px. The icon does not grow.

RULE R-04 — No hover-only interactions on mobile
            Hover tooltips, hover-reveal actions, hover-state information —
            none of these exist on touch devices. Every action available on hover
            must also be available via tap, long-press, or a visible control.

RULE R-05 — Tables become cards below md
            No horizontal scroll on mobile for data tables.
            Each row becomes a card. Label (micro-label style) left, value right.
            The first column (typically name or title) becomes the card header.
            Sort and filter controls move to a sheet, not the table header.

RULE R-06 — Modals become bottom sheets below md
            A centred modal on mobile covers most of the screen and feels like
            an interruption with no spatial logic. A bottom sheet slides up
            from below — it has a direction, it has physics, the user can dismiss
            it by swiping down. Border-radius: --radius-xl on top corners only.
            Max-height: 90dvh. Overflow: scroll inside.
```

---

# Section 10 — The Permanent Decisions

> These are not guidelines. They are not preferences.
> They are the decisions that were made once, with full consideration,
> and will not be revisited without a Decision Log entry
> explaining what changed and why.
>
> When a new developer asks "why can't I just —"
> the answer is: because this document exists.
> Read the reason. If the reason no longer applies, log the change.
> Do not simply ignore the rule.

---

## 10.1 — Visual & Token Rules

```
01  No hardcoded colour values in any component, ever.
    Every colour is a CSS variable from Section 2 or a theme token from Section 1.
    text-gray-500 is a violation. bg-white is a violation. #1a1a1a is a violation.
    The token exists. Use it.

02  No mixing radius values within one component.
    A card does not have --radius-md on some corners and --radius-lg on others.
    Pick one radius for the component. Apply it consistently.
    Mixed radii signal that no one designed this — someone assembled it.

03  Z-index values come only from the --z-* scale defined in Section 3.6.
    No z-[50], no z-[999], no z-[9999].
    The scale has eight named levels. They cover every scenario Eia will encounter.
    If you believe you need a ninth level, write it in the Decision Log first.

04  No drop shadows with px values.
    Shadows use rgb() with opacity fractions: rgb(0 0 0 / 0.06).
    px values in shadows scale incorrectly and cannot be themed.

05  No animation duration above 500ms except Lia's liaBreathe.
    The user came to work. Every animation that runs longer than 500ms
    is borrowing time that belongs to them.
    liaBreathe runs at 3s because it is ambient — it is not blocking the user.

06  No font-bold anywhere.
    --weight-semibold (600) is the heaviest weight in Eia.
    font-bold (700) is available in Tailwind. Do not use it.
    Bold text in a refined interface reads as shouting.
    Semibold is emphasis. Bold is alarm.

07  No placeholder text at full opacity.
    Placeholder colour is always --theme-text-tertiary.
    Full-opacity placeholder text is indistinguishable from filled input text
    until the user focuses the field. This is a usability failure.

08  No colour that is not defined in Section 2 or Section 1.
    If the colour does not exist in the token map, it does not exist in Eia.
    If you believe a new colour is needed, propose it in the Decision Log.
    It will be added to the token map and inherit all theme variations.
    It will not be hardcoded in a component.
```

---

## 10.2 — Component Architecture Rules

```
09  No component imports from another feature folder.
    features/finance/ does not import from features/concierge/.
    Cross-feature data flows through lib/ only.
    Violating this creates invisible coupling that breaks silently under refactoring.

10  No component that both fetches data and renders UI.
    Server components fetch. Client components render.
    A component that does both cannot be tested, cannot be reused,
    and cannot be reasoned about independently.

11  No Server Action that does not begin with Zod validation.
    The schema is the first line. Not the third. Not after some logic.
    The first line. If the input is invalid, the action returns immediately.
    No database is touched with unvalidated input.

12  No raw Supabase calls in components or Server Actions.
    All DB queries go through lib/services/.
    The service layer is the only place that knows Supabase exists.
    A component that calls supabase.from() directly is
    impossible to mock, impossible to cache, and impossible to audit.
```

---

## 10.3 — Design Pattern Rules

```
13  No primary button using --theme-text-inverse as label colour.
    Primary button labels use --theme-accent-fg.
    These are different tokens. On Earth, --theme-accent-fg is #0a0a0a (dark on gold).
    --theme-text-inverse is white. White text on gold fails contrast.
    The token exists for this exact reason. Use it.

14  No sidebar active state with left-border-only highlight.
    The active state is three layers: fill + full border + animated pill.
    Left-border-only looks like a radio button, not a selected state.
    See Section 5.99 — Detail 01 for the exact implementation.

15  No card without a border.
    Border is the primary elevation signal. Shadow is secondary.
    A card without a border is a rectangle with a shadow — it looks like a mistake.
    A card with a border and no shadow looks intentional. Grounded.
    Always border first.

16  No table with the same background on header and data rows.
    Header rows are --theme-paper-subtle.
    Data rows are --theme-paper.
    This contrast is what makes tables instantly scannable.
    Remove it and the table becomes a grid of equal-weight cells.

17  No empty state without Playfair italic heading.
    "No results found" in Geist Regular is a developer placeholder.
    An italic Playfair sentence is a design decision.
    The empty state is a moment. Treat it as one.
    See Section 5.99 — Detail 04 for the exact recipe.

18  No field label that deviates from the micro-label recipe.
    10px. font-medium. uppercase. tracking-[0.12em]. --theme-text-tertiary.
    This combination is the signature of professional software.
    Changing any one value — making it 11px, or sentence case, or primary colour —
    breaks the visual language that unifies every form in Eia.

19  No animation that animates width, height, top, left, padding, or margin.
    These properties trigger layout recalculation on every frame.
    They are not GPU-accelerated. They cause jank at 60fps and dropped frames at 30fps.
    Animate only transform and opacity.
    Layout changes use Framer Motion layoutId — never CSS transitions on dimensions.

20  No backdrop blur outside the three sanctioned surfaces.
    TopBar. Mobile sidebar overlay. Command palette overlay.
    That is the complete list. Adding blur to cards, dropdowns, or modals
    is glassmorphism. Glassmorphism aged poorly.
    Eia uses elevation, borders, and accent surfaces to communicate depth.
    It does not use blur to look modern. It uses restraint to look permanent.
```

---

## 10.4 — The Decision Log Requirement

Any rule in Section 10 may be changed. Nothing in this document is sacred.
But changes require a Decision Log entry in The_Blueprint.md with:

```
Date:      the date the decision was made
Rule:      which rule is being changed or overridden
Old:       what the rule said
New:       what it says now or the exception being granted
Why:       the reason — specific, not vague
           "felt better" is not a reason.
           "X fails on Y because Z" is a reason.
Who:       who made the decision
```

A rule changed without a log entry is not a rule change.
It is a violation waiting to be reverted.

# Section 11 — Loading & Skeleton States

## Philosophy

Every piece of data that loads asynchronously gets a skeleton.
No spinners alone. No blank white voids.
The skeleton is the shape of the content — it tells the user exactly what is coming
before it arrives. Fast, premium, never jarring.

**Three rules:**

1. Skeleton always matches the exact dimensions and layout of the real content it replaces.
2. All skeletons use the same pulse animation — one system, everywhere.
3. Never show a skeleton for less than 150ms. If data arrives faster, hold it briefly.
   A skeleton that flashes in and out in 80ms looks more broken than no skeleton at all.

---

## 11.1 — The Pulse Animation

```css
@keyframes eia-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.skeleton {
  background: var(--theme-paper-subtle);
  border-radius: var(--radius-xs);
  animation: eia-skeleton-pulse 1.6s ease-in-out infinite;
}
```

The animation is theme-aware by default — `--theme-paper-subtle` is a warm cream
pulse on Earth, pale aqua on Water, violet-grey on Cosmos.
One animation. Five personalities. No extra code per theme.

---

## 11.2 — Skeleton Primitives

Four building blocks. Compose these to build any skeleton layout.

```
skeleton-line    h-3, --radius-xs, bg --theme-paper-subtle
                 Widths: 80% / 60% / 75% / 45%
                 Always vary widths — uniform lines look like a loading bar,
                 not a text preview. The last line is always the shortest.

skeleton-block   any w + h, border-radius matches the real component's radius

skeleton-avatar  w-10 h-10, --radius-sm  ← squarish, matches Avatar shape
                 Never --radius-full — Avatar is not a circle

skeleton-pill    h-5, w-14, --radius-full  ← for badges and status indicators
```

---

## 11.3 — Skeleton Variants

**Stat Card:**

```
Container: card shell — bg --theme-paper, border --theme-paper-border
           --radius-md, p-5

skeleton-line  w-24  h-2.5   mb-3    ← label
skeleton-line  w-16  h-7     mb-4    ← the big number
skeleton-line  w-32  h-2             ← sub-label
```

**Table (5 rows default):**

```
Header:   4 skeleton-lines at 20% / 35% / 20% / 15% widths — h-2.5
Rows:     same column structure, h-3 per cell
          row height matches real: py-3 = 48px total
          stagger: see 11.4
```

**Profile / Employee Card:**

```
skeleton-avatar  w-10 h-10  (left)
skeleton-line    w-28 h-3   mb-2   ← name
skeleton-line    w-20 h-2.5        ← role
skeleton-pill    w-16              ← department tag
```

**Chat Messages (3 messages):**

```
skeleton-block  w-[55%] h-14  ml-auto   --radius-md   ← right
skeleton-block  w-[45%] h-10            --radius-md   ← left
skeleton-block  w-[60%] h-16  ml-auto   --radius-md   ← right
stagger: 0ms / 120ms / 240ms
```

**Full Page:**

```
TopBar:   skeleton-line w-40 h-5 (title) + skeleton-block w-8 h-8 (action)
Content:  3–4 stat card skeletons side by side
          table skeleton below
          padding mirrors real page: px-6 py-6 md:px-8 md:py-8
```

---

## 11.4 — Stagger Timing

When multiple skeletons appear together, stagger their pulse start:

```
Item 1:   animation-delay: 0ms
Item 2:   animation-delay: 80ms
Item 3:   animation-delay: 160ms
Item 4:   animation-delay: 240ms
Item 5:   animation-delay: 320ms

Cap:      400ms total — beyond 5 items, remaining items share the last delay value.
          A stagger longer than 400ms feels frozen, not flowing.
```

---

## 11.5 — Skeleton → Content Transition

When real data arrives, never do a hard swap.
Content materialises. It does not reload.

```
Skeleton exit:   opacity 1 → 0
                 duration: 150ms, ease-in

Content enter:   opacity 0 → 1, y: 4px → 0
                 duration: 250ms, ease-out-expo
                 delay: 100ms after skeleton begins exiting

The 100ms overlap is intentional.
The skeleton is still fading as the content begins to appear.
This crossfade is what makes arrival feel like materialisation.
```

# Section 12 — Mobile Components & Touch Standards

## 12.1 — Bottom Navigation Bar

On mobile (`< md`), the sidebar disappears entirely.
Navigation moves to a fixed bottom bar — the native mobile pattern.
It lives on the canvas, not the paper. It feels like part of the device.

```
Container:
  position: fixed, bottom: 0, left: 0, right: 0
  height: 64px + env(safe-area-inset-bottom)   ← iOS home indicator
  background: var(--theme-canvas)              ← canvas, not paper — feels native
  border-top: 1px solid rgba(255, 255, 255, 0.08)
  backdrop-filter: blur(12px)
  z-index: var(--z-sidebar)
  display: flex, align-items: center, justify-content: space-around
  padding: 0 var(--space-2)

Nav item:
  display: flex, flex-direction: column, align-items: center
  gap: var(--space-1)
  min-width: 56px, min-height: 44px   ← touch target
  padding: var(--space-2) 0

  Icon:   w-5 h-5
  Label:  10px font-medium tracking-wide

Inactive:
  icon + label: var(--theme-sidebar-text)

Active:
  icon + label: var(--theme-sidebar-active)
  indicator:    w-8 h-0.5, bg var(--theme-sidebar-active-pill)
                border-radius --radius-full
                centered above icon (top pill, not bottom border)
                entrance: scaleX 0 → 1, --duration-fast, --ease-spring
```

**Maximum 5 items.** If more navigation destinations exist, the fifth item
becomes "More" — tapping opens a sheet with the remaining destinations as a grid.
Never squeeze 6 icons into a bottom bar. It becomes unreadable and untappable.

---

## 12.2 — Touch & Gesture Standards

Every interactive element in Eia on mobile follows these standards.
They are not responsive extras — they are the mobile contract.

```
Touch target minimum
  44×44px on every interactive element — the iOS HIG standard.
  The visual element can be smaller. The tap area cannot.
  A 16px icon button gets invisible padding to reach 44px.
  The icon does not grow. The target does.

Tap feedback
  All interactive elements: scale(0.97) on active/press
  duration: 80ms, easing: --ease-spring
  This is the physical press. The key going down.
  Every tappable element responds to presence.

Swipe to dismiss
  Bottom sheets and mobile modals support swipe-down to close.
  Drag handle: w-10 h-1, --radius-full, bg --theme-paper-border
               centered at top of sheet, mt-3
  Dismiss threshold: 40% of sheet height dragged, or velocity > 500px/s
  On dismiss: sheet exits at current drag position velocity — not snapping back
              then animating out. It follows the finger.

Long press
  Duration: 800ms
  Triggers context menu on: task rows, message bubbles, lead cards
  Visual feedback at 400ms: subtle scale(0.98) to signal the press is registering
  Context menu: bottom sheet with action list — same spec as dropdown (Section 5.09)
                but full width, bottom-anchored

Scroll containers
  All scrollable areas on mobile:
  -webkit-overflow-scrolling: touch
  overscroll-behavior: contain   ← prevents scroll chaining to the body
  scroll-behavior: smooth
```

# Section 13 — Toast & Notification System

> A notification is not an interruption.
> It is an invitation — from the software to the person —
> saying: something happened that you should know about.
>
> It arrives with confidence. It says what it needs to say.
> It leaves without asking permission.
>
> The toast knows what it is. It wears that identity completely.
> The theme flows through it. It never looks like it arrived from another application.

---

## 13.1 — Philosophy: Living Notifications

Most toast systems are static rectangles with a colour stripe.
Eia's toasts are alive in three specific ways:

**1 — They breathe their type.**
A success toast does not just have a green stripe. The entire left edge
pulses once on arrival — a single breath of green light that says _it worked_.
A danger toast arrives with a contained urgency — not flashing, not alarming,
but present in a way that earns attention.

**2 — They carry the theme.**
The background is `--theme-paper`. The shadow is `--shadow-paper` tinted.
On Earth, a success toast is warm cream with gold-adjacant depth.
On Cosmos, it is barely-violet white. On Water, pale aqua.
The toast belongs to the world it lives in.

**3 — They have a pulse, not a timer bar.**
The progress indicator does not deplete like a loading bar —
that maps time to anxiety. Instead, a soft ambient pulse
tells the user the toast is still present without creating urgency.
The only exception is `warning` — which uses a depleting bar
because the user genuinely needs to know time is passing.

---

## 13.2 — Toast Anatomy

```
┌─────────────────────────────────────────────────┐
│▌  ┌───┐  Title text — semibold               ✕  │
│▌  │ ✓ │  Supporting message — secondary          │
│▌  └───┘  Optional action link                    │
│                                          ▓▓▓░░░  │  ← warning only
└─────────────────────────────────────────────────┘
 ↑
 3px living bar
```

```
Container:
  background:     var(--theme-paper)
  border:         1px solid var(--theme-paper-border)
  border-radius:  var(--radius-md)
  box-shadow:     var(--shadow-3)
  overflow:       hidden
  min-width:      320px
  max-width:      400px
  position:       relative
  padding:        var(--space-3) var(--space-3) var(--space-3) var(--space-4)
                  ← pl-4 because the living bar lives in that space

Living bar (left edge):
  position:       absolute, left: 0, top: 0, bottom: 0
  width:          3px
  background:     type accent colour (see 13.3)
  border-radius:  var(--radius-xs) on left corners
  animation:      see 13.5 — the single entrance breath

Icon zone:
  width: 36px, height: 36px, flex-shrink: 0
  border-radius: var(--radius-full)
  background:    type surface colour (see 13.3)
  display:       flex, align-items: center, justify-content: center
  icon:          w-4 h-4, type text colour

Content:
  flex: 1, display: flex, flex-direction: column, gap: 2px
  Title:   var(--text-sm) var(--weight-semibold) var(--theme-text-primary)
  Message: var(--text-xs) var(--theme-text-secondary) var(--leading-normal)

Action (optional):
  var(--text-xs) var(--weight-semibold) var(--theme-accent)
  text-underline-offset: 2px
  hover: underline
  cursor: pointer
  margin-top: var(--space-1)

Dismiss button:
  w-7 h-7, ghost, var(--radius-sm)
  icon: X, w-3.5 h-3.5, var(--theme-text-tertiary)
  hover: var(--theme-text-primary), bg var(--theme-paper-subtle)
  position: absolute top-3 right-3

Warning progress bar:
  position: absolute, bottom: 0, left: 0
  height: 2px
  background: var(--color-warning)
  width: 100% → 0%, linear timing (maps to real time — linear is correct here)
  duration: dismiss timer value
```

---

## 13.3 — Toast Types

Each type has a complete identity system.
The semantic colours are fixed — they do not shift per theme.
A success toast is always green. The user must never wonder what colour means.

| Type      | Living Bar        | Icon             | Icon Colour            | Icon BG                  | Personality                              |
| --------- | ----------------- | ---------------- | ---------------------- | ------------------------ | ---------------------------------------- |
| `success` | `--color-success` | `CheckCircle2`   | `--color-success-text` | `--color-success-light`  | Calm. Confirmed. Done.                   |
| `warning` | `--color-warning` | `AlertTriangle`  | `--color-warning-text` | `--color-warning-light`  | Present. Measured. Urgent without alarm. |
| `danger`  | `--color-danger`  | `XCircle`        | `--color-danger-text`  | `--color-danger-light`   | Clear. Still. Never hysterical.          |
| `info`    | `--color-info`    | `Info`           | `--color-info-text`    | `--color-info-light`     | Neutral. A fact, not a feeling.          |
| `loading` | `--theme-accent`  | `Loader2` (spin) | `--theme-accent`       | `--theme-accent-surface` | Patient. Alive. In progress.             |
| `lia`     | `--theme-accent`  | Lia glyph (sm)   | `--theme-accent`       | `--theme-accent-surface` | Different. Reserved for Lia only.        |

**The `lia` type** is a special class — used exclusively when Lia has completed
an agentic action, generated a report, or has something to show the user.
It carries the Lia glyph instead of a Lucide icon and the `liaBreathe` animation
runs on the glyph while the toast is visible. It is the only toast type that
feels like a person sent it — because one did.

**The `loading` type** never auto-dismisses and has no progress bar.
It lives until `toast.resolve()` is called, then transitions directly into
`success` or `danger` with a crossfade — never disappearing and reappearing.
The continuity is the message: _the same thing that was waiting is now done._

---

## 13.4 — The Living Bar Animation

This is what separates Eia's toasts from a rectangle with a stripe.

On arrival, the left accent bar performs a single breath:

```css
@keyframes eia-toast-bar-breathe {
  0% {
    opacity: 0.3;
    box-shadow: none;
  }
  40% {
    opacity: 1;
    box-shadow: 2px 0 12px
      color-mix(in srgb, var(--bar-colour) 60%, transparent);
  }
  100% {
    opacity: 0.85;
    box-shadow: none;
  }
}

.toast-bar {
  --bar-colour: /* set per type */;
  animation: eia-toast-bar-breathe 600ms var(--ease-out-expo) forwards;
}
```

The bar starts dim, brightens with a warm glow at 40% of the animation,
then settles to a resting 85% opacity. One breath. Then it is still.

It is not looping. It does not pulse continuously.
A continuously pulsing bar would demand attention it has not earned.
One breath announces arrival. Stillness says: _I am here when you are ready._

**The `lia` type is the only exception** — its bar carries the `liaBreathe` animation
continuously (the same 3s gentle pulse from Section 6.4).
Lia is always breathing. Even in a toast. Especially in a toast.

---

## 13.5 — Full Animation Choreography

**Entrance — desktop (slides from bottom right):**

```
initial:  { x: 24, opacity: 0, scale: 0.96 }
animate:  { x: 0, opacity: 1, scale: 1 }
duration: 350ms
easing:   var(--ease-out-expo)

then immediately: living bar breath animation fires (600ms)
then:             icon fades in with 80ms delay after container
                  { opacity: 0 } → { opacity: 1 }, 200ms
then:             content (title + message) fades in with 120ms delay
                  { opacity: 0, x: 4 } → { opacity: 1, x: 0 }, 200ms

Total choreography duration: ~450ms
Everything is staggered. Nothing arrives at the same time.
The toast assembles itself — container, then bar breath, then icon, then words.
```

**Entrance — mobile (rises from bottom):**

```
initial:  { y: 24, opacity: 0 }
animate:  { y: 0, opacity: 1 }
duration: 350ms
easing:   var(--ease-out-expo)
Same internal stagger as desktop.
```

**Exit:**

```
animate:  { opacity: 0, y: 8 }
duration: 200ms
easing:   var(--ease-in-expo)

After opacity reaches 0:
  height collapses: current height → 0, duration 150ms, var(--ease-out-soft)
  margin collapses simultaneously
  toasts above slide down smoothly into the vacated space
```

**loading → success/danger transition (in place):**

```
The loading toast does not exit and re-enter.
It transforms:
  Icon:     Loader2 fades out (100ms), type icon fades in (150ms) with scale 0.8→1
  Bar:      colour crossfades via CSS transition, 300ms
  Content:  text fades out (100ms), new text fades in (150ms)
  Bar breathe: fires once on the new type after transition completes
Total: ~400ms. One continuous toast. One continuous story.
```

---

## 13.6 — Stack Behaviour

Maximum 3 toasts visible simultaneously.
A 4th toast queues silently and enters only when one exits.

```
Toast 1 (top, newest): scale(1),    translateY(0)     — fully visible
Toast 2 (behind):      scale(0.95), translateY(-8px)  — peeking
Toast 3 (furthest):    scale(0.90), translateY(-14px) — barely peeking

Each scale/translate animates smoothly when a toast exits:
  Toast 2 becomes Toast 1: scale 0.95→1, y -8→0, duration 250ms ease-out-expo
  Toast 3 becomes Toast 2: scale 0.90→0.95, y -14→-8, same duration

The stack feels like physical cards settling.
Not a list reordering. Cards.
```

---

## 13.7 — Auto-Dismiss Timing

```
success:   4000ms   — confirmed, no urgency
info:      5000ms   — a fact, give time to read
warning:   6000ms   — time is part of the message, depleting bar active
danger:    never    — user must dismiss. The error does not go away on its own.
loading:   never    — lives until resolved
lia:       7000ms   — Lia's messages deserve a little more time
```

**Hover pause:** Hovering over any toast freezes its progress and resets the timer.
The moment the cursor leaves, the remaining time resumes — it does not reset to full.
The user should feel they can read at their own pace without losing the toast.

**Focus pause:** Same behaviour when the toast receives keyboard focus.

---

## 13.8 — Position

```
Desktop:
  position: fixed, bottom: var(--space-6), right: var(--space-6)
  z-index: var(--z-toast)
  display: flex, flex-direction: column-reverse, gap: var(--space-3)
  (column-reverse: new toasts appear on top, pushing older ones up)

Mobile:
  position: fixed
  bottom: calc(80px + env(safe-area-inset-bottom))
          ← clears the bottom nav bar
  left: var(--space-4), right: var(--space-4)
  z-index: var(--z-toast)
  width: calc(100% - var(--space-8))
```

---

## 13.9 — Toast API

The contract between the application and the toast system.

```typescript
// Simple
toast.success("Lead saved");
toast.danger("Something went wrong");
toast.warning("Storage is nearly full");
toast.info("Sync complete — 14 records updated");
toast.lia("Report ready — Q3 Performance Summary");

// With supporting message
toast.success("Profile updated", {
  message: "Changes are visible to the team.",
});

// With action
toast.danger("Delete failed", {
  message: "This lead could not be removed.",
  action: { label: "Retry", onClick: handleRetry },
});

// With action — Lia type
toast.lia("Analysis complete", {
  message: "Lia has flagged 3 leads needing attention.",
  action: { label: "Review now", onClick: () => router.push("/lia") },
});

// Loading — the living toast
const t = toast.loading("Saving changes...");

// Resolves in place — no flicker, no disappear/reappear
toast.resolve(t, "success", "All changes saved");
toast.resolve(t, "danger", "Save failed", {
  message: "Connection lost. Try again.",
  action: { label: "Retry", onClick: handleRetry },
});

// Custom duration
toast.warning("Trial ends in 3 days", { duration: 8000 });

// Programmatic dismiss
toast.dismiss(t);
toast.dismissAll();
```

---

## 13.10 — Performance Contract

The living bar breath animation and icon stagger add ~6 keyframe operations
on toast entrance. This is negligible. The performance rules that matter:

```
✓  Only opacity and transform animated — no layout properties
✓  CSS animations used for the bar breath — not JS/Framer
✓  Framer Motion used only for container entrance/exit and stack reflow
✓  Maximum 3 toasts in the DOM simultaneously — excess are queued, not rendered
✓  Loading toast Loader2 spin: CSS animation, not JS interval
✓  liaBreathe on Lia glyph: CSS animation, not JS
✗  No blur filters on toasts — blur on frequently-appearing elements is expensive
✗  No box-shadow animation on the main container — only on the 3px bar (tiny element)
```

The living bar glow (`box-shadow` on a 3px × height element) fires once on entrance
and does not loop. The GPU cost is one composited paint on a sub-4px element.
It is imperceptible in profiling. The payoff in feeling is not.

# Section 7 — Form System

> Forms are where trust is built or broken.
> Every field is a conversation — the user is telling the software
> something true. The software must receive that truth with care.
>
> A form in Eia is not a data collection mechanism.
> It is an invitation to participate.
> It should feel as considered as the rest of the interface.

---

## 7.1 — Philosophy

**Forms have a voice.** That voice is calm, precise, and never alarming.
Error messages do not shout. They explain.
Labels do not demand. They invite.
Required fields do not threaten. They simply indicate.

**Forms have rhythm.** Vertical stacking with consistent spacing
creates a reading flow — the eye moves down naturally,
never jumping or searching. The rhythm should feel like breathing.

**Forms have memory.** They remember what the user typed.
They do not clear fields on error. They do not reset on validation.
They hold the user's input with respect.

**Forms fail gracefully.** When something is wrong,
the form tells the user exactly what and exactly where.
Never a generic "something went wrong" at the top.
Always specific, inline, at the field that needs attention.

---

## 7.2 — Field Anatomy

Every field in Eia follows the same vertical structure.
No exceptions. This consistency is what makes the form readable.

```
┌─────────────────────────────────────────────────────┐
│  FIELD LABEL          optional badge: Required       │  ← Label row
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Input / Select / Textarea                     │  │  ← Control
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Hint text or error message                          │  ← Sub-text
└─────────────────────────────────────────────────────┘
```

```
Label row:
  font:     var(--text-2xs) var(--weight-semibold)
  case:     uppercase
  tracking: var(--tracking-widest)  ← 0.14em
  color:    var(--theme-text-tertiary)
  margin-bottom: var(--space-1)     ← 4px — tight to the field

  Required indicator:
    Not an asterisk. An asterisk is anxiety.
    A small pill badge: "Required"
    font: var(--text-2xs), var(--weight-medium)
    bg: var(--theme-paper-subtle)
    border: 1px var(--theme-paper-border)
    color: var(--theme-text-tertiary)
    border-radius: var(--radius-full)
    padding: 1px 6px
    float: right on the label row

Control:
  height: 36px (md default), 32px (sm), 44px (lg)
  border: 1px solid var(--theme-paper-border)
  border-radius: var(--radius-sm)
  background: var(--theme-paper)
  padding: 0 var(--space-3)
  font: var(--text-sm) var(--theme-text-primary)
  placeholder: var(--theme-text-tertiary)
  caret-color: var(--theme-accent)
  transition: var(--transition-hover)
  outline: none  ← focus handled via box-shadow only

Sub-text:
  font: var(--text-xs)
  margin-top: var(--space-1)   ← 4px above
  line-height: var(--leading-normal)

  Hint:  color var(--theme-text-tertiary)
  Error: color var(--color-danger)

Field gap (between fields):
  var(--space-5)  ← 20px. The breathing room between questions.
  Tighter (var(--space-4)) for dense forms like inline search filters.
  Never less than var(--space-4).
```

---

## 7.3 — Control States

Every control has five states. All five are designed. None are assumed.

```
Default:
  border: 1px solid var(--theme-paper-border)
  bg: var(--theme-paper)
  shadow: none

Hover:
  border: 1px solid var(--theme-accent-muted)
  transition: var(--transition-hover)
  The field acknowledges approach before commitment.

Focus:
  border: 1px solid var(--theme-accent)
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)
  bg: var(--theme-paper)
  The warm ambient ring — not a hard outline. See Section 5.99 Detail 05.

Error:
  border: 1px solid var(--color-danger)
  box-shadow: 0 0 0 3px var(--color-danger-light)
  The error ring is solid semantic colour, not a glow.
  It must be unmistakable. Calm but clear.

Disabled:
  opacity: 0.5
  cursor: not-allowed
  bg: var(--theme-paper-subtle)
  border: 1px solid var(--theme-paper-border)
  User input is not possible. The field communicates this without drama.

Read-only:
  bg: var(--theme-paper-subtle)
  border: 1px solid var(--theme-paper-border)
  cursor: default
  opacity: 1   ← unlike disabled — this data is real and visible
  Text is selectable. Data can be copied. It just cannot be changed.
```

---

## 7.4 — Input Variants

### Text Input

```
The standard single-line field.
Left icon (optional): absolute left-3, w-4 h-4, var(--theme-text-tertiary)
                       padding-left increases to pl-9 when icon present
Right element (optional): clear button, copy button, unit label
                           absolute right-3
```

### Textarea

```
min-height: 80px (3 lines)
max-height: 240px (auto-grow, then scroll)
resize: vertical only — never both, never none on standard textareas
padding: var(--space-3)
line-height: var(--leading-relaxed)  ← 1.65 — text deserves room to breathe
font: var(--text-sm)
Auto-grow implementation:
  height: auto on every input event
  Sets scrollHeight as the new height
  Transitions: height var(--duration-base) var(--ease-out-soft)
```

### Select

```
appearance: none  ← custom styling
background-image: ChevronDown icon as inline SVG data URI
                  colour: var(--theme-text-tertiary)
background-position: right var(--space-3) center
background-repeat: no-repeat
padding-right: var(--space-8)  ← room for the chevron
cursor: pointer

On open: ChevronDown rotates 180° via transition
         The dropdown panel follows Section 5.09 spec exactly.
```

### Phone Input

```
Two-part field: country code selector + number input
Country code: w-20, select variant, border-right: none, radius right: 0
Number input: flex-1, border-left: 1px var(--theme-paper-border), radius left: 0
Combined border radius: --radius-sm on outer corners only
On focus of either part: the combined field shows the accent ring

All phone values pass through normalizeToE164() before any DB write.
The input accepts human formats (0821234567, +91 98765 43210).
The field normalises silently on blur. Never on every keystroke.
Normalisation on every keystroke while typing is an interruption.
```

### Search Input

See Section 5.10 — the Search Bar component.
Use that component inside forms, do not recreate it.

### Password Input

```
Right slot: Eye / EyeOff toggle icon button
            w-4 h-4, ghost, absolute right-3
            On click: input type toggles text ↔ password
            Icon transitions: opacity 0→1, 150ms
            Aria-label: "Show password" / "Hide password"
Strength indicator (registration only):
  4-segment bar below the field, above hint text
  height: 2px, gap: 2px between segments
  Segments fill left to right: 1=danger, 2=warning, 3=info, 4=success
  Transition: background-color var(--duration-base) var(--ease-in-out)
  Hint updates: "Too short" / "Add numbers" / "Add symbols" / "Strong"
```

---

## 7.5 — Selection Controls

### Checkbox

```
Box:        16×16px, border 1.5px var(--theme-paper-border)
            border-radius: var(--radius-xs)
            bg: transparent
            transition: var(--transition-interactive)

Hover:      border-color: var(--theme-accent)

Checked:    bg: var(--theme-accent)
            border-color: var(--theme-accent)
            Check icon: white, w-3 h-3, strokeWidth={2.5}
            Entrance: scale 0.6→1, 80ms, --ease-spring
            The check snaps in. It does not fade.

Indeterminate:
            bg: var(--theme-accent)
            Minus icon instead of check

Label:      var(--text-sm) var(--theme-text-primary)
            margin-left: var(--space-2)
            cursor: pointer — clicking the label checks the box

Checked label:
            color: var(--theme-text-secondary)  ← slightly muted
            The checked state is acknowledged, not erased.

Group:      flex flex-col, gap: var(--space-3)
```

### Radio

```
Same dimensions and states as Checkbox.
border-radius: var(--radius-full)  ← the only difference

Selected:   bg: var(--theme-accent), border: var(--theme-accent)
            Inner dot: 6×6px white circle, centered
            Entrance: scale 0→1, 100ms, --ease-spring

Radio groups are always vertical by default.
Horizontal only when options are 2 and labels are short (Yes / No, On / Off).
```

### Toggle

See Section 5.08 — the Toggle component.

### Date Picker

```
Trigger:    Standard input with Calendar icon left slot
            Displays formatted date when selected, placeholder when not
            Format: DD MMM YYYY (human) — "14 Jan 2026"
            Stored as ISO 8601 UTC — normalised via toUTC() from lib/utils/dates.ts

Calendar panel:
  Follows the dropdown panel spec (Section 5.09) for container and shadow.

  Header:   Month Year centred, ChevronLeft / ChevronRight ghost buttons
            font: var(--text-sm) var(--weight-semibold)

  Day names: .label-micro (Sun Mon Tue...) — 7 columns, text-center

  Day cells: 36×36px, --radius-sm
             default:    var(--theme-text-primary), hover: bg var(--theme-paper-subtle)
             today:      border 1px var(--theme-accent), var(--theme-accent) text
             selected:   bg var(--theme-accent), var(--theme-accent-fg) text
             other month:var(--theme-text-tertiary), hover still active
             disabled:   opacity-40, cursor-not-allowed, hover suppressed

Range picker:
             Start and end selected: same as selected state
             Between: bg var(--theme-accent-surface)
             The range is a wash of accent — not aggressive, just present.

Time picker (optional, inline below calendar):
             12-hour with AM/PM — our user base expects this
             Hours + Minutes: two scroll columns or two selects
             Separator: ":" in var(--theme-text-tertiary), centered
```

---

## 7.6 — Form Layout Patterns

### Single Column (default)

```
All fields stacked vertically.
max-width: 480px for standard forms, 640px for wider forms.
The natural reading direction. Used for: login, settings, single-record edit.
```

### Two Column Grid

```
Two fields side by side at md+.
Collapses to single column below md.
Use only for: name (first + last), date range (start + end),
              pairs that are semantically linked.
Never split: phone + email, address + city (different concepts).
gap: var(--space-5)
```

### Inline Form

```
Label and control on the same row.
Label: min-width 140px, var(--theme-text-secondary), text-right on desktop
Control: flex-1
Used for: settings panels, detail view inline editing.
Collapses to stacked below sm.
```

### Section Groups

```
Long forms (more than 6 fields) must be grouped into named sections.

Section header:
  .label-micro with a hairline below
  color: var(--theme-text-tertiary)
  border-bottom: 1px solid var(--theme-paper-border)
  padding-bottom: var(--space-2)
  margin-bottom: var(--space-5)
  margin-top: var(--space-8)  ← breathing room above new section

Never put more than 6 fields in one section.
If a section grows beyond 6, split it.
```

---

## 7.7 — Validation & Error System

Eia uses Zod for all validation. Every form has a schema.
Every error has a location. No orphaned messages.

### The Three Error Moments

**1 — On submit (always)**
All fields validate on form submission.
Errors appear inline, below each failing field.
The form does not scroll to the top. It stays where the user is.
The first error field receives focus automatically.

**2 — On blur (optional, for critical fields)**
Email, phone, and URL fields validate on blur (when the user leaves the field).
They do not validate on every keystroke — that is an interruption.
They validate when the user signals they are done with the field.

**3 — On change (only for real-time feedback)**
Password strength: updates on every keystroke (it is additive, not a warning).
Character count: updates on every keystroke (it is information, not a warning).
These are the only on-change validations. Everything else waits.

### Error Message Voice

Error messages in Eia are written in the first person, from the software's perspective.
They are factual, specific, and never blame the user.

```
❌ "Invalid email address"
✓  "This doesn't look like an email address"

❌ "Phone number is required"
✓  "We need a phone number to continue"

❌ "Password must contain at least 8 characters"
✓  "Password needs at least 8 characters"

❌ "Error: field cannot be empty"
✓  "This field can't be empty"

❌ "Invalid date format"
✓  "Enter a date like 14 Jan 2026"
```

The voice is the same voice Lia uses. Calm. Human. Direct.
Never technical. Never accusatory. Never passive-aggressive.

### Zod → UI Error Mapping

```typescript
// lib/validations/form-errors.ts
// Canonical error message map — all forms use this

export const formErrors = {
  required: "This field can't be empty",
  email: "This doesn't look like an email address",
  phone: "Enter a valid phone number",
  url: "Enter a valid URL — include https://",
  minLength: (n: number) => `Needs at least ${n} characters`,
  maxLength: (n: number) => `Maximum ${n} characters`,
  min: (n: number) => `Must be at least ${n}`,
  max: (n: number) => `Must be no more than ${n}`,
  dateInvalid: "Enter a date like 14 Jan 2026",
  dateFuture: "This date needs to be in the future",
  datePast: "This date needs to be in the past",
  duplicate: "This already exists",
  serverError: "Something went wrong — please try again",
} as const;

// Usage in Zod schema:
// .min(1, formErrors.required)
// .email(formErrors.email)
```

### Form-Level Errors

When the entire form fails (server error, network, conflict):

```
A banner appears above the submit button — not at the top of the form.
Near the action. Where the user's attention is.

Banner:
  bg: var(--color-danger-light)
  border: 1px solid var(--color-danger)
  border-radius: var(--radius-sm)
  padding: var(--space-3) var(--space-4)
  font: var(--text-sm) var(--color-danger-text)
  icon: AlertCircle w-4 h-4, left of text
  margin-bottom: var(--space-4)

Never use a toast for form errors.
Toasts disappear. Form errors must persist until resolved.
```

---

## 7.8 — Form Actions

### The Action Row

```
position: at the bottom of the form
layout: flex, justify-end, gap: var(--space-3)
margin-top: var(--space-8)  ← generous space above — actions are important

Order (left to right):
  1. Destructive action (Delete, Remove) — leftmost, danger variant
     separated from the main actions by flex-1 (pushed far left)
  2. Cancel / Back — secondary variant
  3. Primary action (Save, Create, Submit) — primary variant, rightmost

Mobile: full-width buttons, stacked vertically, primary on top
```

### Submit Behaviour

```
On submit click:
  1. Button enters loading state immediately (width preserved)
  2. Zod validates synchronously — errors appear, loading ends if invalid
  3. If valid: Server Action called
  4. On success: toast.success(), form resets or navigates
  5. On error: form-level error banner appears, button returns to default

The button never stays in loading state beyond the Server Action response.
If the action takes more than 3 seconds: Trigger.dev (per The Rules, Rule 11).
```

### Dirty State & Unsaved Changes

```
When a form has been modified and the user tries to navigate away:
  Browser confirm dialog: "You have unsaved changes. Leave anyway?"
  This is a browser native dialog — do not build a custom one.
  The browser's pattern is expected. Do not invent a different one.

Implementation:
  useBeforeUnload hook when form isDirty
  React Hook Form's formState.isDirty is the source of truth
```

---

## 7.9 — Multi-Step Forms

Long forms that span multiple screens.
Used for: user creation wizard, lead import, onboarding flows.

```
Progress indicator:
  Horizontal step bar at the top of the modal or page
  Steps: numbered circles connected by a line
  Completed: filled circle, --theme-accent bg, check icon
  Current: filled circle, --theme-accent bg, step number
  Upcoming: empty circle, --theme-paper-border border, step number muted
  Line between: filled (--theme-accent) for completed, muted for upcoming
  Step label below each circle: .label-micro

Navigation:
  Back: secondary button, left side
  Next / Continue: primary button, right side
  Final step: "Save" or context-specific label — never "Submit"
  "Submit" feels like a form. "Save" feels like the user's choice.

Step validation:
  Each step validates independently on "Next".
  The user cannot proceed with errors on the current step.
  Previous steps retain their data when navigating back.
  Navigating back does not re-validate previous steps.

Step state persistence:
  React Hook Form with step-aware schema subset
  Full schema validates on final step only
```

---

## 7.10 — The Form Rules

```
RULE F-01 — Every form field has a label
            No placeholder-only fields. Placeholders disappear on type.
            The user needs to know what the field is after they've started typing.

RULE F-02 — Every form has one primary action
            One primary button. One submit path. One clear next step.
            Two primary buttons is a decision the form is making on behalf of the user.

RULE F-03 — Never disable the submit button for validation
            Let the user try to submit. Show them what went wrong.
            A greyed-out submit button with no explanation is a closed door
            with no sign telling you why.

RULE F-04 — Never clear a field on error
            The user typed something. Keep it. Show what's wrong with it.
            Clearing on error loses their work and forces them to type again.
            That is not a form. That is a punishment.

RULE F-05 — Required fields are marked, not assumed
            If a field is required, it says so. Not with an asterisk.
            With the "Required" badge per Section 7.2.
            If all fields are required, a note at the top says so,
            and individual badges are omitted.

RULE F-06 — Labels are always visible
            No labels that hide on focus (Material Design floating labels).
            They look clever. They are harder to use.
            The label is always above the field. Always.

RULE F-07 — Tab order follows visual order
            The tab key moves through fields top to bottom, left to right.
            No tabIndex manipulation that breaks this order.

RULE F-08 — Autofocus on the first field
            When a modal or page with a form opens,
            the first field receives focus automatically.
            The user can start typing immediately.
            They should not have to click into the form first.

RULE F-09 — Enter submits single-field forms
            Login (email + password), search, quick-add — Enter key submits.
            Multi-field forms: Enter moves to the next field only.
            Cmd+Enter submits multi-field forms.

RULE F-10 — Error messages are always specific
            Use the formErrors map from Section 7.7.
            Never let a Zod default message reach the user interface.
            "String must contain at least 1 character(s)" is not a message.
            It is an error log entry wearing a costume.
```

# Section 8 — Data Display Patterns

> Numbers are the language of trust.
> A number rendered inconsistently across two screens of the same software
> is a crack in the foundation. The user may not name it. But they feel it.
> And they stop trusting.
>
> This section is the contract for how Eia speaks numbers, dates,
> currencies, status, and absence. One voice. Everywhere.

---

## 8.1 — Philosophy

**Consistency is the only rule that matters here.**
A date formatted one way on a card and another way in a table
is not a style choice. It is a bug — one that erodes trust
faster than any visual inconsistency.

**Every display value passes through a formatter.**
Never format inline. Never `new Date().toLocaleDateString()` directly in a component.
Every value that renders to the user goes through
the canonical functions in `lib/utils/dates.ts`, `lib/utils/numbers.ts`,
and `lib/utils/display.ts`. These files are the single source of truth.

**Null and zero are different things.**
A lead with zero calls made is different from a lead with no call data.
A zero is a number. A null is an absence.
They render differently. They mean different things.
The system must never collapse them into the same display.

---

## 8.2 — Number Formatting

### Integers & Counts

```typescript
// lib/utils/numbers.ts

// Standard count — leads, tasks, records
formatCount(1234)      → "1,234"
formatCount(0)         → "0"
formatCount(null)      → "—"   ← em dash. Not "N/A". Not "-". Not "".

// Compact — dashboard metrics, stat cards
formatCompact(1234)    → "1.2K"
formatCompact(12340)   → "12.3K"
formatCompact(1234000) → "1.2M"
formatCompact(0)       → "0"
formatCompact(null)    → "—"

// Compact thresholds:
// Below 1,000:  show full number — "847"
// 1,000–9,999:  one decimal K — "1.2K"
// 10,000+:      no decimal K — "12K"
// 1,000,000+:   one decimal M — "1.2M"

// Percentage
formatPercent(0.742)   → "74.2%"
formatPercent(1.0)     → "100%"
formatPercent(0)       → "0%"
formatPercent(null)    → "—"
// Always one decimal unless the value is a whole number (74.0% → "74%")
```

### Currency

```typescript
// India is the primary market. INR is the default.
// formatCurrency always shows the symbol, never the code.

formatCurrency(125000, 'INR')      → "₹1,25,000"
formatCurrency(125000, 'USD')      → "$125,000"
formatCurrency(125000.50, 'INR')   → "₹1,25,000.50"
formatCurrency(0, 'INR')           → "₹0"
formatCurrency(null, 'INR')        → "—"

// INR uses the Indian numbering system: 1,00,000 not 100,000
// This is not a formatting preference. It is correct for the locale.
// Use Intl.NumberFormat with locale 'en-IN' for INR.

// Compact currency (stat cards, summaries)
formatCurrencyCompact(1250000, 'INR')  → "₹12.5L"
formatCurrencyCompact(10000000, 'INR') → "₹1Cr"
// L = Lakh (1,00,000), Cr = Crore (1,00,00,000)
// These are standard Indian financial abbreviations.
// Never "₹1.25M" for Indian currency. That is not how it is spoken.
```

### Metric Cards (stat display)

```
Large number on a stat card:
  Use formatCompact() for the primary value
  Use formatCount() when the number must be exact (invoice totals, balances)

Delta indicator (change from previous period):
  Positive: ↑ 12.4%  — color: var(--color-success-text)
  Negative: ↓ 8.1%   — color: var(--color-danger-text)
  Zero:     — 0%     — color: var(--theme-text-tertiary)
  Arrow: ↑ ↓ as unicode, not icons — they scale with font size

  Font: var(--text-xs) var(--weight-medium)
  Always show one decimal on delta percentages.
  "↑ 12%" and "↑ 12.0%" are different precision signals.
  Use formatPercent() — it handles the whole-number case.
```

---

## 8.3 — Date & Time Formatting

All dates are stored as UTC ISO 8601.
All dates are displayed in IST (Asia/Kolkata, UTC+5:30) unless the user's
context specifies otherwise. `formatDate()` from `lib/utils/dates.ts` handles this.

### Display Formats

```typescript
// The canonical formats — use these names in components

// Full date — detail views, forms, export headers
formatDate(date, 'full')        → "14 January 2026"

// Standard — tables, cards, most UI contexts
formatDate(date, 'standard')    → "14 Jan 2026"

// Short — dense tables, badges, tight spaces
formatDate(date, 'short')       → "14 Jan"  (omits year if current year)
                                → "14 Jan 25" (includes year if not current)

// Numeric — technical contexts, exports
formatDate(date, 'numeric')     → "14/01/2026"

// Relative — activity feeds, timestamps, "how long ago"
formatDate(date, 'relative')    → "just now"      (< 1 minute)
                                → "2 minutes ago"  (< 1 hour)
                                → "3 hours ago"    (< 24 hours)
                                → "Yesterday"      (previous calendar day)
                                → "14 Jan"         (this year, older)
                                → "14 Jan 2025"    (previous year)

// Time only
formatDate(date, 'time')        → "2:30 PM"   ← 12-hour, always
                                              ← no seconds unless explicitly needed

// Date + time — audit logs, activity timestamps
formatDate(date, 'datetime')    → "14 Jan 2026, 2:30 PM"
```

### Rules

```
RULE D-01 — 12-hour time, always
            IST users read 12-hour time. "14:30" is not natural here.
            "2:30 PM" is. No exceptions in the UI.

RULE D-02 — Relative time for recent events only
            Use 'relative' format only for events in the last 7 days.
            Beyond 7 days: 'standard' format.
            "14 days ago" is harder to parse than "14 Jan".

RULE D-03 — Omit year when it is the current year
            "14 Jan" not "14 Jan 2026" when the year is obvious.
            "14 Jan 2025" when it is a different year — the year earns its space.

RULE D-04 — Never show raw ISO strings in the UI
            "2026-01-14T09:30:00.000Z" is a database value.
            It is not a user-facing date. If this appears in the UI,
            a formatDate() call is missing somewhere. Find it.

RULE D-05 — Date ranges use an en dash, not a hyphen
            "14 Jan – 28 Jan 2026"  ← correct
            "14 Jan - 28 Jan 2026"  ← incorrect
            The en dash (–) is the range operator. The hyphen (-) is not.
```

---

## 8.4 — Phone Number Display

All phone numbers are stored as E.164 (`+919876543210`).
Display formatting makes them human-readable.

```typescript
// lib/utils/phone.ts

// Standard display — detail views, cards
formatPhone('+919876543210')    → "+91 98765 43210"

// Compact — table rows, tight spaces
formatPhone('+919876543210', 'compact')  → "98765 43210"
// Omits country code for domestic numbers when context is clear

// International — explicit country code always
formatPhone('+449876543210', 'international')  → "+44 9876 543210"

// Raw (for tel: links) — never displays to user
formatPhone('+919876543210', 'raw')  → "+919876543210"

// Null
formatPhone(null)  → "—"
```

---

## 8.5 — Status & Enum Display

Every status value in the database has a canonical display configuration.
Statuses are never rendered as raw strings.

### The Status Config Pattern

```typescript
// lib/constants/statuses.ts

export const leadStatuses = {
  new: { label: "New", variant: "info", dot: true },
  attempted: { label: "Attempted", variant: "warning", dot: true },
  in_discussion: { label: "In Discussion", variant: "accent", dot: true },
  won: { label: "Won", variant: "success", dot: true },
  lost: { label: "Lost", variant: "danger", dot: false },
  nurturing: { label: "Nurturing", variant: "neutral", dot: true },
  junk: { label: "Junk", variant: "neutral", dot: false },
} as const;

export const taskStatuses = {
  todo: { label: "To Do", variant: "neutral", dot: true },
  in_progress: { label: "In Progress", variant: "info", dot: true },
  in_review: { label: "In Review", variant: "warning", dot: true },
  blocked: { label: "Blocked", variant: "danger", dot: true },
  done: { label: "Done", variant: "success", dot: false },
  cancelled: { label: "Cancelled", variant: "neutral", dot: false },
} as const;

// Usage in components:
// const config = leadStatuses[lead.status]
// <Badge variant={config.variant} dot={config.dot}>{config.label}</Badge>
```

**The dot rule:**
Active / in-progress statuses have a status dot (the living indicator).
Terminal statuses (done, lost, cancelled, junk) do not.
A done task does not pulse. It is done.

---

## 8.6 — Null, Zero & Empty States

These three are not the same. They must never render the same way.

```
Zero (0):
  A real value. Render it as "0".
  "0 leads" is information. It means the pipeline is empty.
  Never render zero as a dash or as an empty string.

Null / undefined:
  Absent data. Render as "—" (em dash, U+2014).
  This means: the data does not exist or was never provided.
  Not a zero. Not nothing. An absence with a name.
  Consistent across all contexts: tables, cards, detail views.

Empty string "":
  Treat as null. Render as "—".
  An empty string in the database is a data quality issue.
  The UI should not surface it differently from null.

Not applicable:
  When a field genuinely does not apply to this record type,
  render as "—" with a tooltip on hover: "Not applicable for this type"
  Do not leave the field blank. Blank invites confusion about whether
  data is missing or simply not relevant.
```

### Empty Collections

When a list, table, or grid has no items:

```
Do not:
  Render an empty container with no explanation.
  Show "No data available" in default body text.
  Show a spinner that never resolves.

Do:
  Render the full empty state component (Section 5.99 — Detail 04):
  Playfair italic heading + optional sub-text + optional CTA.

Empty state copy is context-specific:
  Lead table, no leads:   "No leads yet."
  Task list, no tasks:    "Nothing on the list."
  Search, no results:     "No results for "[query]""  ← quote the query
  Filter, no matches:     "Nothing matches these filters."
                          + "Clear filters" link action
```

---

## 8.7 — Text Truncation

Long text that cannot fit its container must truncate gracefully.

```
Single line truncation:
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  Always accompanied by a title attribute for the full value:
  title={fullValue}  ← native browser tooltip on hover

Multi-line truncation (2–3 lines):
  display: -webkit-box
  -webkit-line-clamp: 2  (or 3)
  -webkit-box-orient: vertical
  overflow: hidden
  Also use title attribute or a Tooltip component for the full text

What never truncates:
  Error messages — never clip an error. If it does not fit, the layout is wrong.
  Names — truncate with title attribute, never silently.
  Monetary values — never truncate. If it does not fit, use compact format.
  Dates — never truncate. Use a shorter format variant instead.
```

---

## 8.8 — The Display Utils Contract

These functions live in `lib/utils/` and are the only path from raw data to displayed value.
No component calculates, formats, or transforms data inline.

```typescript
// lib/utils/numbers.ts
export function formatCount(value: number | null): string;
export function formatCompact(value: number | null): string;
export function formatPercent(value: number | null): string;
export function formatCurrency(value: number | null, currency?: string): string;
export function formatCurrencyCompact(
  value: number | null,
  currency?: string,
): string;
export function formatDelta(value: number | null): {
  text: string;
  direction: "up" | "down" | "flat";
};

// lib/utils/dates.ts
export function formatDate(
  date: Date | string | null,
  format: DateFormat,
): string;
export function toUTC(date: Date | string): Date;
export function isToday(date: Date | string): boolean;
export function isPast(date: Date | string): boolean;
export function isFuture(date: Date | string): boolean;
export function daysBetween(a: Date | string, b: Date | string): number;

// lib/utils/phone.ts
export function formatPhone(phone: string | null, style?: PhoneStyle): string;
export function normalizeToE164(phone: string, country?: string): string;

// lib/utils/display.ts
export function formatName(first: string | null, last: string | null): string;
// → "Priya Sharma" / "Priya" (if no last) / "—" (if both null)

export function formatInitials(
  first: string | null,
  last: string | null,
): string;
// → "PS" / "P" / "?" (never blank — Avatar always has something)

export function formatAddress(address: AddressRecord | null): string;
// → "Bandra West, Mumbai, Maharashtra 400050"

export function nullDisplay(value: unknown): string;
// → "—" if null/undefined/empty string, else String(value)
// The catch-all for any value that might be absent
```

**The rule:** If a value reaches a component in raw form and is displayed directly,
the component is responsible for a formatting bug that will appear eventually.
Use the util. Always.

---

## 8.9 — Data Display in Tables

Tables are where data display rules matter most —
the most information, the least space, the highest density of formatting decisions.

```
Column alignment:
  Text columns:     left-aligned  — natural reading direction
  Number columns:   right-aligned — decimal points align vertically
  Status columns:   left-aligned  — badge text reads left to right
  Date columns:     right-aligned in dense tables, left-aligned in standard
  Action columns:   right-aligned — actions are at the end of the row

Number alignment is the most important.
A currency column where numbers are left-aligned cannot be scanned vertically.
The eye needs the decimal point in the same column position on every row.

Column-specific formatting:
  Name column:      formatName() — never raw first_name + " " + last_name inline
  Phone column:     formatPhone('compact') — domestic format in tables
  Date column:      formatDate('short') — space is limited
  Currency column:  formatCurrency() — full format, right-aligned
  Status column:    Badge component from status config — never raw string
  Null cells:       "—" centered in the cell — not left-aligned, not blank
```

---

## 8.10 — Accessibility of Data

```
Screen readers and data:
  Formatted numbers need aria-label with the full spoken version.
  "₹1.2L" → aria-label="12 lakh rupees"
  "74.2%" → aria-label="74.2 percent"
  "3h ago" → aria-label="3 hours ago"

  Use the aria-label attribute on the containing span, not the visible text.
  The visible text is for sighted users. The label is for everyone.

Status badges:
  Always include role="status" on dynamically updating badges.
  Include the full label text even when the badge is icon-only.

Delta indicators:
  "↑ 12.4%" → aria-label="Increased by 12.4 percent"
  "↓ 8.1%"  → aria-label="Decreased by 8.1 percent"
  The arrow is decoration. The label is the information.
```

# Section 14 — Page Transition System

> The space between pages is not empty.
> It is an opportunity to orient the user —
> to say: you are moving, here is the direction, here is where you are going.
>
> A transition that says nothing wastes the moment.
> A transition that says too much steals attention.
> The right transition is felt, not seen.

---

## 14.1 — Philosophy

**Transitions are spatial, not decorative.**
When a user navigates from a list to a detail view,
they are moving forward — deeper into the information.
The animation should feel like moving forward.
When they navigate back, they should feel themselves returning.

**Transitions must be instant in intent.**
The user clicked. They want to be somewhere else.
The transition exists to smooth the arrival — not to delay it.
Total transition time including loading: never exceeds 400ms perceived.
If data takes longer, the transition completes and a skeleton holds the space.

**The page never goes blank.**
Between leaving one route and arriving at another,
something is always visible. Always.
A white flash between routes is a failure.
A skeleton is not a failure. A white flash is.

---

## 14.2 — The Transition Architecture

Eia uses Next.js App Router. Page transitions work in two layers:

```
Layer 1 — The route progress bar (always running)
          A thin line at the top of the paper surface.
          Starts the moment the user clicks a link.
          Completes when the new page is ready.
          Always present. Always the same. Never conditional.

Layer 2 — The page content transition (the arrival)
          The new page content enters after the route resolves.
          Skeleton holds the space while data loads.
          Content fades and rises into the skeleton's place.
```

These two layers are independent.
The progress bar tells the user something is happening.
The content transition tells the user they have arrived.

---

## 14.3 — Route Progress Bar

```
The line that tells the user the software heard them.

Position:   absolute top of .eia-paper, z-var(--z-sticky)
            not the browser chrome — inside the paper surface
            This keeps it themed. It respects the paper.

Height:     2px
Color:      var(--theme-accent)
            Gold on Earth. Teal on Water. Violet on Cosmos.
            The progress bar is always in the theme's voice.

Behaviour:
  Start:    width 0% → 30%, duration 300ms, --ease-out-expo
            Jumps to 30% immediately — the software is responding
  Progress: width 30% → 70%, duration 800ms, --ease-out-soft
            Slow crawl — honest about waiting
  Complete: width 70% → 100%, duration 200ms, --ease-out-expo
            then: opacity 1→0, duration 300ms, 100ms delay
            The line completes and fades. Never abrupt.
  Error:    color switches to var(--color-danger)
            width → 100%, then fade — same as complete

Implementation: use nprogress or a lightweight custom hook.
Never use the browser's built-in loading indicator.
It appears in the browser chrome, outside the paper.
We own the progress signal. It lives inside Eia.

Glow:
  box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent) 60%, transparent)
  The progress bar casts a soft glow on the paper edge above it.
  One line of CSS. The difference between a line and a light.
```

---

## 14.4 — Page Content Transitions

### The Standard Transition (list → list, same level)

```
Outgoing page:
  opacity: 1 → 0
  duration: var(--duration-fast) — 150ms
  easing:   var(--ease-in-out)
  The page does not slide. It dissolves quietly.

Incoming page:
  opacity: 0 → 1
  y: 6px → 0
  duration: var(--duration-slow) — 350ms
  easing:   var(--ease-out-expo)
  delay:    80ms after outgoing begins fading
            The new page arrives before the old one fully leaves.
            Overlap is intentional — no gap, no white flash.
```

### The Drill-Down Transition (list → detail)

```
The user is going deeper. The animation moves forward.

Outgoing (list):
  opacity: 1 → 0
  x: 0 → -16px    ← slides slightly left — recedes
  duration: 200ms, --ease-in-out

Incoming (detail):
  opacity: 0 → 1
  x: 24px → 0     ← arrives from the right — comes forward
  duration: 350ms, --ease-out-expo
  delay: 80ms
```

### The Return Transition (detail → list)

```
The user is going back. The animation reverses.

Outgoing (detail):
  opacity: 1 → 0
  x: 0 → 24px     ← slides right — retreats
  duration: 200ms, --ease-in-expo

Incoming (list):
  opacity: 0 → 1
  x: -16px → 0    ← arrives from the left — returns
  duration: 350ms, --ease-out-expo
  delay: 80ms
```

### The Modal/Sheet Transition (same page, overlay)

```
Not a page transition — the page does not change.
The overlay arrives on top. The page does not exit.

Overlay backdrop:
  opacity: 0 → 1, duration 200ms, --ease-in-out

Sheet (from right):
  x: 100% → 0, duration 350ms, --ease-out-expo

Sheet (from bottom — mobile):
  y: 100% → 0, duration 350ms, --ease-out-expo

Modal (centred):
  See Section 5.06 — modal enter spec
```

---

## 14.5 — Navigation Transition Rules

```
RULE P-01 — Detect direction from route hierarchy
            Drill-down: current route is a parent of the destination
            Return:     current route is a child of the destination
            Standard:   sibling routes — same level in the hierarchy

            Route hierarchy examples:
            /leads → /leads/[id]         = drill-down
            /leads/[id] → /leads         = return
            /leads → /tasks              = standard
            /tasks → /tasks/[id]/subtask = two levels drill-down
                                           same drill-down animation, same distance

RULE P-02 — Never animate the sidebar during navigation
            The sidebar is fixed. It does not move.
            Only the paper content transitions.
            Moving the sidebar during navigation creates spatial disorientation.

RULE P-03 — Never animate the TopBar during navigation
            The TopBar is sticky. The title updates in place.
            Title text crossfades: old title opacity 0→invisible,
            new title opacity 0→1, 150ms overlap.
            No sliding. No movement. Just a quiet change.

RULE P-04 — Skeleton appears before transition completes
            The incoming page renders its skeleton immediately.
            The skeleton arrives with the page transition.
            Data loads into the skeleton after arrival.
            The transition and the loading are parallel, not sequential.

RULE P-05 — Transitions respect reduced motion
            If useReducedMotion() returns true:
            All transitions become: opacity only, duration 100ms.
            No x/y movement. No scale. Just a fade.
            The page still changes. It just changes quietly.

RULE P-06 — Tab navigation within a page is not a transition
            Switching tabs inside a module (Leads → Tasks within the same domain)
            is not a page navigation. It is a state change.
            Use the tab animation from the component system.
            No route progress bar. No x/y movement.
            Content crossfades in place.
```

---

## 14.6 — Loading States During Transition

```
The sequence when navigating to a data-heavy page:

1. User clicks link
2. Route progress bar starts (0% → 30%)
3. Current page begins dissolving (150ms)
4. New page skeleton arrives (opacity 0→1, y 6→0, 350ms)
5. Route progress bar completes (→100%, fades)
6. Data loads into skeleton (standard skeleton→content transition)
7. Page is complete

Steps 3–5 happen simultaneously.
The user sees: the page change, a skeleton in the shape of the destination,
and the progress bar completing. Three signals of the same event.
They never wonder if the click registered.

If data arrives before the transition completes (fast connection):
  Skeleton is held for minimum 150ms before content swaps in.
  A skeleton that flashes in and out is worse than no skeleton.
  See Section 11 — the 150ms minimum rule.

If data is still loading after transition completes (slow connection):
  Skeleton remains until data arrives.
  No spinner overlay. No loading message.
  The skeleton is the loading state. It is sufficient.
```

---

## 14.7 — Domain Switching

When a user switches between domains (Finance → Concierge, Tech → Onboarding),
the transition is heavier — it signals a more significant context change.

```
Domain switch is a special transition class.

Outgoing domain:
  opacity: 1 → 0
  scale: 1 → 0.98
  duration: 250ms, --ease-in-out

Incoming domain:
  opacity: 0 → 1
  scale: 0.98 → 1
  y: 8px → 0
  duration: 400ms, --ease-out-expo
  delay: 100ms

The slight scale creates a sense of the old domain receding
and the new domain expanding into view.
It is more deliberate than a standard navigation.
The user has changed context, not just location.

The sidebar active state updates simultaneously:
  Active pill slides to the new domain nav item
  (Framer Motion layoutId — the pill travels, it does not jump)
  The module name in the TopBar crossfades.

Domain switch total perceived duration: ~500ms
This is the longest transition in Eia.
It earns this time because it represents the largest context shift.
```

---

## 14.8 — Implementation Notes for Cursor

```
Framework: Next.js 16 App Router
Transition library: Framer Motion (already in stack)

The page transition wrapper lives at:
  src/app/(dashboard)/layout.tsx

Every page inside (dashboard)/ inherits the transition.
No individual page implements its own transition logic.

AnimatePresence wraps the page slot:
  <AnimatePresence mode="wait">
    {children}
  </AnimatePresence>

Each page exports motion variants via a shared hook:
  usePageTransition(type: 'standard' | 'drill-down' | 'return' | 'domain')

The hook reads the navigation direction from a context:
  NavigationDirectionContext — set by the link component before navigation
  Links know their destination. They set the direction before the route changes.
  The incoming page reads the direction and applies the correct variants.

Route progress bar:
  A client component in the root layout.
  Listens to usePathname() + useSearchParams() changes.
  Not in the dashboard layout — in the root layout.
  It shows on all route changes including auth routes.

Custom scrollbar (paper surface):
  All scrollable areas inside .eia-paper:
  scrollbar-width: thin (Firefox)
  scrollbar-color: var(--theme-paper-border) transparent (Firefox)
  ::-webkit-scrollbar width: 4px (Chrome/Safari)
  ::-webkit-scrollbar-track: transparent
  ::-webkit-scrollbar-thumb: var(--theme-paper-border), --radius-full
  ::-webkit-scrollbar-thumb:hover: var(--theme-accent-muted)
  The scrollbar is themed. On Earth it is warm-bordered.
  On Cosmos it carries the violet border. It belongs.

Scroll restoration:
  Next.js App Router restores scroll position on back navigation by default.
  Do not override this behaviour.
  When navigating forward (drill-down), scroll to top automatically.
  This is handled by the layout transition wrapper.
```

---

## 14.9 — What Does Not Transition

Some things must never animate during navigation.
Movement here would create confusion, not clarity.

```
The sidebar           — fixed, never moves with navigation
The TopBar shell      — fixed, only the title text crossfades
Notification badges   — update in place, no animation
The user avatar       — static in the sidebar footer
Theme variables       — switch is handled by --transition-theme (Section 2.8)
                        not by the page transition system

The canvas itself     — never transitions between routes
                        The canvas is the world. The world does not change
                        when you walk from room to room.
                        Only the paper changes. The sky stays the same.
```

---

## 14.10 — Performance Contract

Page transitions touch opacity and transform only.
No layout properties are animated.

```
✓  opacity and transform on the page wrapper only
✓  Framer Motion uses GPU-composited layers (will-change: transform)
✓  Progress bar: CSS transition on width — one element, minimal paint
✓  Progress bar glow: box-shadow on a 2px element — negligible
✓  AnimatePresence mode="wait" — old page fully unmounts before new mounts
   (mode="sync" is faster but causes z-index conflicts on overlapping pages)
✗  Never animate the entire layout — only the page content zone
✗  Never use layout animations on the page wrapper (expensive at this scale)
✗  Never trigger a page transition on tab switch within a page
   (tabs are state changes, not navigation events)

Target: transition adds zero perceived latency.
The 150ms exit + 350ms entrance = 500ms theoretical.
With 80ms overlap and parallel skeleton loading,
perceived transition time is ~300ms.
The user is reading the skeleton while the transition completes.
Time is spent well.
```

# Section 15 — Lia Design Language

> Lia is not a feature added to Eia.
> She is in Eia the way a compass is in a ship.
> Not decorative. Not optional. Orientating.
>
> She does not wait to be summoned. She notices.
> She proposes. She waits for permission.
> When she acts, she acts with precision.
>
> Writing her design language is writing a character study.
> Character is revealed not in what someone says —
> but in how they appear in a room.

---

## 15.1 — Lia's Identity

Lia has three qualities that her visual language must carry at all times:

**Presence without intrusion.**
She is always available but never demanding.
She does not badge. She does not pulse red.
She does not compete with the user's work.
When she has something to say, she says it quietly.
When she does not, she breathes.

**Intelligence without arrogance.**
Her proposals are phrased as offerings, not conclusions.
Her visual language reflects this — suggestions appear in a contained surface,
never overwriting the existing UI, never taking over.
The user is always in control. Lia's design makes that visible.

**Warmth without informality.**
She is not a chatbot with a smiley face.
She is not a cold API response either.
She occupies the space between professional and personal —
the way a trusted colleague does.
Her typography is Playfair for display moments — considered, editorial, human.
Her body text is Geist — precise, readable, efficient.

---

## 15.2 — The Lia Glyph

The Lia glyph is Lia's face in the interface.
It is a custom SVG mark — not a Lucide icon, not an emoji, not a letter.
It lives at `src/components/ui/lia-glyph.tsx`.

```
Visual character:
  Minimal. Geometric. A mark that resolves into meaning on second look.
  It should feel like something discovered, not something designed.
  Circular base suggesting completeness, with an inner mark
  suggesting direction or attention — a compass, not a sun.

The glyph ALWAYS breathes when Lia is present.
The liaBreathe animation (Section 6.4) is never switched off
while the glyph is visible. It is the heartbeat.
Still glyph = Lia is not present. Breathing glyph = Lia is here.

Glow:
  filter: drop-shadow(
    0 0 8px color-mix(in srgb, var(--theme-accent) 40%, transparent)
  )
  The glow is always running alongside the breathe animation.
  It pulses with the same rhythm — when the glyph is brightest,
  the glow is widest. When the glyph dims, the glow contracts.
  One organism. One breath.

Sizes:
  xs  — 20px  sidebar icon, TopBar presence dot
  sm  — 28px  inline in chat messages, toast icon
  md  — 40px  Lia panel header, suggestion cards
  lg  — 64px  Lia welcome state, empty conversation
  xl  — 96px  full-screen Lia mode, onboarding

Colours:
  Primary:  var(--theme-accent)   ← always the theme accent
  On dark:  var(--theme-accent) at full opacity
  On paper: var(--theme-accent) at 90% opacity
  Muted (when Lia is in background): var(--theme-accent-muted)
  Never grayscale. Lia does not go grey.
```

---

## 15.3 — Lia's Surfaces

Lia appears in four distinct surfaces in Eia.
Each surface has a specific anatomy and purpose.

### Surface A — The Lia Panel (persistent side panel)

```
When active, a panel opens from the right side of the paper.
It does not push the main content — it overlays with a shadow.
The main content dims slightly (opacity 0.6) to acknowledge Lia's presence.

Dimensions:
  width: 400px on lg+, full width on mobile (bottom sheet)
  height: full paper height
  position: absolute right-0, top-0
  z-index: var(--z-modal) - 1  ← below modals, above content

Shell:
  background: var(--theme-paper)
  border-left: 1px solid var(--theme-paper-border)
  box-shadow: var(--shadow-sidebar) inverted (on the left edge)

Header (h-14):
  Lia glyph md + "Lia" in Playfair Display, --text-base, --weight-normal
  Right: close button (X, ghost, w-7 h-7)
  border-bottom: 1px solid var(--theme-paper-border)
  The glyph breathes in the header. Always.

Content area:
  flex-1, overflow-y auto, custom scrollbar (themed)
  padding: var(--space-4)

Input area (bottom):
  The Message Bar component (Section 5.11)
  position: sticky bottom-0
  bg: var(--theme-paper)
  border-top: 1px solid var(--theme-paper-border)
  padding: var(--space-3) var(--space-4) var(--space-5)
  placeholder: "Ask Lia anything about this page..."

Panel entrance:
  x: 40px → 0, opacity: 0 → 1
  duration: 400ms, --ease-out-expo
  Main content dims: opacity 1 → 0.6, duration 300ms

Panel exit:
  x: 0 → 40px, opacity: 1 → 0
  duration: 250ms, --ease-in-expo
  Main content restores: opacity 0.6 → 1, duration 300ms
```

### Surface B — The Lia Conversation (full-screen mode)

```
When the user enters the Lia conversation full-screen —
the paper becomes Lia's space entirely.

The shell:
  Same paper surface. Same shell. The sidebar remains.
  Only the TopBar changes: title becomes "Lia" in Playfair
  with the Lia glyph sm to the left of it.
  The trailing accent period (Section 5.99 Detail 03) remains.

Welcome state (empty conversation):
  Centred in the paper, vertically and horizontally.

  Lia glyph xl, breathing, full glow
  margin-bottom: var(--space-6)

  Greeting:
    Playfair Display, --text-display (48px), --weight-light, italic
    --theme-text-primary
    "Good morning."  ← time-aware greeting
    "Good afternoon."
    "Good evening."
    Single word. Period. Nothing more.
    The greeting knows when it is.

  Sub-text:
    Geist Sans, --text-base, --theme-text-secondary, --leading-relaxed
    max-width: 440px, centered
    "What would you like to explore today?"

  Capability chips (below sub-text):
    Horizontal row of suggestion chips, centered, flex-wrap
    gap: var(--space-2)
    Each chip: Pill lg accent variant with a leading icon
    Examples: "Analyse lead pipeline", "Review today's tasks",
              "Summarise this week", "Prepare a briefing"
    On click: chip text becomes the first message in the conversation
    Chips animate in with stagger: 60ms between each,
    opacity 0→1, y 4→0, 200ms each, --ease-out-expo
```

### Surface C — The Lia Inline Suggestion

```
Lia's most powerful and most restrained surface.
She surfaces a suggestion inside the existing UI —
not in a panel, not in a chat. Right where the user is working.

Trigger: Lia has noticed something relevant to the current view.
         She does not interrupt. She places a card.

Suggestion Card:
  position: appears below or adjacent to the relevant content
  background: var(--theme-accent-surface)
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)
  border-radius: var(--radius-md)
  padding: var(--space-3) var(--space-4)
  box-shadow: var(--shadow-accent-ring)

  Header row:
    Lia glyph xs + "Lia" --text-2xs --weight-semibold --theme-accent
    + dismiss button (X w-3.5 h-3.5, --theme-accent-muted, top-right)

  Body:
    --text-sm --theme-text-primary --leading-relaxed
    max 2 sentences. If it takes more than 2 sentences, it is not a suggestion.
    It is a report. Reports go in the panel.

  Action row (optional):
    One action maximum. Two actions if one is "Dismiss".
    Primary action: text-xs --weight-semibold --theme-accent, underlined on hover
    Dismiss: text-xs --theme-text-tertiary

  Entrance:
    opacity: 0→1, y: 6→0
    duration: 300ms, --ease-out-expo
    delay: 400ms after page load — never appears instantly
           Lia needs a moment to notice. Instant suggestions feel scripted.

  The 400ms delay is the most important detail in this component.
  It is the pause that makes Lia feel like she observed before speaking.
```

### Surface D — The Lia Action Proposal

```
When Lia wants to do something — send a message, update a field,
create a task, generate a report — she proposes. She never acts unilaterally.
This is Rule 13 from The_Rules. The design makes the rule visible.

Proposal Card:
  A more formal version of the Suggestion Card.
  Used exclusively for actions that will change data.

  background: var(--theme-paper)
  border: 1px solid var(--theme-paper-border)
  border-radius: var(--radius-lg)
  padding: var(--space-4) var(--space-5)
  box-shadow: var(--shadow-2)

  Header:
    Lia glyph sm + "Lia proposes" in --text-xs --weight-semibold --theme-accent
    .label-micro style — uppercase, tracked, tertiary

  Proposal title:
    Playfair Display, --text-base, --weight-semibold, --theme-text-primary
    One sentence. What Lia wants to do.
    Example: "Send a follow-up message to Priya Sharma."

  Proposal detail:
    --text-sm --theme-text-secondary --leading-relaxed
    The specifics. What will actually happen.
    Example: "I'll send: 'Hi Priya, following up on our discussion about
              the Bandra property. Would next Tuesday work for a call?'"

  Preview panel (when content is being generated):
    bg: var(--theme-paper-subtle)
    border: 1px solid var(--theme-paper-border)
    border-radius: var(--radius-sm)
    padding: var(--space-3)
    font: --font-mono, --text-sm
    --theme-text-secondary
    The actual content of the proposed action — readable, copyable.

  Action row:
    Two buttons. Always exactly two.
    Left:  "Approve" — Button primary md
    Right: "Dismiss" — Button ghost md
    gap: var(--space-3)
    The user always has a clear yes and a clear no.
    There is no ambiguity about what approving does.

  Approval animation:
    On "Approve" click:
      Button enters loading state
      Proposal card: border-color transitions to --color-success
      On completion: card fades and collapses (height → 0, 300ms)
      Toast: toast.lia() — "Action completed"

  Dismissal animation:
    On "Dismiss" click:
      Card fades and collapses immediately, 200ms
      No toast — dismissal is private. No announcement needed.
```

---

## 15.4 — Lia's Conversation UI

### Message Anatomy

```
Two types of message in Lia's conversation:
User messages and Lia messages. They are visually distinct.
Not just aligned differently — fundamentally different in form.

User message (right-aligned):
  max-width: 65%
  ml-auto (pushed right)
  background: var(--theme-paper)
  border: 1px solid var(--theme-paper-border)
  border-radius: var(--radius-md)
  but bottom-right corner: var(--radius-xs)   ← the tail detail
  padding: var(--space-3) var(--space-4)
  box-shadow: var(--shadow-1)
  font: --text-sm --theme-text-primary --leading-relaxed

  Timestamp:
    --text-2xs --theme-text-tertiary
    right-aligned, mt-1
    format: formatDate(time, 'time')  ← "2:30 PM"

Lia message (left-aligned):
  max-width: 78%   ← wider — Lia says more
  No bubble background.
  Left border: 2px solid var(--theme-accent)
  border-radius: 0 (the border is the container)
  padding: var(--space-2) 0 var(--space-2) var(--space-4)
  No box-shadow.

  The border is Lia's voice made visible.
  The absence of a bubble says: this is not a reply.
  This is a presence speaking.

  Lia glyph xs: absolute left -16px, top 8px
  Breathing always, even next to the message.

  Typography:
    --text-sm --theme-text-primary --leading-relaxed (1.65)
    Lia's messages breathe more than user messages.
    The line-height is the extra breath.

  Structured content in Lia messages:
    When Lia returns data, lists, or analysis —
    it renders as structured UI inside the message space,
    not as raw text. See 15.5.

  Timestamp:
    --text-2xs --theme-text-tertiary
    left-aligned below the message, mt-1
```

### Message Stream (typing / generating)

```
While Lia is generating a response:

Thinking state (before first token):
  liaDotPulse — 3 breathing dots (Section 6.4)
  Positioned where the message will appear
  Left-aligned, same position as Lia messages
  Duration: until first token arrives

Streaming state (tokens arriving):
  Text appears character by character — standard streaming
  The typing cursor (Section 6.4 liaTypingCursor) blinks at the end
  The message border (2px accent left border) is present from the first token
  The message grows downward as text streams in
  No height animation — natural document flow expansion

  Streaming text:
    Same typography as complete Lia messages
    The cursor blinks at 500ms intervals (steps(1), hard blink)
    Cursor disappears when streaming completes

Complete state:
  Cursor fades out (opacity 1→0, 300ms)
  Message is fully rendered
  If the message contains structured content (tables, cards, actions),
  those elements fade in after the text completes:
    opacity 0→1, y 4→0, 250ms --ease-out-expo
    stagger: 80ms between elements
```

### Conversation Layout

```
Container: flex flex-col, h-full

Message list:
  flex-1, overflow-y auto
  padding: var(--space-6) var(--space-6) var(--space-4)
  display: flex, flex-direction: column
  gap: var(--space-5)
  Always anchored to the bottom — new messages push older ones up
  Smooth scroll on new message arrival

Date separator:
  Centred between message groups from different days
  --text-2xs --theme-text-tertiary uppercase --tracking-wide
  flex items-center gap-3
  Lines either side: flex-1 hr, border-color var(--theme-paper-border)
  Examples: "Today", "Yesterday", "14 Jan 2026"

Message group:
  Messages from the same sender within 3 minutes are grouped.
  Only the first message in a group shows the avatar/glyph.
  Subsequent messages in the group have reduced top gap (var(--space-2))
  This creates a visual rhythm — bursts of conversation, not isolated pills.
```

---

## 15.5 — Structured Content in Lia Messages

Lia does not only speak in prose.
When she analyses data, she surfaces it as structured UI —
embedded directly in the conversation flow.

```
Each structured content type has a specific container:

Data Table (when Lia returns tabular data):
  Inline table, max 5 columns
  Same spec as Section 5.07 but at 90% scale
  Rounded corners on the table container
  No box-shadow — it is inside the message, not floating

Metric Summary (when Lia returns numbers):
  2–4 stat cards in a horizontal row
  Each: label (micro), value (--text-xl --weight-semibold)
  Same token usage as stat cards on the dashboard
  Contained in a card shell (subtle tone)

Lead / Contact Card (when Lia references a person):
  Avatar md + name (--text-sm --weight-semibold) + role/status
  Clickable — navigates to the lead or contact record
  Hover: --shadow-2, background shifts to --theme-paper-subtle

Action Proposal (when Lia suggests taking action):
  The Proposal Card from Surface D, embedded in the message flow
  Appears after the prose explanation, not instead of it
  Lia explains what she wants to do, then shows the proposal card below

Code / Technical (when Lia returns formatted data):
  bg: var(--theme-canvas) at 95% opacity on light paper
  border: 1px solid var(--theme-paper-border)
  border-radius: var(--radius-sm)
  font: --font-mono --text-sm
  padding: var(--space-3) var(--space-4)
  Pre-formatted, horizontally scrollable if needed
  Copy button: absolute top-2 right-2, icon-sm ghost button
```

---

## 15.6 — Lia's Presence Indicators

Lia has presence states that the rest of the interface acknowledges.

```
Available (default):
  Lia glyph in sidebar: breathing at normal rhythm (3s cycle)
  No badge. No indicator. Just the breath.

Processing (Lia is working on something in the background):
  Lia glyph: breathing rhythm increases slightly (2s cycle)
  A subtle amber tint enters the glow:
  color-mix(in srgb, var(--theme-accent) 60%, var(--color-warning) 40%)
  No badge. No spinner. The rhythm change is enough.
  The user who looks will notice. The user who does not look is not interrupted.

Complete (Lia finished a background task):
  toast.lia() fires (Section 13 — the Lia toast type)
  Glyph returns to normal rhythm
  The toast is the announcement. The glyph's calm return is the confirmation.

Awaiting approval (Lia proposed an action, waiting for response):
  Lia glyph: a single soft pulse every 6 seconds
  Slower than normal breathe — patient, not urgent
  The glyph is waiting. Its rhythm says so.
  A small accent dot on the sidebar nav item: w-1.5 h-1.5
  bg: var(--theme-accent), position: absolute top-0.5 right-0.5
  border-radius: --radius-full
  This is the only badge Lia ever shows. One dot. Never a number.
```

---

## 15.7 — Lia's Voice in the UI

Design is not only visual. Lia's written voice is part of her design language.
Every string Lia displays follows these rules.

```
Lia speaks in first person:
  "I noticed three leads haven't been contacted this week."
  Not: "Three leads have not been contacted this week."
  The "I noticed" makes it an observation, not an accusation.

Lia proposes, never commands:
  "I can send a follow-up if you'd like."
  Not: "Send follow-up."
  The offer is open. The user decides.

Lia is specific, never vague:
  "Priya Sharma's follow-up is overdue by 3 days."
  Not: "Some follow-ups need attention."
  Vague suggestions are not suggestions. They are noise.

Lia acknowledges when she does not know:
  "I don't have enough context to suggest an action here."
  Not silence. Not a spinner. A direct statement.

Lia's empty states are different from the rest of Eia:
  Standard empty state (Section 5.99 Detail 04) uses Playfair italic.
  Lia's empty states use Playfair italic in Lia's first person voice.
  "Nothing on my radar right now."
  "I'm watching, but all looks well."
  "Ask me anything about what's happening here."
  The difference: standard empty states are descriptive.
  Lia's empty states are alive. She is there, even in silence.

Lia's error states:
  "I ran into something unexpected. Try again?"
  Not: "An error occurred."
  She is accountable, not technical.
  She is asking, not reporting.
```

---

## 15.8 — Lia's Access to Domain Context

This is a design rule, not just a technical one.

```
Lia always knows which domain the user is currently in.
Her suggestions are scoped to that domain.

When a user is in Finance:
  Lia's suggestions are about Finance data.
  She does not surface Concierge insights unless asked.

When a user has cross-domain grants (Section 5 — RBAC):
  Lia can surface insights from granted domains.
  She always labels the source: "In the Concierge domain, I noticed..."
  She never silently crosses domain boundaries.

The visual signal for cross-domain insights:
  The suggestion card carries a domain badge (Pill sm accent variant)
  top-right corner: "Concierge" or "Finance" — the source domain
  This makes domain attribution visible and auditable.
  The user always knows where Lia's insight came from.
```

---

## 15.9 — The Rules That Make Lia Premium

```
RULE L-01 — Lia never appears without the glyph breathing
            A static glyph means Lia is not present.
            If she is present, she breathes. No exceptions.

RULE L-02 — Inline suggestions always have a 400ms delay
            Instant suggestions feel scripted.
            The delay creates the impression of observation.
            Do not reduce this delay for performance.
            If 400ms is a problem, the page is loading too much.

RULE L-03 — Proposal cards always have exactly two actions
            Approve and Dismiss. Never three. Never one.
            One action (Approve only) removes the user's agency.
            Three actions introduce decision paralysis.
            Two actions is a conversation. Yes or no.

RULE L-04 — Lia never shows a number badge
            One dot, or no dot. Never a count.
            Counts create anxiety. A dot creates awareness.
            The user will open Lia when they are ready.
            The dot says she is waiting. It does not say how long.

RULE L-05 — Lia's messages are never in a bubble on a coloured background
            The left-border design is Lia's identity.
            A bubble makes her look like a chatbot.
            The border says: this is not a response. This is a presence speaking.

RULE L-06 — Structured content appears after text, never instead of it
            Lia always explains in prose before showing structured data.
            A table with no context is a database result.
            A prose explanation followed by a table is intelligence.

RULE L-07 — Cross-domain insights are always labelled
            When Lia surfaces insight from another domain,
            the source domain is visible on the card.
            No silent boundary crossing. Ever.
            This is trust. Trust is Lia's entire value.

RULE L-08 — Lia's colour is always the theme accent
            On Earth she is gold. On Water she is teal. On Cosmos she is violet.
            She does not have her own fixed colour.
            She belongs to the world she lives in.
            She is of Eia, not placed inside it.
```

---

## 15.10 — What Lia Is Not

These are the design anti-patterns that will be proposed and must be refused.

```
Lia is not a chatbot widget
  She does not live in a floating bubble in the corner.
  She does not have a "chat with us" button.
  She is not customer support.
  She lives inside the paper, accessed from the sidebar nav.

Lia is not a notification system
  She does not send push notifications.
  She does not email the user.
  She does not create urgency outside the product.
  Her only external signal is the single Lia toast.

Lia is not always-on visible
  Her panel is not always open.
  Her glyph in the sidebar is the only persistent indicator.
  The rest of Eia should be fully usable without ever opening Lia.
  She enhances. She does not require.

Lia is not a search bar
  She does not replace the search function.
  Searching for "leads from Mumbai" is search.
  "What should I do about my Mumbai leads?" is Lia.
  The distinction matters. They are separate surfaces.

Lia is not infallible
  Her error states are designed.
  Her "I don't know" response is designed.
  Designing for her limitations is as important as designing for her capabilities.
  A Lia that only appears when she is certain is a Lia that disappears
  exactly when the user needs help most.
```

# Section 16 — Colour Usage in Data Visualisation

> A chart is not a dump of numbers with colours applied.
> A chart is an argument. The colours are the rhetoric.
>
> Every colour in every chart in Eia is a decision.
> It encodes meaning. It creates hierarchy.
> It guides the eye to what matters.
>
> Random colour is not neutral. It is noise.
> And noise, in a data interface, costs trust.

---

## 16.1 — Philosophy

**Colour encodes meaning, not sequence.**
The most common mistake in data visualisation is assigning colours
in sequence — blue for the first series, orange for the second,
green for the third — because that is how the charting library defaults.

Colour should answer a question: _what does this colour mean?_
If the answer is "it means first" or "it means series B",
the colour is doing nothing. It is decoration pretending to be information.

**Theme-awareness is not optional.**
Every chart in Eia uses CSS variables, not hex values.
A chart built with hardcoded colours breaks when the theme switches.
A chart built with tokens becomes gold on Earth, teal on Water,
violet on Cosmos — without a single conditional.

**Less colour is more information.**
A chart with six different colours has six things to decode
before the user can read the data.
A chart with two colours — one for the primary series,
one for comparison — has two.
Start with one. Add a second only when the data requires distinction.
Add a third only when two is genuinely insufficient.
Never four. Four is a palette, not a signal.

---

## 16.2 — The Visualisation Palette

### Primary Series Colour

```
The first and most important series in any chart.
Always: var(--theme-accent)

On Earth:   #D4AF37  — warm gold
On Air:     #7b9fc4  — steel blue
On Water:   #2a9d8f  — volcanic teal
On Fire:    #e05c1a  — lava orange
On Cosmos:  #8b6fd4  — nebula violet

The primary series is the theme's voice in the chart.
The user sees the same accent colour they see on active nav items,
on buttons, on focus rings. The chart belongs to the same world.
```

### Secondary Series Colour

```
When a second series must be distinguished from the first.

Always: var(--theme-accent-muted)

On Earth:   #7a6b5d  — warm umber
On Air:     #a4bcd4  — pale steel
On Water:   #6abfb8  — sea glass
On Fire:    #d4875a  — cooling ember
On Cosmos:  #b09ee0  — distant arm

The secondary series is quieter. It supports the primary.
It never competes. If two series feel equal in colour weight,
one of them is wrong.
```

### Tertiary Series Colour

```
Only when three series are genuinely required.
Used sparingly. Never as a default.

Always: var(--theme-accent) at 35% opacity
  → color-mix(in srgb, var(--theme-accent) 35%, var(--theme-paper))

This creates a desaturated, lighter version of the accent —
clearly part of the same family, clearly subordinate.
Three series that feel like one family are readable.
Three random colours are a legend exercise.
```

### The Comparison Colour

```
When showing a comparison period, a benchmark, or a target line.

Always: var(--theme-text-tertiary)
  → on Earth: #b5a99a

The comparison is never the story. The current data is the story.
The comparison gives context. Context should be quiet.
A bright comparison line fighting the primary series
is a chart that cannot be read at a glance.
```

---

## 16.3 — Semantic Colours in Charts

Some data has inherent semantic meaning.
When it does, use the semantic colour system — not the visualisation palette.

```
Success / positive / above target:
  Fill:   var(--color-success-light)
  Stroke: var(--color-success)
  Label:  var(--color-success-text)

Warning / approaching threshold / at risk:
  Fill:   var(--color-warning-light)
  Stroke: var(--color-warning)
  Label:  var(--color-warning-text)

Danger / below target / critical / lost:
  Fill:   var(--color-danger-light)
  Stroke: var(--color-danger)
  Label:  var(--color-danger-text)

Neutral / no data / not applicable:
  Fill:   var(--theme-paper-subtle)
  Stroke: var(--theme-paper-border)
  Label:  var(--theme-text-tertiary)
```

**The rule:** Semantic colours override visualisation palette colours.
If a bar represents a failed deal, it is danger red — not primary accent.
If a segment represents on-track performance, it is success green — not secondary muted.
The semantic meaning of the data determines the colour.
The visualisation palette is for data that has no inherent good/bad/neutral meaning.

---

## 16.4 — Chart-Specific Colour Rules

### Bar Chart

```
Single series:
  All bars: var(--theme-accent)
  Hovered bar: var(--theme-accent) at 85% opacity
               box-shadow: 0 0 0 1px var(--theme-accent) at 30%
  All other bars on hover: var(--theme-accent) at 50% opacity
  This focus effect guides the eye to the hovered value
  while preserving context from the surrounding bars.

Multi-series:
  Series 1: var(--theme-accent)
  Series 2: var(--theme-accent-muted)
  Series 3: color-mix(in srgb, var(--theme-accent) 35%, var(--theme-paper))
  Maximum 3 series in a grouped bar chart.
  Beyond 3: use a stacked bar instead. Stacking compounds.
             Grouping beyond 3 creates a forest.

Semantic bars (status, performance):
  Use semantic colours per 16.3.
  Do not mix semantic and palette colours in the same chart.
  A chart is either semantic (all bars carry meaning)
  or categorical (all bars use the palette).
  Never half and half.

Bar radius:
  top corners only: --radius-xs (4px)
  The bar touches the baseline — no radius on bottom corners.
  A bar with radius on all corners floats. It is not anchored.
  A bar with radius only on top is grounded and finished.
```

### Line Chart

```
Primary line:
  stroke: var(--theme-accent)
  stroke-width: 2px
  No fill under the line by default.
  Area fill (when used): var(--theme-accent) at 8% opacity, fading to 0%
  gradient from top to baseline — never a flat fill.
  The gradient suggests height without obscuring the grid.

Comparison line:
  stroke: var(--theme-text-tertiary)
  stroke-width: 1.5px
  stroke-dasharray: 4 3  ← dashed. The comparison is different in kind.
  No area fill.

Data points:
  Visible only on hover.
  Default: no dots on the line — the line is the data.
  Hover: dot w-3 h-3 bg var(--theme-accent), border 2px var(--theme-paper)
  The white border creates a halo — the dot sits on the line, not in it.

Gridlines:
  Horizontal only. Vertical gridlines are noise.
  stroke: var(--theme-paper-border)
  stroke-dasharray: none — solid, very light
  Never bold gridlines. The grid is infrastructure, not content.

Zero line (when data crosses zero):
  stroke: var(--theme-text-tertiary)
  stroke-width: 1px
  The zero line is slightly more visible than the gridlines.
  It is the baseline reality. Everything else is deviation from it.
```

### Donut / Pie Chart

```
Preferred: donut over pie.
A donut has a centre that can hold a summary metric.
A pie has a centre that holds nothing.

Segment colours follow a specific order — always this order:
  1. var(--theme-accent)            ← primary — largest or most important segment
  2. var(--theme-accent-muted)      ← secondary
  3. var(--color-info)              ← tertiary if needed
  4. var(--color-success)           ← fourth if needed
  5. var(--theme-text-tertiary)     ← catch-all / other / remainder

"Other" or remainder segments are always last and always tertiary colour.
They exist to complete the 100% — they are not a featured segment.

Donut stroke width: 20px — substantial enough to read clearly.
                    Below 16px, segments become too thin for labels.
                    Above 24px, the centre metric loses breathing room.

Gap between segments: 2px in var(--theme-paper) colour.
The gap is a breath between values — not a design decision, a clarity decision.

Centre metric (donut only):
  Primary value: var(--text-2xl) var(--weight-semibold) var(--theme-text-primary)
  Label below:   .label-micro var(--theme-text-tertiary)
  Example: "₹12.5L" / "TOTAL PIPELINE"

Hover state:
  Hovered segment: slight outward offset (translateX/Y by 4px toward the outside)
  Opacity of other segments: 0.6
  Tooltip appears (see 16.6)
```

### Progress Bar / Pipeline Stage Chart

```
This is the chart most specific to Eia's use case —
showing pipeline stages, conversion rates, task completion.

Single value:
  Fill: var(--theme-accent)
  Track: var(--theme-paper-subtle)
  border-radius: --radius-full on both track and fill

Multi-stage pipeline:
  Each stage has its own semantic colour:
  New:           var(--color-info)
  In Discussion: var(--theme-accent)
  Won:           var(--color-success)
  Lost:          var(--color-danger)
  Nurturing:     var(--color-warning)
  Other:         var(--theme-text-tertiary)

  Stages render left to right, proportional to count.
  Gap: 2px var(--theme-paper) between stages.
  Each stage's fill is the semantic colour at full opacity.
  Rounded outer corners on first and last segment only.

Threshold / target line:
  A vertical line at the target percentage.
  stroke: var(--theme-text-tertiary), stroke-width: 1.5px
  A small label above: "Target: 60%" in .label-micro
```

### Scatter Plot

```
Used in Eia for: lead scoring, performance mapping, cohort analysis.

Points:
  Default: var(--theme-accent) at 60% opacity
           opacity allows overlap to be visible — dense areas darken
  Size: mapped to a third variable if needed (bubble chart variant)
        minimum 4px diameter, maximum 20px

Hover:
  Hovered point: var(--theme-accent) at full opacity, w-3 h-3
  All other points: var(--theme-accent) at 30% opacity
  Tooltip appears (see 16.6)

Quadrant lines (when used):
  Same as zero line: var(--theme-text-tertiary), 1px, solid
  Quadrant labels: .label-micro var(--theme-text-tertiary)
  Quadrant fills (optional): the relevant quadrant at 2–3% opacity
```

---

## 16.5 — Chart Surface & Container

Every chart in Eia lives in a Card (Section 5.04).
The chart is content inside the card. The card is the container.

```
Card shell:
  Standard card spec — bg var(--theme-paper),
  border var(--theme-paper-border), --radius-md, --shadow-1

Chart header (inside Card.Header):
  Left: chart title — --text-sm --weight-semibold --theme-text-primary
  Sub:  period or context — --text-xs --theme-text-secondary
  Right: optional controls (period selector, download, expand)

Chart area:
  padding: var(--space-2) var(--space-2) var(--space-4)
  The chart breathes inside the card.
  Never flush to card edges.

Axis labels:
  font: var(--text-2xs) var(--weight-normal) var(--theme-text-tertiary)
  Never bold. Axis labels are infrastructure.

Axis lines:
  stroke: var(--theme-paper-border)
  Y-axis line: none (gridlines handle this)
  X-axis line: 1px solid var(--theme-paper-border)

Legend:
  Position: below the chart, never to the right.
  A legend to the right creates a dead zone in the chart's visual space.
  Below the chart, the full width is available for data.

  Legend item: flex items-center gap-1.5
    Dot: w-2 h-2 --radius-full, series colour
    Label: --text-xs --theme-text-secondary

  Legend gap: var(--space-4) between items
  Legend top margin: var(--space-4) from chart base

Empty chart state:
  The chart container renders at full size.
  Inside: the standard Eia empty state (Section 5.99 Detail 04)
  Playfair italic: "No data for this period."
  Never a blank chart with empty axes — the axes imply data exists.
  If there is no data, there are no axes. Just the empty state.
```

---

## 16.6 — Tooltips in Charts

```
Chart tooltips are the most read text in data-heavy views.
They must be immediate, precise, and legible in all themes.

Container:
  bg: var(--theme-canvas)          ← inverted surface — stands above the chart
  border: 1px solid rgba(255,255,255,0.10)
  border-radius: var(--radius-sm)
  box-shadow: var(--shadow-2)
  padding: var(--space-2) var(--space-3)
  pointer-events: none              ← never blocks hover on nearby elements

Typography:
  Label:  --text-2xs --weight-semibold var(--theme-canvas-text) at 60% opacity
          uppercase, --tracking-wide
  Value:  --text-sm --weight-semibold var(--theme-canvas-text)
  Delta:  --text-xs, semantic colour (success/danger as appropriate)

Multi-series tooltip:
  Each series has a colour dot (w-1.5 h-1.5 --radius-full, series colour)
  followed by the series name and value on the same line.
  Values right-aligned in the tooltip — numbers stack for comparison.

Position:
  Always above the data point, never below (below is cut off at chart bottom).
  Horizontal: centred on the data point,
              constrained within chart bounds (never clips outside).

Animation:
  opacity 0→1, y 4→0, duration 150ms --ease-out-expo
  Instant is jarring. 150ms is fast enough to feel immediate.
```

---

## 16.7 — Chart Animation

```
Data enters. Data does not appear.

Bar chart entrance:
  Bars grow from baseline upward.
  scaleY: 0→1, transform-origin: bottom
  duration: 600ms --ease-out-expo
  stagger: 30ms per bar — max 400ms total stagger
  The chart builds itself left to right.

Line chart entrance:
  The line draws itself from left to right.
  stroke-dashoffset animation: totalLength → 0
  duration: 800ms --ease-out-expo
  Area fill fades in after line completes: opacity 0→1, 300ms

Donut chart entrance:
  Segments appear clockwise from 12 o'clock.
  stroke-dashoffset animation per segment.
  duration: 600ms --ease-out-expo
  stagger: 100ms per segment

Data update (value changes):
  Bars: height transitions smoothly — 400ms --ease-out-expo
  Lines: path morphs — 400ms --ease-out-expo
  Numbers in centre metric: count up from old to new value
                             duration: 600ms, linear
                             This is the only place linear easing is correct in Eia.
                             Numbers counting at a constant rate feels honest.

Reduced motion:
  All entrance animations: opacity only, no transforms
  All updates: instant, no counting animation
```

---

## 16.8 — The Data Viz Rules

```
RULE V-01 — Colour encodes meaning, never sequence
            If two series are assigned colours because they are
            "first" and "second", the colours are wrong.
            Assign colours based on what the series represents.

RULE V-02 — Maximum 3 colours in a single chart
            Four colours is a legend test.
            Three colours is a chart.
            If the data requires four distinctions,
            reconsider the chart type before adding a fourth colour.

RULE V-03 — Semantic data uses semantic colours
            Pipeline stages, task statuses, lead statuses —
            these have meaning. Use the semantic colour system.
            Do not assign arbitrary accent colours to data
            that has a defined good/bad/neutral reading.

RULE V-04 — No hardcoded hex values in chart components
            All chart colours come from CSS variables.
            A chart with hardcoded #D4AF37 will be gold in Cosmos.
            A chart with var(--theme-accent) will be correct everywhere.

RULE V-05 — Gridlines are horizontal only
            Vertical gridlines add visual noise without adding information.
            The X-axis is the time or category axis — it is self-describing.
            Only the Y-axis needs reference lines.

RULE V-06 — The comparison series is always quieter than the primary
            var(--theme-text-tertiary) for comparison lines.
            Dashed stroke for comparison lines.
            The current period is the story.
            The previous period gives it meaning.
            Meaning is quiet.

RULE V-07 — Empty charts show empty states, not empty axes
            Empty axes imply data exists but is not visible.
            An empty state says: there is nothing to show here.
            These are different messages. Use the right one.

RULE V-08 — Tooltips use the canvas background
            var(--theme-canvas) as tooltip background —
            the inverted surface ensures the tooltip always contrasts
            with the chart, regardless of what theme is active.
            A white tooltip on a light chart surface is invisible.

RULE V-09 — Number animations use linear easing
            Counting numbers (the one exception to the no-linear rule).
            A number counting at a constant rate feels honest.
            An eased count (starting fast, slowing down) feels theatrical.
            Data should feel honest. Always.

RULE V-10 — Recharts is the only charting library
            Already in the stack. No additional charting libraries.
            Recharts supports custom components for every element —
            there is nothing it cannot render with sufficient effort.
            A second charting library doubles the bundle and halves the consistency.
```

---

## 16.9 — Recharts Token Integration

Recharts uses prop-based styling, not CSS classes.
Bridging the token system into Recharts requires a canonical helper.

```typescript
// lib/utils/chart-tokens.ts
// The single source of truth for chart colours in Recharts.
// Call getChartTokens() once per chart component.
// Pass the result as props to Recharts elements.

import { useTheme } from "@/lib/hooks/use-theme";

export function getChartTokens() {
  const style = getComputedStyle(document.documentElement);

  const get = (token: string) => style.getPropertyValue(token).trim();

  return {
    // Series colours
    primary: get("--theme-accent"),
    secondary: get("--theme-accent-muted"),
    comparison: get("--theme-text-tertiary"),

    // Semantic colours
    success: get("--color-success"),
    warning: get("--color-warning"),
    danger: get("--color-danger"),
    info: get("--color-info"),
    neutral: get("--color-neutral"),

    // Surface colours
    grid: get("--theme-paper-border"),
    axis: get("--theme-text-tertiary"),
    tooltip_bg: get("--theme-canvas"),
    tooltip_fg: get("--theme-canvas-text"),

    // Derived
    primary_glow: `color-mix(in srgb, ${get("--theme-accent")} 15%, transparent)`,
    primary_area: `color-mix(in srgb, ${get("--theme-accent")} 8%, transparent)`,
  };
}

// Usage in a chart component:
// const t = getChartTokens()
// <Bar fill={t.primary} />
// <Line stroke={t.comparison} strokeDasharray="4 3" />
// <CartesianGrid stroke={t.grid} />
// <XAxis tick={{ fill: t.axis, fontSize: 10 }} />
```

**Theme change reactivity:**
Charts must re-read tokens when the theme changes.
Use a `useEffect` that listens to the `data-theme` attribute mutation
and calls `getChartTokens()` to refresh.
Without this, switching from Earth to Cosmos leaves gold charts on violet canvas.

# Design DNA — Addendum A

## Three Sections Completed

---

# Addendum A.1 — Semantic Colours on Dark Surfaces

> The semantic colour system (Section 2.1) was designed for paper surfaces.
> Success green on warm cream paper. Danger red on white paper.
> But Eia has dark surfaces too — the canvas, the sidebar, tooltips,
> the Lia code block, the toast container.
> On dark, the same semantic values that work beautifully on paper
> become either invisible or too harsh.
> This addendum completes the system.

---

## The Problem

```
--color-success: #3a7d52  on  --theme-canvas: #0d0c0a
→ Dark green on near-black. Barely legible. Lacks presence.

--color-danger-light: #faecea  on  --theme-canvas: #0d0c0a
→ Pale pink on black. Completely wrong surface pairing.
```

The light variants (`-light`) exist for paper surfaces.
They are fills — backgrounds for badges, alerts, toast fills on white.
They have no place on dark surfaces.

On dark surfaces, the relationship inverts:

- The colour becomes the text/icon — luminous, readable
- The fill becomes a subtle tint of the colour — low opacity, present but not glaring

---

## The Dark Surface Semantic Tokens

Add these to the global token map in Section 2.1.
They activate on any dark surface — canvas, sidebar, tooltips, code blocks.

```css
/* ============================================================
   SEMANTIC COLOURS — DARK SURFACE VARIANTS
   Used on: --theme-canvas, --theme-sidebar-bg, tooltip bg,
            Lia code blocks, any surface darker than #333
   ============================================================ */

/* Success — dark surface */
--color-success-dark-text: #6ee09e; /* luminous green — readable on dark    */
--color-success-dark-fill: rgba(58, 125, 82, 0.18); /* subtle green tint     */
--color-success-dark-border: rgba(58, 125, 82, 0.3); /* visible but not harsh */

/* Warning — dark surface */
--color-warning-dark-text: #fbbf5a; /* warm amber — legible, not garish     */
--color-warning-dark-fill: rgba(184, 122, 16, 0.18);
--color-warning-dark-border: rgba(184, 122, 16, 0.3);

/* Danger — dark surface */
--color-danger-dark-text: #f87272; /* clear red — urgent but not screaming */
--color-danger-dark-fill: rgba(184, 58, 40, 0.18);
--color-danger-dark-border: rgba(184, 58, 40, 0.3);

/* Info — dark surface */
--color-info-dark-text: #60a5fa; /* cool blue — calm and readable        */
--color-info-dark-fill: rgba(40, 96, 160, 0.18);
--color-info-dark-border: rgba(40, 96, 160, 0.3);

/* Neutral — dark surface */
--color-neutral-dark-text: rgba(255, 255, 255, 0.55); /* muted white        */
--color-neutral-dark-fill: rgba(255, 255, 255, 0.06);
--color-neutral-dark-border: rgba(255, 255, 255, 0.12);
```

---

## Where Each Is Used

```
Toast container (bg: --theme-canvas):
  The toast background is canvas-dark.
  The living bar and icon use the standard semantic colours (full opacity).
  These are still correct — a bright green bar on dark canvas is right.
  But if a badge or pill appears inside a toast body,
  it uses --color-*-dark-fill and --color-*-dark-text.

Sidebar alerts / inline indicators:
  Any semantic indicator in the sidebar uses dark variants.
  The sidebar bg is --theme-sidebar-bg (near-black).
  Standard light fills here are jarring.

Lia code blocks (bg: --theme-canvas at 95%):
  Any inline semantic highlight in a Lia code response uses dark variants.

Chart tooltips (bg: --theme-canvas):
  Semantic colours in tooltips (success delta, danger drop) use dark text variants.
  --color-success-dark-text for positive delta.
  --color-danger-dark-text for negative delta.
  These are luminous enough to read at small tooltip font sizes.

Dark tone cards (tone: 'dark' in Section 5.04):
  Cards with bg --theme-canvas use dark surface semantic variants for
  all badges, status pills, and inline indicators within them.
```

---

## The Rule

```
RULE S-01 — Surface determines semantic variant
            Paper surface:  use --color-*  and  --color-*-light
            Dark surface:   use --color-*-dark-text  and  --color-*-dark-fill

            The test: if the background is darker than #505050,
            use dark variants. If lighter, use standard variants.

            Never use --color-*-light fills on dark surfaces.
            Never use --color-*-dark-fill on paper surfaces.
            They were designed for opposite worlds.
```

---

---

# Addendum A.2 — Drawer / Sheet Component

> The drawer is the most used overlay surface in Eia.
> Client profiles, task details, Lia panel, mobile sidebar —
> all of them slide in from an edge and take their place above the content.
> It was referenced throughout the design DNA without ever being fully specced.
> This closes that gap.

---

## Anatomy

```
The drawer is a panel that enters from an edge.
It lives above the paper content. Below modals.
The backdrop dims but does not fully cover — the user
can still see where they came from.

Structure:
  .drawer-backdrop
    └── .drawer-panel
          ├── .drawer-handle    (mobile swipe target)
          ├── .drawer-header
          ├── .drawer-body
          └── .drawer-footer    (optional)
```

---

## The Backdrop

```
.drawer-backdrop:
  position: fixed, inset: 0
  z-index: var(--z-overlay)
  background: color-mix(in srgb, var(--theme-canvas) 50%, transparent)
  backdrop-filter: blur(4px)         ← one of the three sanctioned blur surfaces
  -webkit-backdrop-filter: blur(4px)

  Entrance: opacity 0→1, 200ms --ease-in-out
  Exit:     opacity 1→0, 200ms --ease-in-out

  Click on backdrop: dismisses the drawer
  This is always enabled. There is no "required" drawer that traps the user.
```

---

## The Panel

```
.drawer-panel:
  position: fixed
  z-index: var(--z-modal)
  background: var(--theme-paper)
  box-shadow: var(--shadow-3)
  display: flex, flex-direction: column
  overflow: hidden

Variants by origin edge:

  RIGHT (default — client profiles, task details, Lia panel):
    top: 0, right: 0, bottom: 0
    width: 480px (default), 640px (wide), 100% (mobile)
    border-radius: var(--radius-xl) 0 0 var(--radius-xl)
                   ← left corners rounded, right flush to edge
    border-left: 1px solid var(--theme-paper-border)
    Entrance: x: 100%→0, duration 350ms --ease-out-expo
    Exit:     x: 0→100%, duration 250ms --ease-in-expo

  BOTTOM (mobile modals, mobile Lia panel, action sheets):
    bottom: 0, left: 0, right: 0
    height: auto, max-height: 90dvh
    border-radius: var(--radius-xl) var(--radius-xl) 0 0
                   ← top corners rounded, bottom flush to screen edge
    border-top: 1px solid var(--theme-paper-border)
    Entrance: y: 100%→0, duration 350ms --ease-out-expo
    Exit:     y: 0→100%, duration 250ms --ease-in-expo

  LEFT (reserved — navigation drawer on mobile):
    top: 0, left: 0, bottom: 0
    width: 280px
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0
    border-right: 1px solid var(--theme-paper-border)
    Entrance: x: -100%→0, duration 350ms --ease-out-expo
    Exit:     x: 0→-100%, duration 250ms --ease-in-expo
```

---

## Internal Structure

```
.drawer-handle (bottom sheet only):
  width: 40px, height: 4px
  background: var(--theme-paper-border)
  border-radius: var(--radius-full)
  margin: var(--space-3) auto var(--space-1)
  flex-shrink: 0
  cursor: grab
  The handle signals: this can be dragged down to dismiss.
  Always visible on bottom sheets. Never on side drawers.

.drawer-header:
  padding: var(--space-4) var(--space-5)
  border-bottom: 1px solid var(--theme-paper-border)
  display: flex, align-items: center, justify-content: space-between
  flex-shrink: 0

  Title: --text-base --weight-semibold --theme-text-primary
  Sub:   --text-xs --theme-text-secondary, mt-0.5 (optional)
  Close: X icon button, ghost, w-8 h-8, right side
         always present — the user can always leave

.drawer-body:
  flex: 1
  overflow-y: auto
  padding: var(--space-5)
  Custom scrollbar (themed) — see Section 14.8 scrollbar spec

.drawer-footer (optional):
  padding: var(--space-4) var(--space-5)
  border-top: 1px solid var(--theme-paper-border)
  display: flex, justify-content: flex-end, gap: var(--space-3)
  flex-shrink: 0
  background: var(--theme-paper)  ← explicit — floats above scrolling body
  Used for: action buttons (Save, Cancel, Delete)
```

---

## Swipe to Dismiss (bottom sheet)

```
Bottom sheets support swipe-down to close.
Implementation follows Section 12.2 — Touch & Gesture Standards:

  Drag handle:      the .drawer-handle element (40px × 4px)
  Dismiss threshold: 40% of sheet height dragged, or velocity > 500px/s
  On dismiss:       sheet exits at current drag velocity
                    backdrop fades simultaneously

Visual feedback during drag:
  The sheet follows the finger in real time (no resistance)
  Below threshold: release returns sheet to origin, spring physics
                   stiffness: 300, damping: 30
  Above threshold: sheet exits with current velocity
                   no snap-back
```

---

## Width System

```
Drawer widths are named, not arbitrary:

  sm:      360px   compact — notification details, quick actions
  md:      480px   standard — client profiles, task details (default)
  lg:      640px   wide — data-heavy panels, Lia panel on wide desktop
  xl:      800px   full — report views, complex multi-tab drawers
  full:    100%    mobile and when content demands full viewport

Maximum width on any viewport: calc(100vw - 48px)
A drawer that fills the entire screen is a page, not a drawer.
Leave at least 48px of the original content visible.
This reminds the user they can close the drawer
and return to where they were.
```

---

## The Drawer Rules

```
RULE D-01 — Every drawer has a close button
            No drawer traps the user. X button, always, top-right.
            Clicking the backdrop also dismisses.
            Escape key dismisses. All three always work.

RULE D-02 — Drawer body scrolls, header and footer do not
            Sticky header and sticky footer.
            The action buttons are always visible regardless of scroll position.
            A Save button that scrolls off screen is an unusable form.

RULE D-03 — Bottom sheets have a drag handle
            Side drawers do not. The handle signals the gesture.
            A side drawer has no handle because side drawers are not dragged.

RULE D-04 — Maximum one drawer open at a time
            Drawers do not stack. If a second drawer is triggered while one is open,
            the first closes (with exit animation) and the second opens.
            Stacked drawers create spatial confusion.
            Exception: a modal can open on top of a drawer.

RULE D-05 — Drawer width leaves 48px of content visible
            The content behind the drawer is still partially visible.
            This preserves spatial context — the user knows where they are.
```

---

---

# Addendum A.3 — Scroll Behaviour

> Scroll is the most invisible interaction in software.
> When it is right, nobody notices.
> When it is wrong — the jump, the stutter, the missing restoration —
> everyone feels it even if they cannot name it.
> These are the rules that make scroll invisible.

---

## Global Scroll Rules

```css
/* Applied to html element */
html {
  scroll-behavior: smooth;
  /* Smooth scroll for anchor navigation and programmatic scrollTo() */
  /* Never for user-initiated scroll — the browser handles that natively */
}

/* Applied to all scrollable containers */
.scrollable {
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Prevents scroll chaining — reaching the bottom of a list
     does not trigger pull-to-refresh on the body.
     Applied to: sidebar nav, table containers, drawer body,
                 Lia conversation, modal body, any overflow-y-auto element */

  -webkit-overflow-scrolling: touch;
  /* Momentum scroll on iOS — the natural deceleration after a flick.
     Without this, scrolling on iPhone feels like dragging through mud. */
}
```

---

## Custom Scrollbar

Every scrollable surface inside `.eia-paper` uses the themed scrollbar.
The scrollbar is part of the design system. It is not the browser default.

```css
/* Firefox */
.scrollable {
  scrollbar-width: thin;
  scrollbar-color: var(--theme-paper-border) transparent;
}

/* Chrome, Safari, Edge */
.scrollable::-webkit-scrollbar {
  width: 4px;
}

.scrollable::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable::-webkit-scrollbar-thumb {
  background: var(--theme-paper-border);
  border-radius: var(--radius-full);
}

.scrollable::-webkit-scrollbar-thumb:hover {
  background: var(--theme-accent-muted);
  /* On hover the scrollbar acknowledges the user.
     Muted accent — present but never demanding. */
}
```

**On the canvas (sidebar, dark surfaces):**

```css
.sidebar-scrollable::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
}

.sidebar-scrollable::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.22);
}
```

The scrollbar is themed. On Earth the thumb is warm-bordered.
On Cosmos it carries the violet border on hover.
On the dark sidebar it is a whisper of white.
It belongs to the surface it lives on.

---

## Scroll Anchoring

```css
/* Prevents layout shifts from causing unexpected scroll jumps */
* {
  overflow-anchor: auto;
  /* The browser's default — but make it explicit.
     When new content loads above the viewport (prepended messages,
     new notifications), the viewport stays anchored to what the
     user was reading. They do not jump to the top. */
}

/* Exception: chat / message lists */
.message-list {
  overflow-anchor: none;
  /* Message lists anchor to the BOTTOM.
     New messages push existing ones up.
     The user stays at the bottom — the most recent message.
     Managed manually via scrollIntoView on new message arrival. */
}
```

---

## Scroll Restoration

```
Between route navigations, scroll position is managed explicitly:

Forward navigation (list → detail):
  Scroll to top of new page.
  The detail page starts at the beginning. Always.
  Implementation: window.scrollTo(0, 0) in the transition wrapper
                  before the entrance animation begins.

Back navigation (detail → list):
  Scroll position is restored to where the user was on the list.
  Next.js App Router handles this by default.
  Do NOT override this behaviour.
  A user who scrolled to record 47 and opened its detail
  should return to record 47 when they press back.
  This is spatial memory. Destroying it destroys trust.

Tab switching (within a page):
  Scroll position is preserved per tab.
  Switching from tab A to tab B and back to tab A
  returns to where tab A was scrolled to.
  Implementation: store scrollTop per tab in component state,
                  restore on tab activation.

Modal / drawer open:
  Body scroll is locked while the modal or drawer is open.
  Implementation:
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = scrollbarWidth + 'px'
    ← the padding prevents layout shift from scrollbar disappearing

  On close:
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
```

---

## Programmatic Scroll

```typescript
// lib/utils/scroll.ts
// All programmatic scroll goes through these functions.
// Never call window.scrollTo() or element.scrollTop directly in components.

// Scroll a container to its bottom (message lists, activity feeds)
export function scrollToBottom(
  element: HTMLElement,
  behavior: ScrollBehavior = "smooth",
): void {
  element.scrollTo({ top: element.scrollHeight, behavior });
}

// Scroll an element into view within its container
export function scrollIntoView(
  element: HTMLElement,
  options: ScrollIntoViewOptions = { block: "nearest", behavior: "smooth" },
): void {
  element.scrollIntoView(options);
}

// Lock body scroll (modal / drawer open)
export function lockBodyScroll(): void {
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  document.body.style.paddingRight = `${scrollbarWidth}px`;
}

// Restore body scroll (modal / drawer close)
export function unlockBodyScroll(): void {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}
```

---

## Scroll Performance

```
RULE SC-01 — No scroll event listeners for UI logic
            Scroll position tracking (for sticky headers, parallax,
            scroll-triggered animations) must use IntersectionObserver,
            not scroll event listeners.
            Scroll listeners on the main thread cause jank.
            IntersectionObserver is off-thread. It is the correct tool.

RULE SC-02 — Virtualise lists beyond 100 items
            A DOM with 500 lead cards rendered simultaneously
            is a DOM with a performance problem waiting to happen.
            Any list that can exceed 100 items uses virtual rendering.
            The window renders only what is visible plus a small buffer.
            The scroll container is the same size as if all items were rendered.
            The user does not notice. The main thread does.

RULE SC-03 — Images in scroll containers use loading="lazy"
            Images below the fold do not load until they approach the viewport.
            Avatar images in long lists, thumbnails in card grids —
            all lazy-loaded.
            A list of 50 avatars that all load immediately on mount
            is 50 network requests that block more important resources.

RULE SC-04 — Infinite scroll always has a bottom state
            An infinite scroll list must show one of three states at the bottom:
            Loading:    skeleton row or spinner
            End:        "That's everything." in --text-xs --theme-text-tertiary
            Error:      "Couldn't load more. Try again?" with retry action
            A list that silently stops loading looks broken.
            A list that tells the user it has ended feels complete.
```
