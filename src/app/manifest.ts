import type { MetadataRoute } from "next";
import { iconSrc, type IconKey } from "@/lib/constants/app-icons";

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
// square source covers the 192/512 slots (the browser downscales `sizes:"any"`)
// and the maskable purpose; the same file backs apple-touch-icon in the layout.
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
      { src, sizes: "512x512", type: "image/webp", purpose: "maskable" },
    ],
  };
}

export default function manifest(): MetadataRoute.Manifest {
  // Static default (the Next.js `/manifest.webmanifest` convention). A signed-in
  // device overrides the <link rel="manifest"> to /api/manifest?icon=<saved> in
  // the root layout so the user's chosen icon is what actually installs.
  return buildManifest("icon-1");
}
