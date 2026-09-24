#!/usr/bin/env node
/** Read-only source inventory. Native controls include valid bespoke widgets;
 * counts are review prompts, not an accessibility or visual-quality score.
 * npm run audit:ui — summary; npm run audit:ui -- --json — full file inventory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
}
walk(path.join(root, 'src'));
const inventory = files.sort().map((file) => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const row = { file: path.relative(root, file), native: 0, inlineChrome: 0, shared: 0, selections: 0, uploads: 0, animatedNative: 0, animatedChrome: 0 };
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === 'Button' || tag === 'MotionButton') row.shared++;
      if (tag === 'SelectionButton' || tag === 'MotionSelectionButton') row.selections++;
      if (tag === 'UploadButton') row.uploads++;
      if (tag === 'motion.button' || tag === 'm.button') {
        row.animatedNative++;
        const style = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'style');
        if (style && /background|borderRadius|boxShadow/.test(style.getText(source))) row.animatedChrome++;
      }
      if (tag === 'button') {
        row.native++;
        const style = node.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'style');
        if (style && /background|borderRadius|boxShadow/.test(style.getText(source))) row.inlineChrome++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return row;
});
const totals = inventory.reduce((a, r) => ({ files: a.files + 1, native: a.native + r.native, inlineChrome: a.inlineChrome + r.inlineChrome, shared: a.shared + r.shared, selections: a.selections + r.selections, uploads: a.uploads + r.uploads, animatedNative: a.animatedNative + r.animatedNative, animatedChrome: a.animatedChrome + r.animatedChrome }), { files: 0, native: 0, inlineChrome: 0, shared: 0, selections: 0, uploads: 0, animatedNative: 0, animatedChrome: 0 });
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totals, inventory: inventory.filter((r) => r.native || r.shared || r.selections || r.uploads || r.animatedNative) }, null, 2));
} else {
  console.log(`Scanned ${totals.files} TSX files: ${totals.shared} shared Button/MotionButton usages, ${totals.selections} shared selection controls, ${totals.uploads} shared upload controls, ${totals.native} native buttons, ${totals.inlineChrome} native buttons with inline chrome.`);
  console.log(`${totals.animatedNative} direct motion buttons, ${totals.animatedChrome} with inline chrome (tracked separately).`);
  console.log('Review candidates (includes intentional calendars, pickers, and mobile controls):');
  for (const row of [...inventory].sort((a, b) => b.inlineChrome - a.inlineChrome).filter((r) => r.inlineChrome).slice(0, 15)) console.log(`${String(row.inlineChrome).padStart(3)}  ${row.file}`);
}

if (process.argv.includes('--check')) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ui-control-baseline.json'), 'utf8'));
  const additions = inventory.filter(row => row.inlineChrome > (baseline[row.file]?.native ?? 0) || row.animatedChrome > (baseline[row.file]?.animated ?? 0));
  if (additions.length) {
    console.error('Unreviewed control appearance added: ' + additions.map(row => row.file).join(', '));
    process.exitCode = 1;
  } else console.log('Control appearance baseline passed.');
}
