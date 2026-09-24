// Measure computed token pairs in the isolated local browser specimen.
// Requires a local Chromium debugging endpoint at 127.0.0.1:9223.
import fs from 'node:fs';
import WebSocket from 'ws';
const targets = await (await fetch(`http://127.0.0.1:${Number(process.env.SERENE_BROWSER_PORT ?? 9223)}/json`, { signal: AbortSignal.timeout(10000) })).json();
const target = targets.find((t) => t.type === 'page');
if (!target) throw new Error('No isolated review browser page available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
let id = 0;
const pending = new Map();
socket.on('message', (raw) => {
  const message = JSON.parse(raw);
  if (!message.id) return;
  const call = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) call.reject(message.error); else call.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id; pending.set(next, {resolve, reject});
  socket.send(JSON.stringify({id:next, method, params}));
});
try {
  await send('Page.navigate', {url:new URL('../output/serene-control-system.html', import.meta.url).href});
  await new Promise((resolve) => setTimeout(resolve, 400));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await send('Runtime.evaluate', {expression: 'document.readyState === "complete" && !!document.querySelector(".serene-field-control")', returnByValue: true});
    if (state.result.value) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Control specimen did not finish loading');
  const expression = `(() => {
    const root=document.documentElement, probe=document.createElement('span');
    document.body.append(probe);
    const instant=document.createElement('style');instant.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.append(instant);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const color=(css,ground='white')=>{
      ctx.clearRect(0,0,1,1);probe.style.color=ground;ctx.fillStyle=getComputedStyle(probe).color;ctx.fillRect(0,0,1,1);
      probe.style.color=css;ctx.fillStyle=getComputedStyle(probe).color;ctx.fillRect(0,0,1,1);
      return [...ctx.getImageData(0,0,1,1).data].slice(0,3);
    };
    const luminance=(rgb)=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const rows=[];
    for(const theme of ['earth','air','water','fire','candy','rose','moss','lilac'])for(const mode of ['light','dark']){
      root.dataset.theme=theme;root.dataset.neu=mode;
      const pairs=[];
      for(const surface of ['surface','surface-high','workspace','canvas','well'])for(const ink of ['primary','secondary','tertiary'])pairs.push(['text-'+ink+' / '+surface,'var(--neu-text-'+ink+')','var(--neu-'+surface+')',4.5]);
      for(const tone of ['sage','powder','butter','rose','lilac','teal','neutral'])pairs.push(['chip-'+tone,'var(--neu-chip-'+tone+'-fg)','var(--neu-chip-'+tone+'-bg)',4.5]);
      for(const surface of ['sidebar','sidebar-pigment','sidebar-wash'])pairs.push(['sidebar / '+surface,'var(--neu-sidebar-ink)','var(--neu-'+surface+')',4.5]);
      for(const tone of ['sage','powder','butter','lilac','peach','teal','danger'])pairs.push(['deep-'+tone,'var(--neu-'+tone+'-deep)','var(--neu-surface)',4.5]);
      pairs.push(['accent label','var(--neu-accent-deep)','color-mix(in srgb,var(--theme-accent) 12%,var(--neu-surface))',4.5]);
      pairs.push(['header label','var(--neu-header-ink)','var(--neu-header-wash)',4.5]);
      for(const surface of ['surface','workspace','sidebar'])pairs.push(['focus / '+surface,'var(--theme-accent-muted)','var(--neu-'+surface+')',3]);
      for(const [name,bg] of [['primary top','color-mix(in srgb,var(--neu-accent) '+(mode==='dark'?92:88)+'%,white)'],['primary bottom','color-mix(in srgb,var(--neu-accent) '+(mode==='dark'?86:90)+'%,black)']])pairs.push([name,'var(--theme-accent-fg)',bg,4.5]);
      for(const el of document.querySelectorAll('.serene-selection:not(:disabled)')){const css=getComputedStyle(el);pairs.push(['selection '+el.dataset.appearance+' '+el.dataset.selected,css.color,css.backgroundColor,4.5]);}
      for(const el of document.querySelectorAll('.serene-btn-warning,.serene-btn-ghost-danger,.serene-upload,.neu-m-button:not([data-variant=primary]),.neu-m-icon-knob')){const css=getComputedStyle(el);pairs.push(['material '+(el.dataset.variant??el.className),css.color,css.backgroundColor,4.5]);}
      for(const surface of ['section-bg','table-header-bg','table-row-hover','table-row-selected'])for(const ink of ['primary','secondary','tertiary'])pairs.push(['family '+ink+' / '+surface,'var(--neu-text-'+ink+')','var(--neu-'+surface+')',4.5]);
      for(const el of document.querySelectorAll('.serene-badge,.serene-alert')){const css=getComputedStyle(el);pairs.push(['family '+el.className,css.color,css.backgroundColor,4.5]);}
      for(const el of document.querySelectorAll('.serene-field-control:not(:disabled)')){const css=getComputedStyle(el);const backgrounds=css.backgroundImage.match(/rgba?\([^)]*\)/g)??[css.backgroundColor];for(const bg of backgrounds){pairs.push(['field ink / gradient endpoint',css.color,bg,4.5]);pairs.push(['field focus / gradient endpoint','var(--neu-accent-deep)',bg,3]);pairs.push(['field error / gradient endpoint','var(--color-danger-text)',bg,4.5]);}}
      for(const [name,fg,bg,minimum]of pairs){const back=color(bg,'var(--neu-surface)'),front=color(fg,'rgb('+back.join(',')+')');const a=luminance(front),b=luminance(back);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);rows.push({theme,mode,name,ratio:+ratio.toFixed(3),minimum,pass:ratio>=minimum,foreground:front,background:back});}
    }
    probe.remove();instant.remove();root.dataset.theme='earth';root.dataset.neu='light';return rows;
  })()`;
  const result = await send('Runtime.evaluate', {expression,returnByValue:true});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const rows = result.result.value;
  fs.mkdirSync('output',{recursive:true});
  fs.writeFileSync('output/theme-contrast-audit.json',JSON.stringify(rows,null,2));
  const failures=rows.filter(r=>!r.pass);
  console.log(`${rows.length} computed theme/mode/token pairs; ${failures.length} below target.`);
  const grouped=new Map();for(const row of failures){const key=row.mode+' '+row.name;const prev=grouped.get(key);if(!prev||row.ratio<prev.ratio)grouped.set(key,row);}
  for(const row of grouped.values())console.log(`${row.mode} ${row.name}: ${row.ratio}:1 (${row.theme}), target ${row.minimum}:1`);
  process.exitCode=failures.length?1:0;
} finally {socket.close();}
