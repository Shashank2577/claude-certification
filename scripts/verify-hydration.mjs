// Verifies every explainer across all 26 visuals, clicking controls inside each figure so
// that interactions which only mismatch after the first click are caught too, not just on load.
//
//   pnpm dev --port 3111                 # in one terminal
//   node scripts/verify-hydration.mjs    # plain motion
//   node scripts/verify-hydration.mjs --rm   # forced prefers-reduced-motion
//
// Fails on: a React hydration error, an animation still running under reduced motion, or an
// element left stuck at opacity 0.

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REDUCED = process.argv.includes("--rm");
const PORT = Number(process.env.CDP || 9461);
const BASE = process.env.BASE || "http://localhost:3111";

const args = ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${PORT}`, "--window-size=1280,1100"];
if (REDUCED) args.push("--force-prefers-reduced-motion");
args.push("about:blank");
const proc = spawn(CHROME, args, { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) =>
  new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });

for (let i = 0; i < 80; i++) {
  try {
    await get("/json/version");
    break;
  } catch {
    await sleep(300);
  }
}

const page = (await get("/json/list")).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let hyd = [];
await new Promise((r) => ws.addEventListener("open", r));
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.consoleAPICalled") {
    const txt = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    if (/hydrat|didn't match|regenerated on the client/i.test(txt)) hyd.push(txt.slice(0, 90));
  }
  if (m.method === "Runtime.exceptionThrown") {
    const txt = m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? "";
    if (/hydrat/i.test(txt)) hyd.push("EXC " + txt.slice(0, 90));
  }
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description ?? "").slice(0, 200));
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(2400);
await js(`(()=>{const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value');d.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
 const q=n=>[...document.querySelectorAll('input')].find(i=>i.name===n);
 set(q('email'),process.env.QA_EMAIL||'qa-bot@example.com');set(q('password'),process.env.QA_PASSWORD||'Passw0rd!23');return 1;})()`
  .replace("process.env.QA_EMAIL||'qa-bot@example.com'", JSON.stringify(process.env.QA_EMAIL || "qa-bot@example.com"))
  .replace("process.env.QA_PASSWORD||'Passw0rd!23'", JSON.stringify(process.env.QA_PASSWORD || "Passw0rd!23")));
await js(`[...document.querySelectorAll('button')].find(b=>/^log in$/i.test(b.textContent.trim())).click()`);
await sleep(3600);
if ((await js("location.pathname")) === "/onboarding") {
  for (let i = 0; i < 12; i++) {
    const r = await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/start my plan/i.test(x.textContent));if(b&&!b.disabled){b.click();return 1;}return 0;})()`);
    await sleep(800);
    if (r === 1) break;
  }
  await sleep(2200);
}

const paths = {};
for (const cert of fs.readdirSync("content/modules")) {
  for (const file of fs.readdirSync(`content/modules/${cert}`)) {
    const domain = file.replace(".json", "");
    for (const lesson of JSON.parse(fs.readFileSync(`content/modules/${cert}/${file}`, "utf8")).lessons ?? []) {
      if (lesson.visualId && !paths[lesson.visualId]) paths[lesson.visualId] = `/learn/${cert}/${domain}/${lesson.id}`;
    }
  }
}

const problems = [];
for (const [visual, url] of Object.entries(paths)) {
  hyd = [];
  await send("Page.navigate", { url: BASE + url });
  await sleep(2600);
  const buttons = await js(`(()=>{const f=document.querySelector('figure'); if(!f)return 0;
    return [...f.querySelectorAll('button')].filter(x=>!x.disabled).slice(0,8).length;})()`);
  for (let i = 0; i < Math.min(buttons, 8); i++) {
    await js(`(()=>{const f=document.querySelector('figure'); if(!f)return 0;
      const b=[...f.querySelectorAll('button')].filter(x=>!x.disabled);
      if(b[${i}]){b[${i}].click(); return 1;} return 0;})()`);
    await sleep(320);
  }
  await sleep(700);
  const running = REDUCED
    ? await js(`document.getAnimations().filter(a=>{const d=a.effect?.getTiming?.().duration; return typeof d==='number'&&d>0}).length`)
    : -1;
  const invisible = await js(`(()=>{const f=document.querySelector('figure'); if(!f)return -1;
    let n=0; f.querySelectorAll('[style*="opacity"]').forEach(el=>{if(parseFloat(getComputedStyle(el).opacity)===0)n++;}); return n;})()`);
  if (hyd.length || running > 0 || invisible > 0) {
    problems.push(`${visual}: hydration=${hyd.length} animations=${running} stuckOpacity0=${invisible}${hyd.length ? " :: " + hyd[0] : ""}`);
  }
}

console.log(`${REDUCED ? "REDUCED" : "PLAIN  "} motion: swept ${Object.keys(paths).length} visuals, clicked controls in each`);
if (problems.length) {
  console.log("  PROBLEMS:");
  problems.forEach((p) => console.log("   " + p));
} else {
  console.log("  clean: 0 hydration errors, 0 running animations, nothing stuck invisible");
}
proc.kill();
process.exit(problems.length ? 1 : 0);
