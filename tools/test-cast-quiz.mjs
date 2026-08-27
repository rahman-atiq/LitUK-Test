#!/usr/bin/env node
/**
 * Drives life-in-uk-cast.html in a real browser and asserts the things a
 * screenshot cannot.
 *
 *   node tools/test-cast-quiz.mjs            (needs playwright-core; skips without it)
 *
 * Three classes of check.
 *
 * Static, over cast-data.js: every card can be turned into every question type
 * it claims, every cloze index points at a real <b> span, every group anchor
 * exists on the sheet the link sends you to.
 *
 * Live, over many rounds of actual play: no question ever renders with a
 * duplicate option, an empty option, or a stray tag; every answer lands on
 * exactly one right option; the round ends where it says it will.
 *
 * And INV-C7, which is the whole reason the collision pass exists. Grey-Thompson
 * and Weir are both welded to "six London Marathon wins", so a distractor drawn
 * from the same group can be a better answer than the key. The live pass maps
 * every rendered option back to the figure it came from and fails if any of
 * them is in the answer's `col` or `sm` list. That is a property no amount of
 * looking at the page would show you: it is wrong one time in ten, silently.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { R } from "./lib/banks.mjs";

/* Where a browser might be. These two are this machine's; anywhere else —
   a laptop, CI — playwright knows its own install path and is asked for it
   below, once it has been imported. Hardcoding only these two is what kept the
   live pass skipped everywhere but here. */
let CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome"].find((p) => fs.existsSync(p));

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

/* ---------------- static: the data ---------------- */

const src = fs.readFileSync(R("cast-data.js"), "utf8");
const sandbox = {};
new Function("window", src)(sandbox);
const D = sandbox.LITUK_CAST;

ok(D && D.v === 1, "cast-data.js exposes window.LITUK_CAST at v1");
ok(D.people.length === 195, `195 welds expected, got ${D.people.length}`);
ok(D.groups.length === 17, `17 groups expected, got ${D.groups.length}`);

const strip = (h) => String(h).replace(/<[^>]*>/g, "");
const boldsOf = (p) => [...p.w.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => strip(m[1]).trim());

for (const ax of ["era", "field"]) {
  const n = D.groups.filter((g) => g.ax === ax).length;
  ok(n >= 4, `axis "${ax}" needs 4+ groups to make a 4-option question, has ${n}`);
}

let noteDupes = 0, thinPool = 0, badCz = 0, selfRef = 0;
const notes = new Map();
for (const p of D.people) {
  ok(!!p.k && !!p.n && !!p.w, `weld ${p.i} is missing a key, name or note`);
  if (p.col.includes(p.i) || p.sm.includes(p.i)) selfRef++;

  const bolds = boldsOf(p);
  for (const [n] of p.cz) if (!bolds[n] || !bolds[n].length) badCz++;

  /* The page widens past the group when it must, so the real requirement is
     three usable distractors *somewhere* in the cast. */
  const bad = new Set([p.i, ...p.col, ...p.sm]);
  const pool = D.people.filter((o) => !bad.has(o.i));
  const names = new Set(pool.map((o) => strip(o.n).toLowerCase()));
  const facts = new Set(pool.map((o) => strip(o.w).toLowerCase()));
  if (names.size < 3 || facts.size < 3) thinPool++;

  const key = strip(p.w).toLowerCase();
  if (notes.has(key)) noteDupes++;
  notes.set(key, p.i);
}
ok(selfRef === 0, `${selfRef} weld(s) list themselves as a collision or twin`);
ok(badCz === 0, `${badCz} cloze index/indices do not point at a non-empty <b> span`);
ok(thinPool === 0, `${thinPool} weld(s) cannot raise three legal distractors`);

for (const k of ["y", "n", "t"]) {
  const vals = new Set();
  for (const p of D.people) for (const [n, kind] of p.cz) if (kind === k) vals.add(boldsOf(p)[n].toLowerCase());
  ok(vals.size >= 4, `cloze pool "${k}" needs 4 distinct spans to fill a question, has ${vals.size}`);
}

/* Every duel has to be winnable. The mode shows one figure's *whole* note and
   asks which of two names it belongs to — fair only while each side says
   something the other does not. Grey-Thompson and Weir share "six London
   Marathon wins", but she alone has "16 Paralympic medals" and he alone has
   "six golds over two Paralympic Games", so the full note decides it. A pair
   whose notes were distinctive only in the words they share would be a coin
   flip dressed as a question. */
/* A deliberately thin stoplist. The build script's is tuned to find *shared*
   meaning, so it drops quantity words; here the question is what tells two
   cards apart, and "first" is the entire difference between Walpole and
   Wellington. Only true function words go. */
