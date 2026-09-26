import { defineEnum } from "./define-enum";

// THE canonical appearance (light/dark mode) vocabulary — the <html data-neu>
// switch, the profiles.appearance column, and the SSR appearance cookie all
// resolve against this list. Built exactly like themes.ts / app-icons.ts.
//
// 'system' follows the OS via prefers-color-scheme (label "Auto" in the UI).
// The DARK variant is the [data-neu="dark"] token block in
// src/styles/serene-neumorphic-tokens.css — a mode changes ONLY that
// attribute; the theme accent family (data-theme) is orthogonal.
const DEF = defineEnum([
  { id: "light",  label: "Light" },
  { id: "dark",   label: "Dark"  },
  { id: "system", label: "Auto"  },
]);

export const APPEARANCE_KEYS    = DEF.values;
export const APPEARANCE_OPTIONS = DEF.options;
export const APPEARANCE_ENUM    = DEF.zodEnum;

export type AppearanceKey = (typeof APPEARANCE_KEYS)[number];

export const DEFAULT_APPEARANCE: AppearanceKey = "light";

export function isAppearanceKey(value: unknown): value is AppearanceKey {
  return APPEARANCE_KEYS.includes(value as AppearanceKey);
}

// Meta theme-color / manifest mirrors of the two --neu-canvas values.
// Hardcoded hex is sanctioned only for these surfaces (meta tags and manifest
// JSON cannot read CSS vars) — keep in lockstep with
// serene-neumorphic-tokens.css --neu-canvas (:root / [data-neu="dark"]).
export const NEU_CANVAS_LIGHT = "#ECE8E1";
export const NEU_CANVAS_DARK  = "#28241C";

// SSR mirror of profiles.appearance (the serene-theme pattern). The root
// layout reads this cookie so the server stamps data-neu="dark" on <html>
// from the first byte; 'system' additionally renders a tiny pre-hydration
// inline script (matchMedia cannot run on the server). profiles.appearance
// stays the source of truth: ThemeInitializer re-syncs the cookie on every
// dashboard load, AppearanceSelector on every switch.
export const APPEARANCE_COOKIE = "serene-appearance";

const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Client-only (document.cookie) — persist the SSR appearance mirror. */
export function persistAppearanceCookie(appearance: AppearanceKey) {
  document.cookie = `${APPEARANCE_COOKIE}=${appearance}; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Client-only — does the OS currently prefer dark? */
export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve a preference to the effective mode (client-only for 'system'). */
export function resolvesDark(appearance: AppearanceKey): boolean {
  return appearance === "dark" || (appearance === "system" && systemPrefersDark());
}

/**
 * Client-only — apply an appearance preference to the DOM: flips the
 * <html data-neu> attribute and updates the <meta name="theme-color">
 * tag(s) so the browser/PWA chrome follows (#ECE8E1 ↔ #28241C).
 * 'system' needs the two media-scoped metas so the chrome tracks the OS
 * without JS; 'light'/'dark' need one resolved meta.
 *
 * The SSR metas are RENDERED BY REACT (generateViewport in the root
 * layout), so this must NEVER remove them — React crashes on the next
 * head reconciliation ("Cannot read properties of null (reading
 * 'removeChild')") when a node it owns has vanished. Instead: mutate the
 * existing metas in place, append tagged extras only when more are
 * needed, and converge any surplus on the last entry (a same-colour
 * duplicate is harmless).
 *
 * ThemeInitializer (load + OS changes) and AppearanceSelector (switch) are
 * the only callers — never flip data-neu anywhere else.
 */
export function applyAppearanceToDom(appearance: AppearanceKey) {
  const root = document.documentElement;
  const dark = resolvesDark(appearance);

  if (dark) {
    if (root.getAttribute("data-neu") !== "dark") root.setAttribute("data-neu", "dark");
  } else {
    root.removeAttribute("data-neu");
  }

  const entries: { color: string; media?: string }[] =
    appearance === "system"
      ? [
          { color: NEU_CANVAS_LIGHT, media: "(prefers-color-scheme: light)" },
          { color: NEU_CANVAS_DARK,  media: "(prefers-color-scheme: dark)"  },
        ]
      : [{ color: dark ? NEU_CANVAS_DARK : NEU_CANVAS_LIGHT }];

  const metas = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );

  const assign = (meta: HTMLMetaElement, entry: { color: string; media?: string }) => {
    if (meta.content !== entry.color) meta.content = entry.color;
    if (entry.media) {
      if (meta.getAttribute("media") !== entry.media) meta.setAttribute("media", entry.media);
    } else if (meta.hasAttribute("media")) {
      meta.removeAttribute("media");
    }
  };

  entries.forEach((entry, i) => {
    if (metas[i]) {
      assign(metas[i], entry);
      return;
    }
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute("data-serene-appearance", "");
    assign(meta, entry);
    document.head.appendChild(meta);
  });

  // Surplus metas (e.g. system's pair after switching to light/dark) are
  // converged, not removed — see the React-ownership note above.
  const last = entries[entries.length - 1];
  for (let i = entries.length; i < metas.length; i++) {
    assign(metas[i], last);
  }
}
