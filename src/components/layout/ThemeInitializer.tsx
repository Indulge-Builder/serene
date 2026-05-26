"use client";

import { useLayoutEffect } from "react";

type Props = { theme: string };

/**
 * Applies data-theme to <html> before the browser paints.
 * useLayoutEffect fires synchronously after DOM mutations, so the
 * theme token resolves on the first frame — no flash for any theme.
 */
export function ThemeInitializer({ theme }: Props) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}