const STOP = new Set(("the a an of in on at to for and or is are was were be been it its as by with from into " +
  "over under between than then there here this that these those his her their which who when where how why " +
  "what he she they them him had has have but if").split(" "));
const words = (h) => new Set(strip(h).toLowerCase().split(/[^a-z0-9’'-]+/)
  .map((w) => w.replace(/^[’'-]+|[’'-]+$/g, ""))
  .filter((w) => (w.length > 3 && !STOP.has(w)) || /^\d{3,4}$/.test(w)));
let mute = 0, duelPairs = 0;
for (const p of D.people) {
  for (const j of p.col) {
    if (j < p.i) continue;
    duelPairs++;
    const a = words(p.w), b = words(D.people[j].w);
    const aOnly = [...a].filter((w) => !b.has(w)).length;
    const bOnly = [...b].filter((w) => !a.has(w)).length;
    if (!aOnly || !bOnly) { mute++; fails.push(`duel "${p.n}" vs "${D.people[j].n}" is not decidable from the notes shown`); checks++; }
  }
}
ok(mute === 0, `${mute} duel pair(s) cannot be told apart from the notes shown`);
ok(duelPairs >= 20, `expected a meaningful duel bank, got ${duelPairs} pairs`);

/* Every "see this card on the sheet" link has to land on something. */
const sheets = new Map();
for (const g of D.groups) {
  if (!sheets.has(g.f)) sheets.set(g.f, fs.readFileSync(R(g.f), "utf8"));
  ok(sheets.get(g.f).includes(`id="${g.a}"`), `${g.f} has no anchor #${g.a} for group "${g.l}"`);
}

/* The two Leitner ladders must not drift (PLAN-cast-quiz.md, F-7/F-8). */
const castPage = fs.readFileSync(R("life-in-uk-cast.html"), "utf8");
const mockPage = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const ladder = (s) => ((s.match(/SR_BASE\s*=\s*\[([^\]]+)\]/) || [])[1] || "").replace(/\s+/g, "");
const gap = (s) => (s.match(/EXAM_GAP\s*=\s*(\d+)/) || [])[1];
ok(ladder(castPage) === ladder(mockPage), `SR_BASE differs: cast [${ladder(castPage)}] vs mock [${ladder(mockPage)}]`);
ok(gap(castPage) === gap(mockPage), `EXAM_GAP differs: cast ${gap(castPage)} vs mock ${gap(mockPage)}`);
ok(!/localStorage\.setItem\(\s*["']lituk_v1/.test(castPage), "the cast page must never write lituk_v1 (INV-C5)");

/* ---------------- live: play it ---------------- */

/* Declared before the skip below, not beside the counters it belongs with.
   report() reads `kinds`, and the skip path calls report() from here — with the
   declaration further down, that read landed in the temporal dead zone and the
   graceful "no browser, skipping" exit crashed instead. The one path that had
   to work without a browser was the one path that never could. */
const kinds = new Map();

let playwright = null;
try { playwright = await import(path.join(process.cwd(), "node_modules/playwright-core/index.mjs")); } catch {}
if (!playwright) {
  try { playwright = await import("playwright-core"); } catch {}
}

/* Ask playwright where its own chromium lives, rather than guessing. Wrapped
   because executablePath() throws outright when no browser has been downloaded,
   and "no browser here" is a skip, not a crash. */
if (playwright && !CHROME) {
  try {
    const p = playwright.chromium.executablePath();
    if (p && fs.existsSync(p)) CHROME = p;
  } catch {}
}

if (!playwright || !CHROME) {
  report(`skipped the live pass (${!playwright ? "playwright-core not installed" : "no chromium binary — npx playwright-core install chromium"})`);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = R(rel);
  if (!file.startsWith(R("")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/life-in-uk-cast.html`, { waitUntil: "networkidle" });

ok(await page.locator("#modes .mode").count() === 4, "four drill modes render");
ok(await page.locator("#castList .person").count() === 195, "the cast list renders all 195 welds");
ok(await page.locator("#gmeters .gm").count() === 17, "seventeen group meters render");
ok(await page.locator("#groupChips .chip").count() === 18, "eighteen scope chips render (All + 17)");

const MODES = ["roll", "weld", "duel", "cloze"];
const ROUNDS = 6;                      // 4 modes x 6 rounds x 12 questions = 288 live questions
let asked = 0, dupOpt = 0, emptyOpt = 0, tagLeak = 0, collide = 0, noRight = 0, autoAdvanced = 0, dwells = 0;
const DWELL_N = 12;

for (const mode of MODES) {
  for (let r = 0; r < ROUNDS; r++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(`#modes .mode[data-m="${mode}"]`).click();
    await page.locator("#opts .opt").first().waitFor();

    for (let q = 0; q < 12; q++) {
      const shot = await page.evaluate(() => {
        const opts = [...document.querySelectorAll("#opts .opt .txt")];
        return {
          kind: document.querySelector(".qkind").textContent,
          text: document.querySelector(".qtext").innerHTML,
          opts: opts.map((o) => o.innerHTML),
          count: document.querySelector(".qbar .cnt").textContent,
        };
      });
      asked++;
      kinds.set(shot.kind, (kinds.get(shot.kind) || 0) + 1);

      if (!strip(shot.text).trim()) emptyOpt++;
      if (shot.opts.some((o) => !strip(o).trim())) emptyOpt++;
      if (shot.opts.some((o) => /undefined|\[object|&lt;b&gt;/.test(o))) tagLeak++;
      const norm = shot.opts.map((o) => strip(o).toLowerCase().trim());
      if (new Set(norm).size !== norm.length) dupOpt++;

      await page.locator("#opts .opt").nth(q % shot.opts.length).click();
      await page.locator(".verdict").waitFor();
      if (await page.locator("#opts .opt.right").count() !== 1) noRight++;

      /* INV-C7, end to end. Only the answer matters: two *wrong* options that
         happen to collide with each other cost nothing, but a wrong option that
         collides with the key is defensibly right and marking it wrong teaches
         a fact the handbook does not assert. Run after the answer, because
         .opt.right is what names the key. */
      collide += await page.evaluate(() => {
        /* The duel is exempt by construction: pairing a figure with one that
           collides with it is the entire mode. It is held to a different bar —
           "decidable from the whole note" — asserted statically below. */
        if (/^Trap/.test(document.querySelector(".qkind").textContent)) return 0;
        const C = window.LITUK_CAST, S = (h) => String(h).replace(/<[^>]*>/g, "").toLowerCase().trim();
        const own = (t) => { const s = S(t); return C.people.find((p) => S(p.w) === s) || C.people.find((p) => S(p.n) === s) || null; };
        const nodes = [...document.querySelectorAll("#opts .opt")];
        const key = own(nodes.find((n) => n.classList.contains("right")).querySelector(".txt").innerHTML);
        if (!key) return 0;                             // group / cloze keys own no figure
        let n = 0;
        for (const node of nodes) {
          if (node.classList.contains("right")) continue;
          const o = own(node.querySelector(".txt").innerHTML);
          if (o && ((key.col || []).includes(o.i) || (key.sm || []).includes(o.i))) n++;
        }
        return n;
      });

      /* Nothing advances on its own any more: the verdict stays until Next is
         pressed. The auto-advance this replaces fired only on a *correct*
         answer and only after 900ms, so the check has to dwell on correct
         answers specifically — a sample of them, since waiting on all 288
         would add five minutes to the run for no more information. */
      const wasRight = await page.evaluate(() => {
        const n = [...document.querySelectorAll("#opts .opt")];
        return n.some((b) => b.classList.contains("right")) && !n.some((b) => b.classList.contains("wrong"));
      });
      if (wasRight && dwells < DWELL_N) {
        dwells++;
        await page.waitForTimeout(1100);
        if (await page.locator(".verdict").count() !== 1) autoAdvanced++;
        if (await page.evaluate(() => document.querySelector(".qbar .cnt").textContent) !== shot.count) autoAdvanced++;
      }

      /* The card is taller than the viewport, so click through the DOM. */
      await page.evaluate(() => document.getElementById("next").click());
      await page.waitForFunction((prev) => {
        if (document.querySelector(".result")) return true;
        const c = document.querySelector(".qbar .cnt");
        return !!c && c.textContent !== prev;
      }, shot.count, { polling: 100, timeout: 15000 });
    }
    await page.locator(".result .score").waitFor();
    await page.locator("#done").click();
    await page.locator("#modes .mode").first().waitFor();
  }
}

ok(asked === MODES.length * ROUNDS * 12, `expected ${MODES.length * ROUNDS * 12} questions, played ${asked}`);
ok(dupOpt === 0, `${dupOpt} question(s) rendered the same option twice`);
ok(emptyOpt === 0, `${emptyOpt} question(s) rendered an empty prompt or option`);
ok(tagLeak === 0, `${tagLeak} question(s) leaked markup or an undefined into an option`);
ok(noRight === 0, `${noRight} answered question(s) did not mark exactly one right option`);
ok(autoAdvanced === 0, `${autoAdvanced} question(s) moved on by themselves instead of waiting for Next`);
ok(dwells >= 8, `only ${dwells} correct answers were dwelled on — the no-auto-advance check is close to vacuous`);
ok(collide === 0, `${collide} option set(s) offered a figure whose own fact would also be right (INV-C7)`);
ok(kinds.size >= 6, `expected every question type to appear, saw ${kinds.size}: ${[...kinds.keys()].join(", ")}`);

/* ---------------- navigation ----------------
   Going back has to show what you answered, not a blank question, and it must
   not bank the answer twice. */
await page.locator('#modes .mode[data-m="weld"]').click();
await page.locator("#opts .opt").first().waitFor();

const answeredBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("lituk_cast_v1")).n.ans);
const first = await page.evaluate(() => document.querySelector(".qtext").innerHTML);
await page.locator("#opts .opt").first().click();
await page.locator(".verdict").waitFor();
const firstVerdict = await page.evaluate(() => document.querySelector(".verdict .nm").textContent);

ok(await page.locator("#prev[disabled]").count() === 1, "Prev is disabled on the first question");
await page.evaluate(() => document.getElementById("next").click());
await page.locator("#opts .opt").first().waitFor();
ok(await page.evaluate(() => document.querySelector(".qbar .cnt").textContent) === "2 / 12", "Next advances to question 2");
ok(await page.locator(".verdict").count() === 0, "an unanswered question shows no verdict");
ok(await page.locator("#next").count() === 1, "an unanswered question still offers a forward move");

await page.evaluate(() => document.getElementById("prev").click());
await page.locator("#opts .opt").first().waitFor();
ok(await page.evaluate(() => document.querySelector(".qtext").innerHTML) === first, "Prev returns to the same question");
ok(await page.locator(".verdict").count() === 1, "a revisited answered question shows its verdict again");
ok(await page.evaluate(() => document.querySelector(".verdict .nm").textContent) === firstVerdict, "the revisited verdict names the same figure");
ok(await page.locator("#opts .opt.right").count() === 1, "a revisited question still marks the right option");
ok(await page.locator("#opts .opt:not([disabled])").count() === 0, "a revisited question cannot be re-answered");

/* Re-answering a revisited question must not bank a second answer. */
await page.evaluate(() => document.querySelector("#opts .opt").click());
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("lituk_cast_v1")).n.ans) === answeredBefore + 1,
  "revisiting a question banked the answer twice");

/* Swipe: left is forward, right is back, and the thresholds are the practice
   page's. A short or steep drag must not move anything. */
async function swipe(dx, dy) {
  const box = await page.locator(".qcard").boundingBox();
  const x = box.x + box.width / 2, y = box.y + 40;
  await page.evaluate(({ x, y, dx, dy }) => {
    const st = document.getElementById("stage");
    const t = (cx, cy) => [new Touch({ identifier: 1, target: st, clientX: cx, clientY: cy })];
    st.dispatchEvent(new TouchEvent("touchstart", { touches: t(x, y), changedTouches: t(x, y), bubbles: true }));
    st.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: t(x + dx, y + dy), bubbles: true }));
  }, { x, y, dx, dy });
}
const at = () => page.evaluate(() => document.querySelector(".qbar .cnt").textContent);
ok(await at() === "1 / 12", "swipe pass starts on question 1");
await swipe(-120, 5);
ok(await at() === "2 / 12", "a left swipe moves forward");
await swipe(120, 5);
ok(await at() === "1 / 12", "a right swipe moves back");
await swipe(-30, 0);
ok(await at() === "1 / 12", "a swipe under 60px does not move");
await swipe(-120, 100);
ok(await at() === "1 / 12", "a steep drag scrolls rather than moving");

await page.locator("#qClose").click();
page.once("dialog", (d) => d.accept());
await page.locator("#modes .mode").first().waitFor();

/* Progress has to survive a reload — it is the only copy. */
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("lituk_cast_v1")).n.ans);
await page.reload({ waitUntil: "networkidle" });
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("lituk_cast_v1")).n.ans);
ok(before === after && after > 0, `answered count did not survive a reload (${before} → ${after})`);
ok(await page.evaluate(() => localStorage.getItem("lituk_v1")) === null, "the cast page created a lituk_v1 (INV-C4/C5)");
ok(errors.length === 0, `page errors: ${errors.slice(0, 3).join(" | ")}`);

await browser.close();
server.close();
report(`${asked} live questions played across ${MODES.length} modes`);

function report(note) {
  if (fails.length) {
    console.error(`\n${fails.length} of ${checks} checks failed:\n`);
    for (const f of fails) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${checks} checks pass.`);
  console.log(note);
  if (kinds.size) console.log("question types seen: " + [...kinds.entries()].map(([k, n]) => `${k} ×${n}`).join(" · "));
  process.exit(0);
}
