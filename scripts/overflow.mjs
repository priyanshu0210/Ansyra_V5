// Horizontal-overflow check in REAL Chrome over CDP.
//
// The in-app preview pane cannot do this — it reports visibilityState "hidden"
// and innerWidth 0, so its layout geometry is degenerate (it reported overflow
// on a page that has none). Real Chrome reports a real viewport.
//
// Why it exists: the in-app preview pane reported horizontal overflow on
// /dashboard/report-bug that does not exist. It reports visibilityState
// "hidden" AND innerWidth 0, so the compositor paints a real frame while
// scripts see a zero-width viewport — its computed STYLES are sound, its
// geometry is worthless. Real Chrome reports a real viewport.
//
// Usage:
//   node scripts/overflow.mjs http://localhost:3000 /legal/terms,/dashboard/help
//
// AUTH-GUARDED PAGES need a session cookie as a third argument:
//   node scripts/overflow.mjs http://localhost:3000 /dashboard/profile \
//     'sb-<ref>-auth-token=<value>'
//
// Without it those paths redirect to /login and quietly measure the login form
// instead — which is why the probe reports whether `.ansyra-page-ground` was
// present (`ground=Y/-`), so a miss is visible rather than silent.
//
// Exits non-zero if any page/width combination overflows.
import WebSocket from "ws";
import { spawn } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9223;
const [base, pathList, cookie] = process.argv.slice(2);
const paths = pathList.split(",");
const WIDTHS = [375, 768, 1024, 1440, 1920];

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--no-first-run",
  "--user-data-dir=/tmp/ansyra-overflow-profile",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("chrome never came up");
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.on("open", r));

let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

if (cookie) {
  const eq = cookie.indexOf("=");
  const u = new URL(base);
  await send("Network.setCookie", {
    name: cookie.slice(0, eq),
    value: cookie.slice(eq + 1),
    domain: u.hostname,
    path: "/",
    httpOnly: true,
  });
}

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      // Decorative layers inside an overflow-hidden ancestor are not page
      // overflow — the page only scrolls if the DOCUMENT scrolls.
      let clipped = false, p = el.parentElement;
      while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break; } p = p.parentElement; }
      if (!clipped) offenders.push(el.tagName + '.' + (typeof el.className === 'string' ? el.className.split(' ').slice(0,2).join('.') : '') + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
  });
  return JSON.stringify({
    vw, innerWidth: window.innerWidth, visibility: document.visibilityState,
    scrollWidth: document.documentElement.scrollWidth,
    docOverflow: document.documentElement.scrollWidth > vw,
    offenders: offenders.slice(0, 6),
    ground: !!document.querySelector('.ansyra-page-ground'),
    title: (document.querySelector('h1')||{}).textContent || null,
  });
})()`;

const results = [];
for (const p of paths) {
  for (const width of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height: 900, deviceScaleFactor: 1, mobile: width < 768,
    });
    await send("Page.navigate", { url: base + p });
    await sleep(1400);
    const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    results.push({ path: p, width, ...JSON.parse(r.result.value) });
  }
}

let bad = 0;
for (const r of results) {
  const flag = r.docOverflow ? "OVERFLOW" : "ok";
  if (r.docOverflow) bad++;
  console.log(
    `${flag.padEnd(9)} ${r.path.padEnd(18)} ${String(r.width).padStart(5)}px  vw=${String(r.vw).padStart(5)} scrollW=${String(r.scrollWidth).padStart(5)}  ground=${r.ground ? "Y" : "-"}  vis=${r.visibility}` +
      (r.offenders.length ? `\n            offenders: ${r.offenders.join(" | ")}` : ""),
  );
}
console.log(`\n${results.length} page/width combinations, ${bad} with horizontal overflow.`);

ws.close();
chrome.kill();
process.exit(bad ? 1 : 0);
