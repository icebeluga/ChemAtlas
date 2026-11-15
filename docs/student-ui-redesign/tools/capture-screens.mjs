// Drives the real student app in headless Chrome over the DevTools protocol (no dependencies),
// runs interaction checks and saves screenshots to docs/student-ui-redesign/screenshots/.
//
// 1. Start the UI-only dev server:  pnpm exec vite dev --config vite.ui.config.ts --host 127.0.0.1 --port 5193
// 2. Run:                            node docs/student-ui-redesign/tools/capture-screens.mjs
// Set CHROME to the browser path if it is not the default Windows location; set BASE for another port.
// This checks UI behaviour only. It does not exercise the Worker, Cloudflare Access or response headers.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE ?? "http://127.0.0.1:5193";
const PORT = 9378;
const out = join(import.meta.dirname, "..", "screenshots"); mkdirSync(out, { recursive: true });

const helpers = `const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=45000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(fn())return true}catch{}await wait(150)}return false};
const $$=s=>[...document.querySelectorAll(s)];const $=s=>document.querySelector(s);
const drawn=(root='.ca-viewport')=>until(()=>$$(root+' canvas').some(c=>c.style.visibility==='visible'&&c.width>200));
const settle=async()=>{await wait(500);document.getAnimations().forEach(a=>{try{a.finish()}catch{}});await wait(60)};
const overflow=()=>document.documentElement.scrollWidth>innerWidth+1;
const small=()=>$$('button,a,select,input').filter(e=>e.offsetParent&&!e.disabled).map(e=>[e,e.getBoundingClientRect()]).filter(([e,r])=>r.width>0&&r.bottom>0&&r.top<innerHeight&&(r.height<40||r.width<36)).map(([e])=>(e.getAttribute('aria-label')||e.textContent||e.className||e.tagName).trim().slice(0,28)).slice(0,14);`;

