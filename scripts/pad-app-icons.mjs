/**
 * One-time (re-runnable) icon padder for the PWA home-screen icons.
 *
 * The source art (public/_icon-originals/icon-N.webp) is the seed-of-life glyph
 * on a TRANSPARENT background, drawn edge-to-edge. On a home screen that means
 * the glyph touches the icon bounds — cramped, and clipped by any OS rounding.
 *
 * This shrinks each glyph to GLYPH_RATIO of the canvas and centres it on a fresh
 * fully-transparent square (no background fill — the transparent look is kept by
 * design), so the art sits inside the maskable safe zone with breathing room.
 * Alpha is preserved end-to-end. Re-run after replacing an original.
 *
 *   node scripts/pad-app-icons.mjs
 *
 * Resolves sharp from Next's dependency (already installed) — no new package.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const nextDir = dirname(require.resolve("next/package.json"));
const sharp = require(require.resolve("sharp", { paths: [nextDir] }));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "public", "_icon-originals");
const OUT_DIR = join(ROOT, "public");

const SIZE = 1254;          // final square edge (matches icon-2/3/4 source)
const GLYPH_RATIO = 0.78;   // art occupies 78% → ~11% transparent gutter each side
const KEYS = ["icon-1", "icon-2", "icon-3", "icon-4"];

const inner = Math.round(SIZE * GLYPH_RATIO);
const pad = Math.round((SIZE - inner) / 2);

for (const key of KEYS) {
  const srcPath = join(SRC_DIR, `${key}.webp`);
  const outPath = join(OUT_DIR, `${key}.webp`);

  // Trim any existing transparent margin first so GLYPH_RATIO is applied to the
  // actual artwork, not to whatever padding the source already had. Then resize
  // the glyph to the inner box (contain, transparent fill) and extend back out
  // to the full square with a transparent gutter.
  const glyph = await sharp(srcPath)
    .trim()
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: glyph, top: pad, left: pad }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(outPath);

  console.log(`padded ${key}.webp → ${SIZE}×${SIZE}, glyph ${inner}px (gutter ${pad}px)`);
}

console.log("done.");
