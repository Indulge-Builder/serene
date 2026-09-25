import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const mocks = path.resolve('scripts/fixtures/form-workflows/mocks.tsx');
fs.mkdirSync('output', {recursive:true});
await build({entryPoints:['scripts/fixtures/form-workflows/index.tsx'],bundle:true,outfile:'output/form-workflows.js',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},tsconfig:'tsconfig.json',plugins:[{
  name:'isolated-form-actions',
  setup(build) {
    build.onResolve({filter:/^(next\/navigation|@\/lib\/actions\/(subscriptions|recharge|deals)|@\/hooks\/useToast|@\/components\/deals\/DealCard|@\/lib\/utils\/export|\.\/InvoiceControls)$/},()=>({path:mocks}));
  },
}]});
fs.writeFileSync('output/form-workflows.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolated form workflows</title></head><body><div id="root"></div><script src="form-workflows.js"></script></body></html>');
console.log('Built real feature forms with mocked actions, uploads, and router.');
