import { defineEnum } from "./define-enum";

// THE canonical theme vocabulary — <html data-theme> values, the
// profiles.theme column, and the SSR theme cookie all resolve against
// this list. Never re-inline the theme keys anywhere else.
// Adding a theme = one line here + a [data-theme] block in
// design-tokens.css + a CHECK-extending migration (0154/0155 precedent).
const DEF = defineEnum([
  { id: "earth",   label: "Earth"   },
  { id: "air",     label: "Air"     },
  { id: "water",   label: "Water"   },
  { id: "fire",    label: "Fire"    },
  { id: "martini", label: "Martini" },
  { id: "candy",   label: "Candy"   },
]);
// cosmos / coffee / macha were retired 2026-07-02 (migration 0156 moved any
// profiles on them back to earth). A stale cookie/DB value fails isThemeKey
// and falls back to DEFAULT_THEME — never re-add a key without a migration.

export const THEME_KEYS    = DEF.values;
export const THEME_OPTIONS = DEF.options;
export const THEME_ENUM    = DEF.zodEnum;

export type ThemeKey = (typeof THEME_KEYS)[number];

export const DEFAULT_THEME: ThemeKey = "earth";

export function isThemeKey(value: unknown): value is ThemeKey {
  return THEME_KEYS.includes(value as ThemeKey);
}

// SSR mirror of profiles.theme. The root layout reads this cookie so the
// server stamps the user's theme on <html> from the first byte — without it,
// the Earth default paints first and the real theme only lands when
// ThemeInitializer runs after hydration (the millisecond colour flash).
// profiles.theme stays the source of truth: ThemeInitializer re-syncs the
// cookie on every dashboard load, ThemeSelector on every switch.
export const THEME_COOKIE = "serene-theme";

const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client-only (document.cookie) — persist the SSR theme mirror. */
export function persistThemeCookie(theme: ThemeKey) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
