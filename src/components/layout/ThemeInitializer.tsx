"use client";

import { useLayoutEffect } from "react";
import { persistThemeCookie, type ThemeKey } from "@/lib/constants/themes";

type Props = { theme: ThemeKey };

/**
 * Corrective sync for the SSR theme cookie (lib/constants/themes.ts).
 * The root layout already stamps data-theme from the cookie on the server,
 * so the first paint is normally correct. This only flips the attribute when
 * the cookie was missing or stale vs the DB truth (new device, cleared
 * cookies, user switch) — and re-writes the cookie so the NEXT request
 * server-renders the right theme from the first byte.
 */
export function ThemeInitializer({ theme }: Props) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("data-theme") !== theme) {
      root.setAttribute("data-theme", theme);
    }
    persistThemeCookie(theme);
  }, [theme]);

  return null;
}
