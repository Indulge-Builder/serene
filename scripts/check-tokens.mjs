#!/usr/bin/env node
/**
 * check-tokens.mjs — undefined-token guard (design audit 2026-06, Phase 4.3).
 *
 * Fails when any `var(--name)` reference — or Tailwind v4 var-shorthand
 * utility like `bg-(--name)` — in src/ names a custom property that is not
 * defined in the token sheets (`src/styles/design-tokens.css`,
 * `src/app/globals.css`) or anywhere else in the scanned tree (local inline
 * custom properties count as definitions).
 *
 * Why: an undefined custom property makes the whole declaration invalid at
 * computed-value time — the browser drops it silently. This guard would have
 * caught every Critical in the 2026-06 design audit (C-01…C-03, H-03, H-04),
 * including the class where Tailwind's default theme silently "fills the gap"
 * for names Serene never defined (`--text-4xl`).
 *
 * Run: npm run check:tokens   (also runs in front of `npm run build`)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

/** Custom properties created outside the scanned tree at runtime. */
const RUNTIME_DEFINED = new Set([
  '--font-geist-sans', // next/font (src/app/layout.tsx `variable:` config)
  '--font-geist-mono',
  '--font-playfair',
]);

/** Prefixes that are never Serene's to define. */
const IGNORED_PREFIXES = ['--tw-']; // Tailwind internals

/**
 * Strip comments so prose mentions of `var(--…)` don't count as references
 * (or definitions). Block comments always; line comments only when preceded
 * by line-start/whitespace so `https://…` in string literals survives.
 */
function stripComments(text, isCss) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!isCss) out = out.replace(/(^|\s)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  return out;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(SRC);

// ── Pass 1: collect every defined custom property ───────────────────────────
// CSS declarations (`--name:`) and TS/TSX inline-style keys (`'--name':`).
const defined = new Set(RUNTIME_DEFINED);
const CSS_DEF = /(^|[\s{;])(--[A-Za-z0-9-]+)\s*:/g;
const TSX_DEF = /['"](--[A-Za-z0-9-]+)['"]\s*:/g;

const sources = new Map(
  files.map((file) => [file, stripComments(readFileSync(file, 'utf8'), file.endsWith('.css'))]),
);

for (const [file, text] of sources) {
  const defRegex = file.endsWith('.css') ? CSS_DEF : TSX_DEF;
  for (const match of text.matchAll(defRegex)) {
    defined.add(match[file.endsWith('.css') ? 2 : 1]);
  }
}

// ── Pass 2: collect every reference and diff ────────────────────────────────
// `var(--name…)` plus the Tailwind v4 shorthand `utility-(--name)`.
const REF_PATTERNS = [/var\(\s*(--[A-Za-z0-9-]+)/g, /[A-Za-z0-9]-\((--[A-Za-z0-9-]+)\)/g];

const failures = [];

for (const [file, text] of sources) {
  for (const pattern of REF_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      // Skip dynamic template-literal names (`var(--x-${y})`) — the regex
      // stops at `$`, leaving a truncated name ending in `-`.
      if (name.endsWith('-')) continue;
      if (IGNORED_PREFIXES.some((p) => name.startsWith(p))) continue;
      if (defined.has(name)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      failures.push(`${relative(ROOT, file)}:${line} — ${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error('✗ Undefined design-token reference(s) — the browser silently drops these declarations:\n');
  for (const failure of [...new Set(failures)]) console.error(`  ${failure}`);
  console.error(
    `\n${failures.length} reference(s) name a custom property that no token sheet defines.` +
      '\nFix the name, or add the token to src/styles/design-tokens.css via the Decision Log (docs/design/decision-log.md).',
  );
  process.exit(1);
}

console.log(`✓ check-tokens: all var(--…) references resolve (${files.length} files scanned).`);
