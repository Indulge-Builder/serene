"use client";

import { useEffect } from "react";
import { persistAppIconCookie, type IconKey } from "@/lib/constants/app-icons";

type Props = { icon: IconKey };

/**
 * Corrective sync for the SSR app-icon cookie (lib/constants/app-icons.ts) —
 * the IconInitializer twin of ThemeInitializer. The root layout already builds
 * the <link rel="manifest"> + apple-touch-icon from the serene-app-icon cookie,
 * so a signed-in device installs with the right icon on the first byte. This
 * only re-writes the cookie when it was missing or stale vs profiles.app_icon
 * (new device, cleared cookies, choice made on another device) — so the NEXT
 * request server-renders the correct manifest link.
 *
 * No DOM mutation here (unlike ThemeInitializer's data-theme flip): the manifest
 * link is metadata, not a live-repaintable attribute, and the installed icon is
 * OS-owned. Cookie correctness for the next install is the whole job.
 */
export function IconInitializer({ icon }: Props) {
  useEffect(() => {
    persistAppIconCookie(icon);
  }, [icon]);

  return null;
}
