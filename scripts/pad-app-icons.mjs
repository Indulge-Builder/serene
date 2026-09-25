/**
 * Re-runnable builder for every raster copy of the Serene mark: the PWA home-screen
 * icons, the logo image, and the favicon.
 *
 * THE MARK is rendered here from the SAME geometry as src/components/ui/SeedMandala.tsx
 * (never redrawn by eye): 8 rings of r46 whose centres sit on a circle of radius 46
 * round (100,100) in a 200 box, 45° apart from 12 o'clock, PLUS the intersecting
 * centre circle r48 (the official Indulge logo's ninth ring; the old art drew the 8
 * rings without it until 2026-09-25). Stroke: the brand umber→gold gradient
 * (#2B1D10 → #C08A4E), per ring, as the component paints it.
 *
 * Every home-screen icon sits on a SOLID cream plate (#ECE8E1, NEU_CANVAS_LIGHT, the
 * boot screen's canvas): Serene's icon is the mark on cream, never black (the Indulge
 * member app is the black one). A solid plate also keeps the manifest's `maskable`
 * entry valid (Android crops a circle/squircle; corners stay cream). NEVER re-add
 * maskable if an icon ever reverts to a transparent background.
 *
 * Outputs:
 *   - public/icon-1.webp                THE default icon (the mark, rendered here)
 *   - public/icon-2/3/4.webp            the decorative picks, plated from
 *                                       public/_icon-originals (unchanged art)
 *   - public/_icon-originals/icon-1.webp  the transparent mark (kept truthful)
 *   - src/app/apple-icon.png            static apple-touch-icon fallback (180)
 *   - public/icons/icon-192.png / -512  sw.js push icon + offline shell
 *   - public/logo.webp                  the transparent mark the sidebar, mobile
 *                                       trigger and auth pages show (240)
 *   - src/app/favicon.ico               16/32/48/64, the mark on a rounded cream
 *                                       plate (it was Next's default black triangle)
 * Bump CACHE_VERSION in public/sw.js after re-running (the SW precaches
 * /icons/icon-192.png).
 *
 *   node scripts/pad-app-icons.mjs
 *
 * Resolves sharp from Next's dependency (already installed) — no new package.
 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
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
// NEU_CANVAS_LIGHT #ECE8E1 (lib/constants/appearance.ts) — the boot screen canvas.
const PLATE_HEX = "#ECE8E1";
const PLATE = { r: 0xec, g: 0xe8, b: 0xe1, alpha: 1 };
const KEYS = ["icon-1", "icon-2", "icon-3", "icon-4"];
const DEFAULT_KEY = "icon-1"; // mirrors DEFAULT_ICON in lib/constants/app-icons.ts

// ── THE mark (SeedMandala.tsx geometry) ─────────────────────────────────────
const R = 46;
const CENTER = 100;
const CENTER_R = 48;
const RINGS = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
  return [CENTER + R * Math.cos(a), CENTER + R * Math.sin(a)];
});

/** The mark's circles as SVG, stroked with the per-ring brand gradient. */
function markCircles(stroke) {
  const rings = RINGS.map(([x, y]) => `<circle cx="${x.toFixed(4)}" cy="${y.toFixed(4)}" r="${R}"/>`).join("");
  return (
    `<defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#2B1D10"/><stop offset="1" stop-color="#C08A4E"/></linearGradient></defs>` +
    `<g fill="none" stroke="url(#g)" stroke-width="${stroke}">${rings}<circle cx="${CENTER}" cy="${CENTER}" r="${CENTER_R}"/></g>`
  );
}

/** The transparent mark, rendered at `px` (the SVG box; trim removes its margin). */
function renderMark(px, stroke = 2.2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${px}" height="${px}">${markCircles(stroke)}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function glyphFor(key) {
  // The default icon is the mark itself; the decorative picks keep their art.
  const src = key === DEFAULT_KEY ? await renderMark(1400) : join(SRC_DIR, `${key}.webp`);
  // Trim any transparent margin so GLYPH_RATIO applies to the actual artwork,
  // then resize the glyph to the inner box (contain, transparent fill so the
  // glyph's own alpha is preserved before it lands on the plate).
  return sharp(src)
    .trim()
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
}

const inner = Math.round(SIZE * GLYPH_RATIO);
const pad = Math.round((SIZE - inner) / 2);

async function buildPlated(key) {
  const glyph = await glyphFor(key);
  // Composite the glyph onto the SOLID cream plate — no transparency in the
  // output, so the OS shows the brand canvas plate, never its own fill.
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: PLATE } })
    .composite([{ input: glyph, top: pad, left: pad }])
    .flatten({ background: PLATE })
    .png()
    .toBuffer();
}

for (const key of KEYS) {
  const plated = await buildPlated(key);
  await sharp(plated).webp({ quality: 92 }).toFile(join(OUT_DIR, `${key}.webp`));
  console.log(`built ${key}.webp → ${SIZE}×${SIZE} on ${PLATE_HEX}, glyph ${inner}px (inset ${pad}px)`);
}

// The transparent original, kept truthful for anyone reading _icon-originals.
await sharp(await renderMark(240)).webp({ quality: 95 }).toFile(join(SRC_DIR, `${DEFAULT_KEY}.webp`));

// Derived assets from the default icon — apple-touch fallback + SW push/offline PNGs.
const base = await buildPlated(DEFAULT_KEY);
for (const { out, size } of [
  { out: join(ROOT, "src", "app", "apple-icon.png"), size: 180 },
  { out: join(OUT_DIR, "icons", "icon-192.png"), size: 192 },
  { out: join(OUT_DIR, "icons", "icon-512.png"), size: 512 },
]) {
  await sharp(base).resize(size, size).png().toFile(out);
  console.log(`built ${out.replace(ROOT + "/", "")} → ${size}×${size}`);
}

// logo.webp — the transparent mark at 240 with the old asset's margin (~200px mark).
{
  const mark = await sharp(await renderMark(1000)).trim().resize(200, 200, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: 240, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, top: 20, left: 20 }])
    .webp({ quality: 95 })
    .toFile(join(OUT_DIR, "logo.webp"));
  console.log("built public/logo.webp → 240×240, transparent");
}

// favicon.ico — the mark on a rounded cream plate, a heavier stroke so it reads at
// 16px, every size a PNG entry (the ICO container, written by hand: no dependency).
{
  const faviconSvg = (px) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${px}" height="${px}">` +
    `<rect width="200" height="200" rx="44" fill="${PLATE_HEX}"/>` +
    `<g transform="translate(100 100) scale(0.84) translate(-100 -100)">${markCircles(9)}</g></svg>`;
  const entries = [];
  for (const px of [16, 32, 48, 64]) {
    entries.push({ px, buf: await sharp(Buffer.from(faviconSvg(px))).png().toBuffer() });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ px, buf }, i) => {
    const e = i * 16;
    dir.writeUInt8(px, e);         // width
    dir.writeUInt8(px, e + 1);     // height
    dir.writeUInt8(0, e + 2);      // palette
    dir.writeUInt8(0, e + 3);      // reserved
    dir.writeUInt16LE(1, e + 4);   // colour planes
    dir.writeUInt16LE(32, e + 6);  // bits per pixel
    dir.writeUInt32LE(buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  await writeFile(join(ROOT, "src", "app", "favicon.ico"), Buffer.concat([header, dir, ...entries.map((x) => x.buf)]));
  console.log("built src/app/favicon.ico → 16/32/48/64 on the cream plate");
}

console.log("done. Remember: bump CACHE_VERSION in public/sw.js.");
