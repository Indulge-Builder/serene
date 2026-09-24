import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
fs.mkdirSync('output', { recursive: true });
await build({ entryPoints: ['scripts/fixtures/control-keyboard.tsx'], bundle: true, outfile: 'output/control-keyboard.js', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: 'tsconfig.json' });
fs.writeFileSync('output/control-keyboard.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Control keyboard checks</title></head><body><div id="root"></div><script src="control-keyboard.js"></script></body></html>');
console.log('Built keyboard fixture from the real shared components.');
