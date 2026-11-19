// Drives the v2 prototype in headless Chrome over the DevTools protocol (no dependencies):
// runs the interaction checks below, saves real screenshots, prints results and console errors.
// Usage: start the preview server (node design-previews/serve.mjs), then: node design-previews/v2/check.mjs
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5191/design-previews/v2/", PORT = 9377;
const out = join(import.meta.dirname, "screenshots"); mkdirSync(out, { recursive: true });

const helpers = `const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){if(fn())return true;await wait(150)}return false};
const $$=s=>[...document.querySelectorAll(s)];
const drawn=root=>until(()=>{const c=$$(root+' canvas[data-regions]');return c.length>0&&c.every(x=>x.dataset.ready)});
const settle=async()=>{await wait(450);document.getAnimations().forEach(a=>{try{a.finish()}catch{}});await wait(50)};
const overflow=()=>document.documentElement.scrollWidth>innerWidth+1;
const small=()=>$$('button,a,select,input').filter(e=>e.offsetParent&&!e.disabled).map(e=>[e,e.getBoundingClientRect()]).filter(([e,r])=>r.width>0&&(r.height<40||r.width<40)).map(([e])=>(e.id||e.className||e.tagName)+'').slice(0,12);`;

const DESKTOP = [1440, 900], TABLET = [768, 1024], PHONE = [390, 844];
const steps = [
  { size: DESKTOP }, { goto: "index.html" },
  { js: `localStorage.clear();sessionStorage.clear();return 'storage cleared'` }, { goto: "index.html" },
  { name: "bank loads", js: `await until(()=>$$('.row').length>0);await settle();return{rows:$$('.row').length,units:$$('.unit').length,heading:document.querySelector('#heading').innerText,overflow:overflow()}` },
  { shot: "bank-all-desktop" },
  { name: "unit then topic", js: `document.querySelector('.unit[data-unit=u3]').click();await wait(300);const topics=$$('.topic').length;document.querySelector('.topic[data-topic="3.4"]').click();await wait(300);return{topics,heading:document.querySelector('#heading').innerText,rows:$$('.row').length}` },
  { name: "add two, select third", js: `$$('.row')[0].querySelector('[data-add]').click();$$('.row')[3].querySelector('[data-add]').click();$$('.row')[2].click();const ok=await drawn('#pane');await settle();return{drawn:ok,dock:$$('#dock li').length,nav:document.querySelector('#nav-count').textContent,title:document.querySelector('.pane-head h2').innerText}` },
  { shot: "bank-topic-desktop" },
  { key: "ArrowDown" }, { key: "a" },
  { name: "keyboard: down then A", js: `await wait(200);return{selected:$$('.row').findIndex(r=>r.getAttribute('aria-selected')==='true'),dock:$$('#dock li').length,button:document.querySelector('[data-toggle]').innerText}` },
  { key: "f" },
  { name: "keyboard: F shows full page", js: `const ok=await drawn('#pane');await settle();return{drawn:ok,mode:document.querySelector('[data-mode=page]').getAttribute('aria-pressed')}` },
  { shot: "bank-fullpage-desktop" },
  { name: "add two unreviewed questions", js: `$$('.row')[4].querySelector('[data-add]').click();$$('.row')[5].querySelector('[data-add]').click();await wait(200);return{dock:$$('#dock li').length}` },
  { key: "/" },
  { name: "slash focuses search; search filters", js: `const focused=document.activeElement.id;const q=document.querySelector('#q');q.value='partial pressure';q.dispatchEvent(new Event('input'));await wait(200);const rows=$$('.row').length;q.value='zzzz';q.dispatchEvent(new Event('input'));await wait(200);const empty=!!document.querySelector('.rows .empty');document.querySelector('.rows [data-clear]').click();await wait(200);q.blur();return{focused,rows,empty,afterClear:$$('.row').length}` },
  { name: "shared stimulus, print-ready", js: `document.querySelector('.unit.all').click();await wait(200);document.querySelector('#year').value='2008';document.querySelector('#year').dispatchEvent(new Event('change',{bubbles:true}));await wait(200);document.querySelector('#ready').click();await wait(300);let found=false;for(const r of $$('.row')){r.click();await wait(120);if(document.querySelector('#pane .q-shared')){found=true;break}}const ok=await drawn('#pane');await settle();document.querySelector('[data-toggle]').click();await wait(200);return{rows:$$('.row').length,found,drawn:ok,status:document.querySelector('.pane-status').innerText,dock:$$('#dock li').length}` },
  { shot: "bank-shared-desktop" },
  { name: "typeset question (reviewed text)", js: `document.querySelector('#year').value='all';document.querySelector('#year').dispatchEvent(new Event('change',{bubbles:true}));const q=document.querySelector('#q');q.value='paper chromatography';q.dispatchEvent(new Event('input'));await wait(300);const rows=$$('.row').length;$$('.row')[0]?.click();await wait(300);const typeset=!!document.querySelector('#pane .q-choices');if(typeset)document.querySelector('[data-toggle]').click();await wait(200);q.value='';q.dispatchEvent(new Event('input'));document.querySelector('#ready').click();await wait(200);return{rows,typeset,dock:$$('#dock li').length}` },
  { reload: true },
  { name: "after reload", js: `await until(()=>$$('.row').length>0);return{dock:$$('#dock li').length,nav:document.querySelector('#nav-count').textContent}` },

  { goto: "builder.html" },
  { name: "builder receives selection", js: `await until(()=>$$('.item').length>0);const ok=await drawn('#blocks');await settle();return{items:$$('.item').length,blocks:$$('.block').length,drawn:ok,summary:document.querySelector('#summary').innerText,overflow:overflow()}` },
  { shot: "builder-desktop" },
  { name: "reorder, remove, undo", js: `const order=()=>$$('.item b').map(b=>b.innerText.trim());const a=order();$$('.item')[0].querySelector('[data-move="1"]').click();await wait(300);const b=order();$$('.item')[1].querySelector('[data-remove]').click();await wait(300);const c=order().length;const toast=!document.querySelector('#toast').hidden;document.querySelector('#undo').click();await wait(300);return{moved:a[0]===b[1]&&a[1]===b[0],afterRemove:c,toast,afterUndo:order().length,sameAsBeforeRemove:JSON.stringify(order())===JSON.stringify(b),paperOrderMatches:JSON.stringify($$('.block').map(x=>x.dataset.id))===JSON.stringify($$('.item').map(x=>x.dataset.id))}` },
  { name: "group by type, title, options", js: `document.querySelector('[data-grouping=type]').click();await wait(300);const groups=$$('.group').map(g=>g.innerText);const heads=$$('.paper h2').map(h=>h.innerText);const t=document.querySelector('#title');t.value='Gases and solutions review';t.dispatchEvent(new Event('input'));await wait(200);$$('.item')[1].click();const ok=await drawn('#blocks');await settle();return{groups,heads,h1:document.querySelector('#h1').innerText,drawn:ok,current:$$('.block[data-current]').length}` },
  { shot: "builder-grouped-desktop" },
  { name: "export dialog", js: `document.querySelector('#export').click();await settle();return{open:document.querySelector('#dlg').open,text:document.querySelector('#dlg-body p').innerText,pdfDisabled:document.querySelector('.demo .btn').disabled}` },
  { shot: "builder-export-desktop" },
  { name: "back to bank keeps everything", js: `document.querySelector('#dlg').close();setTimeout(()=>document.querySelector('.nav a').click(),50);return 'clicking Question bank'` }, { pause: 1800 },
  { name: "bank after return", js: `await until(()=>$$('.row').length>0);return{url:location.pathname.split('/').pop(),dock:$$('#dock li').length,added:$$('.row [data-add][aria-pressed=true]').length>=0}` },

  { size: TABLET }, { goto: "index.html" },
  { name: "bank tablet", js: `await until(()=>$$('.row').length>0);document.querySelector('.unit[data-unit=u8]').click();await wait(300);document.querySelector('.topic[data-topic="8.3"]').click();await wait(300);$$('.row')[1].click();const ok=await drawn('#pane');await settle();return{drawn:ok,overflow:overflow()}` },
  { shot: "bank-tablet" },
  { goto: "builder.html" }, { name: "builder tablet", js: `const ok=await drawn('#blocks');await settle();return{drawn:ok,overflow:overflow()}` }, { shot: "builder-tablet" },

  { size: PHONE }, { goto: "index.html" }, { js: `sessionStorage.clear();return 1` }, { goto: "index.html" },
  { name: "bank phone", js: `await until(()=>$$('.row').length>0);document.querySelector('.unit[data-unit=u8]').click();await wait(300);await settle();return{overflow:overflow(),paneHidden:getComputedStyle(document.querySelector('#pane')).visibility,small:small()}` },
  { shot: "bank-phone" },
  { name: "phone: open a question", js: `$$('.row')[1].click();const ok=await drawn('#pane');await settle();return{drawn:ok,pane:document.body.hasAttribute('data-pane'),dockVisible:document.querySelector('#dock').getBoundingClientRect().top<innerHeight,overflow:overflow()}` },
  { shot: "bank-question-phone" },
  { goto: "builder.html" },
  { name: "builder phone outline", js: `await until(()=>$$('.item').length>0);await settle();return{overflow:overflow(),small:small()}` }, { shot: "builder-outline-phone" },
  { name: "builder phone preview", js: `document.querySelector('.switch [data-view=preview]').click();const ok=await drawn('#blocks');await settle();return{drawn:ok,overflow:overflow()}` }, { shot: "builder-preview-phone" },
];

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "chematlas-check-"))}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch { /* not up yet */ } }
if (!target) { chrome.kill(); throw new Error("Chrome did not start"); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r));
let seq = 0; const pending = new Map(), problems = [];
ws.addEventListener("message", e => { const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  else if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split("\n")[0]);
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" "));
  else if (m.method === "Network.loadingFailed" && !m.params.canceled) problems.push("request failed: " + m.params.errorText);
  else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) problems.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`); });
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++seq, { resolve, reject }); ws.send(JSON.stringify({ id: seq, method, params })); });
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

let failed = 0;
try {
  for (const step of steps) {
    if (step.size) { const [width, height] = step.size, mobile = width < 700; await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }); await send("Emulation.setTouchEmulationEnabled", { enabled: mobile }); }
    else if (step.reload) { await send("Page.reload"); await sleep(1500); }
    else if (step.pause) await sleep(step.pause);
    else if (step.goto) { await send("Page.navigate", { url: BASE + step.goto }); await sleep(1200); }
    else if (step.key) { const key = step.key, code = key.length === 1 ? (key === "/" ? "Slash" : "Key" + key.toUpperCase()) : key, vk = { ArrowDown: 40, ArrowUp: 38, "/": 191 }[key] ?? key.toUpperCase().charCodeAt(0);
      for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, text: type === "keyDown" && key.length === 1 && key !== "/" ? undefined : undefined }); await sleep(250); }
    else if (step.shot) { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, step.shot + ".png"), Buffer.from(data, "base64")); console.log("  shot", step.shot + ".png"); }
    else if (step.js) { const r = await send("Runtime.evaluate", { expression: `(async()=>{${helpers}${step.js}})()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) { failed++; console.log("FAIL", step.name, "-", (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split("\n")[0]); }
      else if (step.name) console.log(step.name, "→", JSON.stringify(r.result.value)); }
  }
} finally { ws.close(); chrome.kill(); }
console.log(problems.length ? `\n${problems.length} page problem(s):\n` + [...new Set(problems)].join("\n") : "\nNo console errors, exceptions or failed requests.");
process.exit(failed ? 1 : 0);
