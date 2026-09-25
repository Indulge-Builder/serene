// Feature-level checks: real forms, mocked writes. Requires an isolated local browser.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const pages = await (await fetch(`http://127.0.0.1:${Number(process.env.SERENE_BROWSER_PORT ?? 9224)}/json`, {signal:AbortSignal.timeout(10000)})).json();
const socket = new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
let id=0;const pending=new Map();
socket.on('message',raw=>{const message=JSON.parse(raw);if(!message.id)return;const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(message.error):request.resolve(message.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const pause=()=>new Promise(resolve=>setTimeout(resolve,80));
async function until(expression,message){for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause();}throw new Error(message);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause();}
async function fill(selector,value){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await pause();}
async function key(key,code=key,keyCode=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,text:key==='Enter'?'\r':undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode});await pause();}
async function open(form){const url=new URL('../output/form-workflows.html',import.meta.url);url.searchParams.set('form',form);await send('Page.navigate',{url:url.href});await until('document.readyState==="complete" && !!document.querySelector("#open")','Fixture did not load');if(form==='export')await evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.trim()==="Export").click()');else await click('#open');await until('!!document.querySelector("form")','Form did not open');}
const alertText=()=>evaluate('document.querySelector("[role=alert]")?.textContent ?? ""');
try {
  for(const [form,amount,inr,expected] of [
    ['payment','#pay-rate','#pay-inr',{rate:12.5,paid_amount_inr:1050.25}],
    ['topup','#top-amount','#top-inr',{amount:12.5,paid_amount_inr:1050.25,currency:'USD'}],
    ['recharge','#recharge-amount',null,{amount:12.5,currency:'INR'}],
  ]) {
    await open(form);
    await fill(amount,'12.50');
    if(inr)await fill(inr,'1050.25');
    await evaluate(`document.querySelector(${JSON.stringify(amount)}).focus()`);
    await key('Enter','Enter',13);
    await until('window.formTest.calls.length===1 && !!document.querySelector("[role=alert]")','Enter did not submit or error was not displayed');
    const payload=await evaluate('window.formTest.calls[0]');
    for(const [name,value] of Object.entries(expected))assert.equal(payload[name],value,`${form} preserves ${name}`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(amount)}).value`),'12.50',`${form} preserves amount after rejection`);
    assert.match(await alertText(),/Rejected by test/);
    if(inr){
      await click('#start-upload');
      await key('Escape');
      assert.equal(await evaluate('document.querySelector("#open-state").textContent'),'true','upload blocks Escape dismissal');
      assert.ok(await evaluate('document.querySelector("[role=dialog] button[aria-label]").disabled'),'upload disables close');
      await click('#finish-upload');
    }
    await evaluate('window.formTest.mode="pending";document.querySelector("form").requestSubmit()');
    await until('document.querySelector("[role=dialog]").getAttribute("aria-busy")==="true"','Saving state missing');
    await key('Escape');
    await evaluate('document.querySelector("form").requestSubmit()');
    assert.equal(await evaluate('window.formTest.calls.length'),2,'pending submission does not repeat');
    assert.equal(await evaluate('document.querySelector("#open-state").textContent'),'true','save blocks dismissal');
    if(inr)assert.equal(await evaluate('window.formTest.calls[1].invoice_path'),'test/invoice.pdf');
    await evaluate('window.formTest.resolve({data:null,error:"Still rejected"})');
    await until('document.querySelector("[role=dialog]").getAttribute("aria-busy")!=="true"','Pending did not settle');
    await evaluate('window.formTest.mode="throw";document.querySelector("form").requestSubmit()');
    await until('document.querySelector("[role=alert]")?.textContent.includes("could not confirm")','Transport uncertainty not explained');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(amount)}).value`),'12.50');
    await evaluate('window.formTest.mode="success";document.querySelector("form").requestSubmit()');
    await until('document.querySelector("#open-state").textContent==="false"','Success did not close');
    await new Promise(resolve=>setTimeout(resolve,350));
    await click('#open');
    await until('!!document.querySelector("form")','Reopen failed');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(inr ?? amount)}).value`),'',`${form} opens a fresh recording session`);
    console.log(`${form}: Enter, payload, retained draft, pending, failure recovery, and reopen passed`);
  }
  await open('won');
  const category=await evaluate('Array.from(document.querySelectorAll("#deal-category option")).find(option=>option.value).value');
  await fill('#deal-category',category);
  await fill('#deal-amount','1.2.3');
  await evaluate('document.querySelector("form").requestSubmit()');
  await until('!!document.querySelector("[role=alert]")','Invalid deal amount had no feedback');
  assert.equal(await evaluate('window.formTest.calls.length'),0,'Malformed deal amount is rejected');
  await fill('#deal-amount','1,250.50');
  await evaluate('document.querySelector("form").requestSubmit()');
  assert.equal(await evaluate('window.formTest.calls[0].deal_amount'),1250.5,'Grouped amount retains its exact numeric value');
  assert.equal(await evaluate('window.formTest.calls[0].deal_category'),category);
  console.log('won: malformed amount rejection and valid amount/category payload passed');
  await open('deal');
  await fill('#new-deal-name','Walk-in Contact');
  await fill('#new-deal-phone','9876543210');
  await evaluate('document.querySelector("#new-deal-phone").focus()');
  await key('Enter','Enter',13);
  await until('!!document.querySelector("#new-deal-form")','Enter did not advance contact step');
  await click('#new-deal-form .serene-filter-trigger');
  await until('!!document.querySelector("[role=option]")','Category menu did not open');
  await click('[role=option]');
  await fill('#new-deal-amount','1.2.3');
  await evaluate('document.querySelector("form").requestSubmit()');
  assert.equal(await evaluate('window.formTest.calls.length'),0,'Walk-in rejects malformed amount');
  await fill('#new-deal-amount','2,500.75');
  await evaluate('document.querySelector("form").requestSubmit()');
  await until('window.formTest.calls.length===1 && !!document.querySelector("[role=alert]")','Walk-in rejection not surfaced');
  assert.equal(await evaluate('window.formTest.calls[0].contact_name'),'Walk-in Contact');
  assert.equal(await evaluate('window.formTest.calls[0].assigned_to'),'test-agent');
  assert.equal(await evaluate('window.formTest.calls[0].deal_amount'),2500.75);
  assert.equal(await evaluate('document.querySelector("#new-deal-amount").value'),'2,500.75');
  await evaluate('window.formTest.mode="success";document.querySelector("form").requestSubmit()');
  await until('document.querySelector("#open-state").textContent==="false"','Walk-in success did not close');
  console.log('walk-in deal: Enter advances, malformed amount rejected, payload and failed draft retained');
  await open('export');
  await fill('#export-month','2026-09');
  await evaluate('window.formTest.mode="empty";document.querySelector("form").requestSubmit()');
  await until('!!document.querySelector("[role=status]")','Empty export was not informational');
  assert.equal(await evaluate('window.formTest.downloads'),0);
  await evaluate('window.formTest.mode="throw";document.querySelector("form").requestSubmit()');
  await until('!!document.querySelector("[role=alert]")','Export failure was not recoverable');
  assert.equal(await evaluate('document.querySelector("#export-month").value'),'2026-09');
  await evaluate('window.formTest.mode="success";document.querySelector("form").requestSubmit()');
  await until('window.formTest.downloads===1','Export did not invoke mocked download');
  console.log('export: empty result, failure recovery, retained month, and mocked download passed');

} finally {socket.close();}
