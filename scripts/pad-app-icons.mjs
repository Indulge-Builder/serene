/**
 * One-time (re-runnable) icon builder for the PWA home-screen icons.
 *
 * The source art (public/_icon-originals/icon-N.webp) is the seed-of-life glyph
 * on a TRANSPARENT background. A transparent home-screen icon gets filled with
 * whatever plate the OS picks (white on iOS) — which looked wrong. The original
 * Serene icon (public/icons/icon-512.png) was the glyph on a SOLID #0d0c0a
 * (Earth canvas) plate, large and clean — that is the look we restore here.
 *
 * For each chosen icon we trim the source's transparent margin, resize the glyph
 * to GLYPH_RATIO of the canvas, and composite it centred on a solid #0d0c0a
 * square. Same recipe as the original icon-512.png, applied to all 4 picks.
 * Re-run after replacing an original.
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
const GLYPH_RATIO = 0.82;   // art occupies 82% → large, like the original icon-512
const PLATE = { r: 0x0d, g: 0x0c, b: 0x0a, alpha: 1 }; // Earth --theme-canvas #0d0c0a, opaque
const KEYS = ["icon-1", "icon-2", "icon-3", "icon-4"];

const inner = Math.round(SIZE * GLYPH_RATIO);
const pad = Math.round((SIZE - inner) / 2);

for (const key of KEYS) {
  const srcPath = join(SRC_DIR, `${key}.webp`);
  const outPath = join(OUT_DIR, `${key}.webp`);

  // Trim any transparent margin so GLYPH_RATIO applies to the actual artwork,
  // then resize the glyph to the inner box (contain, transparent fill so the
  // glyph's own alpha is preserved before it lands on the plate).
  const glyph = await sharp(srcPath)
    .trim()
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  // Composite the glyph onto a SOLID #0d0c0a plate — no transparency in the
  // output, so the OS shows the brand dark plate, never a white fill. Flatten
  // guarantees a fully opaque result.
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: PLATE },
  })
    .composite([{ input: glyph, top: pad, left: pad }])
    .flatten({ background: PLATE })
    .webp({ quality: 92 })
    .toFile(outPath);

  console.log(`built ${key}.webp → ${SIZE}×${SIZE} on #0d0c0a, glyph ${inner}px (inset ${pad}px)`);
}

console.log("done.");
