import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const mocks = path.resolve('scripts/fixtures/member-ticket-fields/mocks.ts');
fs.mkdirSync('output', { recursive: true });
await build({ entryPoints: ['scripts/fixtures/member-ticket-fields/index.tsx'], bundle: true, outfile: 'output/member-ticket-fields.js', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: 'tsconfig.json', plugins: [{
  name: 'isolated-member-ticket-actions',
  setup(build) { build.onResolve({ filter: /^(next\/navigation|@\/lib\/actions\/(members|tickets|ticket-settings)|@\/components\/sia\/SiaMessagesPeek)$/ }, () => ({ path: mocks })); },
}] });
fs.writeFileSync('output/member-ticket-fields.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Member and ticket fields</title></head><body><div id="root"></div><script src="member-ticket-fields.js"></script></body></html>');
console.log('Built member, ticket, and SLA forms with isolated actions.');