const DESKTOP = [1440, 900], TABLET = [768, 1024], PHONE = [390, 844];
const steps = [
  { size: DESKTOP }, { goto: "/" },
  { js: `localStorage.removeItem('chematlas-worksheets-v1');return 'worksheet storage cleared'` }, { goto: "/" },
  { name: "bank loads", js: `await until(()=>$$('.ca-row[data-id]').length>0);await drawn();await settle();return{rows:$$('.ca-row[data-id]').length,units:$$('.ca-unit').length,heading:$('.ca-list-title h1').innerText,count:$('.ca-list-title small').innerText,browseHeading:!!$$('h2').find(h=>/Browse by unit/.test(h.textContent)),overflow:overflow()}` },
  { shot: "bank-all-desktop" },
  { name: "unit then topic", js: `$('.ca-unit[data-u=u3]').click();await wait(400);const h1=$('.ca-list-title h1').innerText;const topics=$$('.ca-topic').length;$$('.ca-topic').find(t=>t.textContent.startsWith('3.4')).click();await wait(400);return{unitHeading:h1,topics,heading:$('.ca-list-title').innerText,rows:$$('.ca-row[data-id]').length,chipCount:$$('.ca-topic').find(t=>t.textContent.startsWith('3.4')).querySelector('i').textContent,url:location.search}` },
  { name: "add two, select third", js: `$$('.ca-row[data-id]')[0].querySelector('.ca-add').click();await wait(150);$$('.ca-row[data-id]')[3].querySelector('.ca-add').click();await wait(150);$$('.ca-row[data-id]')[2].querySelector('.ca-row-open').click();const ok=await drawn();await settle();return{drawn:ok,dock:$$('.ca-dock li').length,nav:$('.ca-count').textContent,title:$('.ca-pane-head h2').innerText,url:location.search,stored:JSON.parse(localStorage.getItem('chematlas-worksheets-v1')).drafts[0].entries.length}` },
  { shot: "bank-topic-desktop" },
  { key: "ArrowDown" }, { key: "a" },
  { name: "keyboard: down then A", js: `await wait(300);return{selected:$$('.ca-row[data-id]').findIndex(r=>r.hasAttribute('data-current')),dock:$$('.ca-dock li').length}` },
  { key: "f" },
  { name: "keyboard: F switches to question crop", js: `await wait(300);const ok=await drawn();await settle();return{drawn:ok,crop:$$('.ca-pane-head .ca-seg button')[1].getAttribute('aria-pressed')}` },
  { shot: "bank-crop-desktop" },
  { key: "f" }, { key: "/" },
  { name: "search, empty state, clear", js: `const focused=document.activeElement.getAttribute('aria-label');const set=v=>{const i=$('.ca-search input');const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;d.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}))};set('partial pressure');await wait(400);const rows=$$('.ca-row[data-id]').length;set('zzzzqq');await wait(400);const empty=!!$('.ca-rows .ca-empty');$('.ca-rows .ca-empty .ca-btn').click();await wait(400);document.activeElement.blur();return{focused,rows,empty,afterClear:$$('.ca-row[data-id]').length}` },
  { name: "reviewed-only filter and type", js: `$('.ca-check input').click();await wait(400);const reviewed=$$('.ca-row[data-id]').length;const allTicked=$$('.ca-row[data-id]').every(r=>r.querySelector('.ca-ready'));$('.ca-check input').click();$$('.ca-filters .ca-seg button')[2].click();await wait(400);const frq=$$('.ca-row[data-id]').every(r=>r.querySelector('.ca-tag').textContent==='FRQ');$$('.ca-filters .ca-seg button')[0].click();await wait(300);return{reviewed,allTicked,frqOnly:frq}` },
  { name: "old detail URL opens the bank with the question", goto: "/?view=detail&question=mcq-2008-1-29" },
  { name: "old detail URL result", js: `await until(()=>$('.ca-pane-head h2'));const ok=await drawn();return{title:$('.ca-pane-head h2').innerText,drawn:ok}` },
  { reload: true },
  { name: "selection survives reload", js: `await until(()=>$$('.ca-dock li').length>0||$('.ca-dock .ca-hint'));return{dock:$$('.ca-dock li').length,nav:$('.ca-count').textContent}` },
  { goto: "/?view=progress" }, { name: "legacy view in new shell", js: `await until(()=>$('.page-title'));await settle();return{title:$('.page-title').innerText,bar:!!$('.ca-bar'),overflow:overflow()}` }, { shot: "legacy-progress-desktop" },
  { goto: "/practice-builder" },
  { name: "builder receives selection", js: `await until(()=>$$('h1').some(h=>h.textContent.trim()==='Practice Builder'));await until(()=>$$('.ca-b-item').length>0);return{count:$('.ca-b-count').textContent,items:$$('.ca-b-item').length,overflow:overflow()}` },
  { name: "builder: add two more from the bank's storage, then real PDF preview", js: `const k='chematlas-worksheets-v1';const b=JSON.parse(localStorage.getItem(k));const d=b.drafts.find(x=>x.id===b.active);for(const id of ['frq-2006-3-22','mcq-2008-1-29','mcq-2022-2-1617'])if(!d.entries.some(e=>e.id===id))d.entries.push({id,breakBefore:false});localStorage.setItem(k,JSON.stringify(b));location.reload();return 'seeded'` },
  { pause: 2500 },
  { name: "builder: PDF preview drawn", js: `await until(()=>$$('.ca-b-item').length>=3);const ok=await until(()=>$$('.worksheet-paper canvas').some(c=>c.width>200),90000);await settle();return{items:$$('.ca-b-item').length,pdfDrawn:ok,state:$('.ca-b-state').textContent,download:!!$$('.ca-b-export a').find(a=>/Download PDF/.test(a.textContent)),note:$('.ca-b-note').textContent.slice(0,120),overflow:overflow()}` },
  { shot: "builder-desktop" },
  { name: "builder: reorder, remove, undo", js: `const order=()=>$$('.ca-b-item .ca-b-what b').map(b=>b.innerText.trim());const a=order();$$('.ca-b-item')[0].querySelector('[aria-label*="down"]').click();await wait(300);const b=order();$$('.ca-b-item')[1].querySelector('.ca-b-remove').click();await wait(300);const c=order().length;$$('.ca-b-outline-head .ca-btn')[0].click();await wait(300);return{moved:a[0]===b[1]&&a[1]===b[0],afterRemove:c,afterUndo:order().length,stored:JSON.parse(localStorage.getItem('chematlas-worksheets-v1')).drafts.find(d=>d.entries.length).entries.length}` },
  { name: "builder: layout tab", js: `$$('.ca-b-tabs button').find(b=>b.textContent==='Layout').click();await settle();return{legacy:!!$('.ca-b-legacy'),presets:$$('.worksheet-preset option').length}` },
  { shot: "builder-layout-desktop" },
  { name: "builder: add tab", js: `$$('.ca-b-tabs button').find(b=>b.textContent==='Add questions').click();await until(()=>$$('.worksheet-row').length>0);await settle();return{rows:$$('.worksheet-row').length}` },
  { shot: "builder-add-desktop" },

  { size: TABLET }, { goto: "/?view=library&unit=u8&topic=8.3" },
  { name: "bank tablet", js: `await until(()=>$$('.ca-row[data-id]').length>0);$$('.ca-row[data-id]')[1].querySelector('.ca-row-open').click();const ok=await drawn();await settle();return{drawn:ok,overflow:overflow()}` },
  { shot: "bank-tablet" },
  { goto: "/practice-builder" }, { name: "builder tablet", js: `await until(()=>$$('.ca-b-item').length>0);const ok=await until(()=>$$('.worksheet-paper canvas').some(c=>c.width>200),90000);await settle();return{pdfDrawn:ok,overflow:overflow()}` }, { shot: "builder-tablet" },

  { size: PHONE }, { goto: "/?view=library&unit=u8" },
  { name: "bank phone", js: `await until(()=>$$('.ca-row[data-id]').length>0);await settle();return{overflow:overflow(),unitsVisible:$$('.ca-unit:not(.is-all)').every(u=>{const r=u.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),paneHidden:getComputedStyle($('.ca-pane')).visibility,small:small()}` },
  { shot: "bank-phone" },
  { name: "phone: topic sheet", js: `$$('.ca-topic-open')[0].click();await settle();return{open:$('.ca-sheet').open,items:$$('.ca-sheet li').length}` }, { shot: "bank-topics-phone" },
  { name: "phone: choose topic, open question", js: `$$('.ca-sheet li button')[3].click();await wait(400);const heading=$('.ca-list-title').innerText;$$('.ca-row[data-id]')[1].querySelector('.ca-row-open').click();const ok=await drawn();await settle();return{heading,drawn:ok,pane:$('.ca-bank').hasAttribute('data-pane'),dockVisible:$('.ca-dock').getBoundingClientRect().top<innerHeight,overflow:overflow(),small:small()}` },
  { shot: "bank-question-phone" },
  { name: "phone: back returns to the list", js: `history.back();await wait(500);return{pane:$('.ca-bank').hasAttribute('data-pane'),rows:$$('.ca-row[data-id]').length}` },
  { goto: "/practice-builder" },
  { name: "builder phone: outline tab", js: `await until(()=>$$('.ca-b-tabs button').length>0);$$('.ca-b-tabs button').find(b=>b.textContent==='Outline').click();await until(()=>$$('.ca-b-item').length>0);await settle();return{items:$$('.ca-b-item').length,sideHidden:getComputedStyle($('.ca-b-side')).display,overflow:overflow(),small:small()}` },
  { shot: "builder-outline-phone" },
  { name: "builder phone: preview tab", js: `$$('.ca-b-tabs button').find(b=>b.textContent==='Preview').click();const ok=await until(()=>$$('.worksheet-paper canvas').some(c=>c.width>200),90000);await settle();return{pdfDrawn:ok,outlineHidden:getComputedStyle($('.ca-b-outline')).display,overflow:overflow()}` },
  { shot: "builder-preview-phone" },
];

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "chematlas-capture-"))}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch { /* not up yet */ } }
if (!target) { chrome.kill(); throw new Error("Chrome did not start"); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r));
let seq = 0; const pending = new Map(), problems = [];
ws.addEventListener("message", e => { const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (!p) return; m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  else if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split("\n")[0]);
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) problems.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`); });
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++seq, { resolve, reject }); ws.send(JSON.stringify({ id: seq, method, params })); });
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

let failed = 0;
try {
  for (const step of steps) {
    if (step.size) { const [width, height] = step.size, mobile = width < 700; await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }); await send("Emulation.setTouchEmulationEnabled", { enabled: mobile }); }
    else if (step.goto) { await send("Page.navigate", { url: BASE + step.goto }); await sleep(1500); }
    else if (step.reload) { await send("Page.reload"); await sleep(1500); }
    else if (step.pause) await sleep(step.pause);
    else if (step.key) { const key = step.key, code = key.length === 1 ? (key === "/" ? "Slash" : "Key" + key.toUpperCase()) : key, vk = { ArrowDown: 40, ArrowUp: 38, "/": 191 }[key] ?? key.toUpperCase().charCodeAt(0);
      for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk }); await sleep(250); }
    else if (step.shot) { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, step.shot + ".png"), Buffer.from(data, "base64")); console.log("  shot", step.shot + ".png"); }
    else if (step.js) { try { const r = await send("Runtime.evaluate", { expression: `(async()=>{${helpers}${step.js}})()`, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) { failed++; console.log("FAIL", step.name, "-", (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split("\n")[0]); }
        else if (step.name) console.log(step.name, "→", JSON.stringify(r.result.value)); }
      catch (error) { failed++; console.log("FAIL", step.name, "-", error.message); } }
  }
} finally { ws.close(); chrome.kill(); }
console.log(problems.length ? `\n${problems.length} page problem(s):\n` + [...new Set(problems)].join("\n") : "\nNo console errors, exceptions or failed requests.");
process.exit(failed ? 1 : 0);
