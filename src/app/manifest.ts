import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import {
  APP_ICON_COOKIE,
  DEFAULT_ICON,
  iconSrc,
  isIconKey,
  type IconKey,
} from "@/lib/constants/app-icons";
import {
  APPEARANCE_COOKIE,
  DEFAULT_APPEARANCE,
  NEU_CANVAS_DARK,
  NEU_CANVAS_LIGHT,
  isAppearanceKey,
  type AppearanceKey,
} from "@/lib/constants/appearance";

// Manifest colours mirror the two --neu-canvas values (a manifest is static
// JSON and cannot read CSS variables) — NEU_CANVAS_LIGHT/DARK live in
// lib/constants/appearance.ts beside the meta theme-color mirror. 'system'
// resolves LIGHT here: a manifest cannot media-query; the browser chrome
// follows the media-scoped meta theme-color at runtime regardless. (The old
// EARTH_CANVAS #0d0c0a export mirrored the retired pre-neumorphic dark canvas
// — retired with the dark-mode handoff 2026-07-03.)

// THE single manifest envelope builder. The static export below uses the
// DEFAULT_ICON; /api/manifest?icon=<key> calls this with the user's validated
// key so a per-user install bakes that icon into the shortcut. One large
// square source covers the 192/512 slots (the browser downscales `sizes:"any"`);
// the same file backs apple-touch-icon in the layout.
//
// The icon art is the umber→gold seed-of-life glyph composited onto a SOLID
// plate — built by scripts/pad-app-icons.mjs from the transparent sources:
// white for the default mark (2026-09-26, the founder's pick, so iPhone and
// Android show the same square instead of the black an iPhone paints behind a
// transparent icon), cream #ECE8E1 for the decorative picks. (The black
// #0d0c0a plate was retired 2026-07-10.) Because the fill is solid (no
// transparency) the `maskable` entry is valid: Android crops it into a
// circle/squircle and the glyph sits inside the safe zone (GLYPH_RATIO 0.82
// in the build script), so the petals are never clipped and corners are
// filled, not transparent. NEVER re-add maskable if the art reverts to a
// transparent background — see the script comment.
export function buildManifest(
  icon: IconKey,
  appearance: AppearanceKey = DEFAULT_APPEARANCE,
): MetadataRoute.Manifest {
  const src = iconSrc(icon); // validated key → /icon-N.webp (never raw input)
  const canvas = appearance === "dark" ? NEU_CANVAS_DARK : NEU_CANVAS_LIGHT;
  return {
    name: "Serene",
    short_name: "Serene",
    description: "Internal operating system for Indulge team members.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: canvas,
    theme_color: canvas,
    icons: [
      { src, sizes: "192x192", type: "image/webp" },
      { src, sizes: "512x512", type: "image/webp" },
      { src, sizes: "any", type: "image/webp" },
      { src, sizes: "512x512", type: "image/webp", purpose: "maskable" },
    ],
  };
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // The Next.js `/manifest.webmanifest` file convention. This link WINS over the
  // `generateMetadata().manifest` value in the root layout — Next emits
  // <link rel="manifest" href="/manifest.webmanifest"> from this file regardless
  // of the metadata override. So this route — not /api/manifest — is what most
  // browsers install from. It MUST therefore carry the user's saved icon +
  // appearance, not hardcoded defaults; reading the serene-app-icon /
  // serene-appearance cookies (the SSR mirrors of profiles.app_icon /
  // profiles.appearance, the same cookies the layout reads) makes the installed
  // shortcut match the user's picks. Reading cookies() makes this route dynamic,
  // which is correct — the manifest is per-user. Falls back to DEFAULT_ICON /
  // DEFAULT_APPEARANCE for a signed-out / cookieless request.
  const cookieStore = await cookies();
  const cookieIcon = cookieStore.get(APP_ICON_COOKIE)?.value;
  const icon = isIconKey(cookieIcon) ? cookieIcon : DEFAULT_ICON;
  const cookieAppearance = cookieStore.get(APPEARANCE_COOKIE)?.value;
  const appearance = isAppearanceKey(cookieAppearance)
    ? cookieAppearance
    : DEFAULT_APPEARANCE;
  return buildManifest(icon, appearance);
}
