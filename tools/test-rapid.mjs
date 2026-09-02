#!/usr/bin/env node
/**
 * Guards rapid mode: the pick is the answer, and a right answer moves on.
 *
 *   node tools/test-rapid.mjs
 *
 * Rapid deletes two of the three taps a question used to cost. That is worth
 * the 180 taps a 60-question drill was charging for 60 answers, and it is worth
 * a test, because everything it deletes was also a place to change your mind.
 *
 * Four of those places must survive, and none of them is visible from reading
 * the diff:
 *
 *   A "select two" must still ask you to check. Getting the first of the two
 *   wrong is ordinary, and the fix is to deselect it — a tap that no longer
 *   exists if the second pick has already graded you.
 *
 *   A session with feedback held to the end must never be rapid. That is the
 *   load-bearing one, and it is the whole of exam realism: `feedback:'end'` is
 *   what the real test is, and rapid has nothing to fold into it. Timed sits
 *   are deliberately NOT excluded any more — a timed test showing you the
 *   answer after every question was never the real exam either, and the app
 *   already prices it that way — so this assertion is the only thing standing
 *   between the fast mode and the one session that has to be slow.
 *
 *   The recall fold must still get its honesty tap first. "Did you have it?"
 *   answered after the tick is on screen is not the question it asked.
 *
 *   And the scoring has to be untouched. A rapid answer takes the same road
 *   through recordAnswer() and srUpdate() as a checked one — if it ever stops
 *   doing that, the fast mode is quietly teaching the schedule something the
 *   slow mode is not, and the readiness number stops meaning one thing.
 *
 * The live pass is here because the timing half cannot be tested any other way.
 * setTimeout is a stub in the node pass, so the advance never fires and the
 * cancel listeners never run — and the cancel listeners are the whole reason
 * this mode is safe to leave switched on.
 *
 * One case exists only because timed sits joined: an advance armed at 44:59
 * would fire 600ms into the time's-up modal and move the question underneath a
 * dialogue asking you to decide something. stopTimer() does not cover it — the
 * timer and the advance are two different clocks.
 */
import fs from "node:fs";
import vm from "node:vm";
import http from "node:http";
import path from "node:path";
import { R, BANK_FILES } from "./lib/banks.mjs";

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const notes = [];
const report = (m) => notes.push(m);

const html = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>\s*<\/body>/);
if (!m) { console.error("test-rapid: could not find the engine <script>"); process.exit(1); }
const engineSrc = m[1];

/* Same stand-in DOM the recall test uses. setTimeout returns 0 and never fires,
   which is exactly right here: this pass is about what rapid DECIDES, and the
   live pass below is about what it then does with a clock. */
