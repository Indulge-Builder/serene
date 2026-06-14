import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import {
  APP_ICON_COOKIE,
  DEFAULT_ICON,
  iconSrc,
  isIconKey,
  type IconKey,
} from "@/lib/constants/app-icons";

// Hardcoded hex is sanctioned here only: a manifest is static JSON and cannot
// read CSS variables. Values mirror the Earth (default) theme tokens in
// src/styles/design-tokens.css — --theme-canvas: #0d0c0a. If the Earth canvas
// token ever changes, update these in the same PR.
// Exported so app/api/manifest/route.ts (the per-icon dynamic manifest) builds
// the SAME envelope — never re-inline the colour or the icon array shape.
export const EARTH_CANVAS = "#0d0c0a";

// THE single manifest envelope builder. The static export below uses the
// DEFAULT_ICON; /api/manifest?icon=<key> calls this with the user's validated
// key so a per-user install bakes that icon into the shortcut. One large
// square source covers the 192/512 slots (the browser downscales `sizes:"any"`);
// the same file backs apple-touch-icon in the layout.
//
// NO `purpose: "maskable"` entry — the icon art is a transparent glyph (the
// seed-of-life mark on an alpha background), and a maskable icon MUST be a
// solid edge-to-edge fill with the logo inside the centre safe zone. Declaring
// a transparent edge-to-edge glyph maskable makes Android crop it into a
// circle/squircle, clipping the outer petals and leaving transparent corners.
// `purpose: "any"` (the default when omitted) tells the OS to render the icon
// as-is — the glyph stays whole. The art itself is padded into the safe zone so
// it never touches the edges regardless of OS plate. Never re-add maskable here
// unless the source art becomes a solid-background safe-zone icon.
export function buildManifest(icon: IconKey): MetadataRoute.Manifest {
  const src = iconSrc(icon); // validated key → /icon-N.webp (never raw input)
  return {
    name: "Serene",
    short_name: "Serene",
    description: "Internal operating system for Indulge team members.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: EARTH_CANVAS,
    theme_color: EARTH_CANVAS,
    icons: [
      { src, sizes: "192x192", type: "image/webp" },
      { src, sizes: "512x512", type: "image/webp" },
      { src, sizes: "any", type: "image/webp" },
    ],
  };
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // The Next.js `/manifest.webmanifest` file convention. This link WINS over the
  // `generateMetadata().manifest` value in the root layout — Next emits
  // <link rel="manifest" href="/manifest.webmanifest"> from this file regardless
  // of the metadata override. So this route — not /api/manifest — is what most
  // browsers install from. It MUST therefore carry the user's saved icon, not a
  // hardcoded default; reading the serene-app-icon cookie (the SSR mirror of
  // profiles.app_icon, the same cookie the layout reads) makes the installed
  // shortcut match the user's pick. Reading cookies() makes this route dynamic,
  // which is correct — the manifest is per-user. Falls back to DEFAULT_ICON for
  // a signed-out / cookieless request.
  const cookieIcon = (await cookies()).get(APP_ICON_COOKIE)?.value;
  const icon = isIconKey(cookieIcon) ? cookieIcon : DEFAULT_ICON;
  return buildManifest(icon);
}
