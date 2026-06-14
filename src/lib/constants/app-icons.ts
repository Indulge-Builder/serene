import { defineEnum } from "./define-enum";

// THE canonical app-icon (PWA homescreen icon) vocabulary — the values the
// profiles.app_icon column, the /api/manifest?icon= param, and the
// apple-touch-icon all resolve against. Built the same way as themes.ts.
//
// Each key maps to ONE square source image at /public/<key>.webp (1254×1254).
// A single large square covers both the manifest 192/512 slots (the browser
// downscales) and the maskable + apple-touch-icon surfaces. Adding a new
// option later is exactly two steps: drop /public/icon-5.webp and add one
// { id, label } line below. Nothing else changes — never interpolate a raw
// query/string into an icon path; resolve a validated key through iconSrc().
const DEF = defineEnum([
  { id: "icon-1", label: "Icon 1" },
  { id: "icon-2", label: "Icon 2" },
  { id: "icon-3", label: "Icon 3" },
  { id: "icon-4", label: "Icon 4" },
]);

export const ICON_KEYS    = DEF.values;
export const ICON_LABELS  = DEF.labels;
export const ICON_OPTIONS = DEF.options;
export const ICON_ENUM    = DEF.zodEnum;

export type IconKey = (typeof ICON_KEYS)[number];

export const DEFAULT_ICON: IconKey = "icon-1";

export function isIconKey(value: unknown): value is IconKey {
  return ICON_KEYS.includes(value as IconKey);
}

/**
 * THE only place an icon key becomes a file path. Takes a value of UNKNOWN
 * provenance (a query param, a DB column, a cookie), validates it against
 * ICON_KEYS, and returns the public path for the matched icon — or the
 * DEFAULT_ICON path when the value isn't a known key. A raw param can never
 * reach the returned string: an unrecognised value collapses to the default,
 * never to an attacker-supplied path. Both the manifest route and the
 * apple-touch-icon resolution call this — never build the path inline.
 */
export function iconSrc(value: unknown): string {
  const key = isIconKey(value) ? value : DEFAULT_ICON;
  return `/${key}.webp`;
}

// SSR mirror of profiles.app_icon — the root layout reads this cookie to point
// the <link rel="manifest"> at /api/manifest?icon=<saved> and stamp the
// apple-touch-icon from the FIRST byte, so a fresh install on a logged-in
// device bakes the user's saved icon into the shortcut without waiting for
// hydration. profiles.app_icon stays the source of truth: IconInitializer
// re-syncs the cookie on every dashboard load, IconSelector on every change.
// (Mirrors THEME_COOKIE in themes.ts.)
export const APP_ICON_COOKIE = "serene-app-icon";

const APP_ICON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client-only (document.cookie) — persist the SSR app-icon mirror. */
export function persistAppIconCookie(icon: IconKey) {
  document.cookie = `${APP_ICON_COOKIE}=${icon}; path=/; max-age=${APP_ICON_COOKIE_MAX_AGE}; SameSite=Lax`;
}