function stubDom(store) {
  const els = {};
  const el = () => ({
    textContent: "", innerHTML: "", value: "", hidden: false, disabled: false,
    style: { setProperty() {} }, dataset: {}, className: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, remove() {}, insertAdjacentHTML() {}, setAttribute() {},
    getAttribute: () => null, addEventListener() {}, focus() {}, scrollIntoView() {},
    querySelectorAll: () => [], querySelector: () => null, click() {},
  });
  const doc = {
    getElementById: (id) => (els[id] || (els[id] = el())),
    createElement: () => el(), querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, documentElement: { setAttribute() {}, getAttribute: () => "light" },
    body: el(), head: el(),
  };
  const ctx = {
    document: doc,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, scrollTo() {}, print() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    location: { hash: "", reload() {} },
    URL: { createObjectURL: () => "blob:stub", revokeObjectURL() {} },
    Blob: class { constructor(parts) { this.parts = parts } },
    navigator: { userAgent: "node", platform: "Linux", maxTouchPoints: 0 },
    structuredClone, JSON, Math, Date, Object, Array, String, Number, Boolean,
    Set, Map, RegExp, Error, isNaN, parseInt, parseFloat,
    LitUK: { toggleTheme() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  return ctx;
}

const BRIDGE = `globalThis.__api={
  get S(){return S}, get prefs(){return prefs}, get sess(){return sess}, set sess(v){sess=v},
  POOL, QByG, UNIQUE_N, ADV_MS,
  rapidOn, rapidPick, shouldAdvance, pick, checkQ, makeSession, recallable,
  revealOpts, recallSay, correctIdx, canon, slimSess, hydrate, srUpdate, save, savePrefs,
  advArmed, armAdvance, cancelAdvance, expiredPrompt
}`;

function boot(store = {}) {
  const ctx = vm.createContext(stubDom(store));
  for (const f of BANK_FILES) vm.runInContext(fs.readFileSync(R(f), "utf8"), ctx, { filename: f });
  vm.runInContext(engineSrc, ctx, { filename: "life-in-uk-mock-tests.html" });
  vm.runInContext(BRIDGE, ctx, { filename: "bridge" });
  return ctx.__api;
}

const app = boot();
const { POOL } = app;
const single = POOL.filter((q) => app.correctIdx(q).length === 1);
const multi = POOL.filter((q) => app.correctIdx(q).length > 1);
const wrongOf = (q) => q.o.map((_, i) => i).find((i) => !app.correctIdx(q).includes(i));

/* ================= 1. where rapid switches on ================= */
{
  app.prefs.rapid = true;
  ok(app.rapidOn(true), "a session with feedback on must be rapid");
  ok(!app.rapidOn(false), "feedback held to the end has no check to fold in and no verdict to move off");
  app.prefs.rapid = false;
  ok(!app.rapidOn(true), "the setting off must mean off");
  app.prefs.rapid = true;
}

/* ================= 2. it is fixed when the session is made ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";
  app.makeSession(single.slice(0, 3), { title: "Drill", timed: false, source: "drill" });
  ok(app.sess.rapid, "an untimed drill did not come out rapid");
  app.prefs.rapid = false;                      // changed mid-session
  ok(app.sess.rapid, "turning the setting off changed the rules of a session already in progress");
  app.prefs.rapid = true;

  /* A timed test follows the feedback setting, like everything else. */
  app.prefs.feedback = "instant";
  app.makeSession(single.slice(0, 3), { title: "Test 1", timed: true, testN: 1, source: "test" });
  ok(app.sess.rapid, "a timed test with feedback on did not come out rapid");

  /* And the one that must never be. Holding feedback to the end is how you sit
     the real thing, and it switches rapid off without being asked to. */
  app.prefs.feedback = "end";
  app.makeSession(single.slice(0, 3), { title: "Test 1", timed: true, testN: 1, source: "test" });
  ok(!app.sess.rapid, "an exam-mode timed sit came out rapid — that is the session that has to be the real exam");
  app.makeSession(single.slice(0, 3), { title: "Drill", timed: false, source: "drill" });
  ok(!app.sess.rapid, "an untimed exam-mode session came out rapid");
  app.prefs.feedback = "instant";
}

/* ============= 2b. a timed sit answers on the pick, like anything else ============= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";
  const q = single[0];
  app.makeSession([q, single[1]], { title: "Test 1", timed: true, testN: 1, source: "test", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  ok(app.sess.items[0].checked, "a timed test still charged a tap for the check");
  ok(app.shouldAdvance(app.sess.items[0]), "a right answer in a timed test did not arm the advance");
}

/* ============= 2c. time's up must not move the question under the modal ============= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";
  const q = single[0];
  app.makeSession([q, single[1]], { title: "Test 1", timed: true, testN: 1, source: "test", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  ok(app.advArmed(), "setup: the advance was not armed, so this case proves nothing");
  app.expiredPrompt();
  ok(!app.advArmed(), "the time's-up modal left an advance armed — it would move the question under a dialogue asking you to decide something");
}

/* ================= 3. the pick is the answer — and when it is not ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";

  const q = single[0];
  app.makeSession([q, single[1]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  const it = app.sess.items[0];
  app.pick(app.correctIdx(q)[0]);
  ok(it.checked, "a single-answer pick did not check itself — that is the whole mode");
  ok(it._correct, "the seeded right answer did not come back right");

  /* A select-two keeps its check button. */
  const mq = multi[0];
  app.makeSession([mq, single[0]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  const mi = app.sess.items[0];
  const ci = app.correctIdx(mq);
  app.pick(ci[0]);
  ok(!mi.checked, "a select-two graded itself on the first pick");
  app.pick(ci[1]);
  ok(!mi.checked, "a select-two graded itself on the last pick — deselecting a wrong first pick is the tap that buys");
  app.checkQ();
  ok(mi.checked && mi._correct, "the select-two would not grade even when asked");

  /* Steady mode leaves the pick a pick. */
  app.prefs.rapid = false;
  app.makeSession([single[2], single[3]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(app.correctIdx(single[2])[0]);
  ok(!app.sess.items[0].checked, "steady mode still graded on the pick");
  app.prefs.rapid = true;
}

/* ================= 4. the recall fold still gets its honesty tap ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "all";
  const q = single.find((x) => app.recallable(x));
  app.makeSession([q, single[0]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  const it = app.sess.items[0];
  ok(app.sess.recall, "the fold did not switch on — this case is not testing what it claims");
  app.revealOpts();
  app.pick(app.correctIdx(q)[0]);
  ok(!it.checked, '"Did you have it?" was skipped — answering it with the tick on screen is not the question it asked');
  app.recallSay(1);
  ok(it.checked, "answering the honesty question did not finish the pick that was already waiting on it");
  app.prefs.recall = "off";
}

/* ================= 5. what may advance itself ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";
  const q = single[0], q2 = single[1];

  app.makeSession([q, q2], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  ok(app.shouldAdvance(app.sess.items[0]), "a right answer with a question after it did not arm the advance");

  app.makeSession([q, q2], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(wrongOf(q));
  ok(!app.shouldAdvance(app.sess.items[0]), "a WRONG answer armed the advance — that explanation is the one worth stopping for");

  app.makeSession([q], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  ok(!app.shouldAdvance(app.sess.items[0]), "the last question armed the advance — finishing stays an aimed tap");

  app.makeSession([q, q2], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  app.sess.items[0].unsure = true;
  ok(!app.shouldAdvance(app.sess.items[0]), "a right answer marked a guess still armed the advance");

  app.prefs.rapid = false;
  app.makeSession([q, q2], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.sess.items[0].picked = [app.correctIdx(q)[0]];
  app.checkQ();
  ok(!app.shouldAdvance(app.sess.items[0]), "steady mode armed an advance");
  app.prefs.rapid = true;
}

/* ================= 6. scoring is the same road ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant"; app.prefs.recall = "off";
  const q = single.find((x) => app.correctIdx(x).length === 1 && !app.S.sr[app.canon(x.g)]);
  const g = app.canon(q.g);

  app.S.sr[g] = { box: 2, due: 0, seen: 3, last: Date.now() - 5 * 864e5 };
  delete app.S.mistakes[g];
  app.makeSession([q, single[0]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(app.correctIdx(q)[0]);
  eq(app.S.sr[g].box, 3, "a rapid right answer did not promote the way a checked one does");

  app.S.sr[g] = { box: 2, due: 0, seen: 3, last: Date.now() - 5 * 864e5 };
  delete app.S.mistakes[g];
  app.makeSession([q, single[0]], { title: "Drill", timed: false, source: "drill", order: "keep" });
  app.pick(wrongOf(q));
  eq(app.S.sr[g].box, 0, "a rapid wrong answer did not zero the box the way a checked one does");
  ok(app.S.mistakes[g] && app.S.mistakes[g].count === 1, "a rapid wrong answer did not land on the mistakes list");
}

/* ================= 7. a session stored before rapid existed ================= */
{
  app.prefs.rapid = true; app.prefs.feedback = "instant";
  app.makeSession(single.slice(0, 3), { title: "Drill", timed: false, source: "drill" });
  const slim = app.slimSess(app.sess);
  ok(slim.rapid === true, "rapid was not carried into the stored session");
  ok(app.hydrate(slim).rapid === true, "rapid did not survive the round trip");

  delete slim.rapid;                              // a session written by the old build
  ok(app.hydrate(slim) !== null, "an older stored session stopped resuming");
  ok(app.hydrate(slim).rapid === false, "an older stored session silently acquired rapid halfway through");
}

/* ================= 8. the live pass — the clock, and the cancel ================= */
let CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome"].find((p) => fs.existsSync(p));
let playwright = null;
try { playwright = await import(path.join(process.cwd(), "node_modules/playwright-core/index.mjs")); } catch {}
if (!playwright) { try { playwright = await import("playwright-core"); } catch {} }
if (playwright && !CHROME) {
  try { const p = playwright.chromium.executablePath(); if (p && fs.existsSync(p)) CHROME = p; } catch {}
}

if (!playwright || !CHROME) {
  report(`skipped the live pass (${!playwright ? "playwright-core not installed" : "no chromium binary — npx playwright-core install chromium"})`);
} else {
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
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (mm) => { if (mm.type() === "error") errors.push(mm.text()); });
  await page.goto(`${base}/life-in-uk-mock-tests.html`, { waitUntil: "networkidle" });

  const ADV = await page.evaluate(() => ADV_MS);
  /* Comfortably past the advance, so a pass here means it really did not fire
     rather than that the test looked too early. */
  const PAST = ADV + 350;

  /* Four single-answer questions, unshuffled, rapid on. order:'keep' so the
     question the assertions talk about is the question on screen. */
  const startRapid = (n = 4) => page.evaluate((n) => {
    prefs.rapid = true; prefs.feedback = "instant"; prefs.recall = "off";
    prefs.shufQ = false; prefs.shufO = false; prefs.rapidSeen = 9; savePrefs();
    const qs = POOL.filter((q) => correctIdx(q).length === 1).slice(0, n);
    makeSession(qs, { title: "Rapid", timed: false, source: "drill", order: "keep" });
  }, n);
  /* Which option on screen is the right one, after the shuffle that isn't. */
  const posOf = (right) => page.evaluate((right) => {
    const it = sess.items[sess.idx], ci = correctIdx(it.q);
    return right ? it.order.indexOf(ci[0]) : it.order.findIndex((oi) => !ci.includes(oi));
  }, right);
  const idx = () => page.evaluate(() => sess.idx);

  /* --- one tap answers it --- */
  await startRapid();
  await page.locator("#opts .opt").first().waitFor();
  ok(await page.locator("#mainBtn").textContent() === "Check answer", "the check button is not where the tap count is being measured from");
  await page.locator("#opts .opt").nth(await posOf(true)).click();
  ok(await page.locator(".explain.show").count() === 1, "one tap did not produce a verdict");
  ok(await page.locator(".advbar").count() === 1, "a right answer showed no countdown — the advance has to be something you can see coming");

  /* --- and then leaves by itself --- */
  await page.waitForTimeout(PAST);
  eq(await idx(), 1, "a right answer did not move on by itself");

  /* --- a wrong one stays --- */
  await startRapid();
  await page.locator("#opts .opt").first().waitFor();
  await page.locator("#opts .opt").nth(await posOf(false)).click();
  ok(await page.locator(".explain.show").count() === 1, "a wrong answer showed no explanation");
  ok(await page.locator(".advbar").count() === 0, "a wrong answer armed a countdown");
  await page.waitForTimeout(PAST);
  eq(await idx(), 0, "a wrong answer moved on by itself — that is the one explanation the mode exists to stop at");

  /* --- touching the screen keeps the question --- */
  await startRapid();
  await page.locator("#opts .opt").first().waitFor();
  await page.locator("#opts .opt").nth(await posOf(true)).click();
  await page.locator(".qtext").click();
  ok(await page.locator(".advbar").count() === 0, "the countdown was still on screen after a touch cancelled it");
  await page.waitForTimeout(PAST);
  eq(await idx(), 0, "touching the screen did not stop the advance — the mode is not safe to leave on without this");
  ok(await page.locator(".explain.show").count() === 1, "the explanation went with the countdown");

  /* --- and the one that got away is one swipe back --- */
  await startRapid();
  await page.locator("#opts .opt").first().waitFor();
  await page.locator("#opts .opt").nth(await posOf(true)).click();
  await page.waitForTimeout(PAST);
  eq(await idx(), 1, "setup for the swipe-back case did not advance");
  await page.evaluate(() => prevQ());
  eq(await idx(), 0, "going back did not go back");
  ok(await page.locator(".explain.show").count() === 1, "the question you swiped back to lost its explanation — that is the only way to re-read one");

  /* --- a select-two still asks --- */
  await page.evaluate(() => {
    prefs.rapid = true; prefs.feedback = "instant"; prefs.recall = "off";
    prefs.shufQ = false; prefs.shufO = false; savePrefs();
    const qs = POOL.filter((q) => correctIdx(q).length > 1).slice(0, 2);
    makeSession(qs, { title: "Rapid", timed: false, source: "drill", order: "keep" });
  });
  await page.locator("#opts .opt").first().waitFor();
  const two = await page.evaluate(() => correctIdx(sess.items[0].q).map((c) => sess.items[0].order.indexOf(c)));
  await page.locator("#opts .opt").nth(two[0]).click();
  await page.locator("#opts .opt").nth(two[1]).click();
  ok(await page.locator(".explain.show").count() === 0, "a select-two graded itself in the browser");
  ok(await page.locator("#mainBtn").textContent() === "Check answer", "a select-two lost the check button it still needs");

  /* --- steady mode is still there --- */
  await page.evaluate(() => {
    prefs.rapid = false; prefs.feedback = "instant"; prefs.recall = "off";
    prefs.shufQ = false; prefs.shufO = false; savePrefs();
    makeSession(POOL.filter((q) => correctIdx(q).length === 1).slice(0, 3),
      { title: "Steady", timed: false, source: "drill", order: "keep" });
  });
  await page.locator("#opts .opt").first().waitFor();
  await page.locator("#opts .opt").nth(await posOf(true)).click();
  ok(await page.locator(".explain.show").count() === 0, "steady mode graded on the pick");
  await page.locator("#mainBtn").click();
  ok(await page.locator(".explain.show").count() === 1, "steady mode would not grade when asked");
  await page.waitForTimeout(PAST);
  eq(await idx(), 0, "steady mode advanced by itself");

  ok(errors.length === 0, `the page logged errors: ${errors.slice(0, 3).join(" | ")}`);
  report(`live pass ran against chromium at ${ADV}ms`);

  await browser.close();
  server.close();
}

/* ---------------- report ---------------- */
if (fails.length) {
  console.error(`\n${fails.length} of ${checks} checks failed:\n`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`Rapid mode: ${checks} checks pass.`);
console.log(`  ${single.length} of ${POOL.length} questions answer on the pick; ${multi.length} still ask you to check.`);
for (const n of notes) console.log(`  ${n}`);
