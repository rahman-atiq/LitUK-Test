#!/usr/bin/env node
/**
 * Guards the recall fold: options hidden, answer attempted from memory first.
 *
 *   node tools/test-recall.mjs
 *
 * Three things here are worth a test rather than a careful read.
 *
 * The first is WHICH questions the fold is offered on. Getting that wrong is not
 * a cosmetic bug: offer it on "Which of these statements is correct?" and the
 * reader meets a screen with no question on it, opens the options without
 * reading, and within a day the fold is furniture they tap through.
 *
 * The second is that it never appears in a timed sit. The real exam is multiple
 * choice against a clock, and a timed test that is not the real exam is not
 * worth sitting.
 *
 * The third is the scoring path. A right answer you could not recall is routed
 * into the same "Wasn't sure" machinery rather than a new one beside it — which
 * is only safe if it really is the same machinery, doing the same four things:
 * box restored, credited day taken back off, onto the mistakes list, due
 * tomorrow. If that drifts apart, a recall miss quietly becomes a promotion.
 */
import fs from "node:fs";
import vm from "node:vm";
import { R, BANK_FILES } from "./lib/banks.mjs";

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const html = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>\s*<\/body>/);
if (!m) { console.error("test-recall: could not find the engine <script>"); process.exit(1); }
const engineSrc = m[1];

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
  POOL, QByG, TESTS, UNIQUE_N, RECALL_N, RECALL_WEAK, FINAL_AT,
  recallable, recallOn, recallHidden, recallAsking, revealOpts, recallSay,
  makeSession, checkQ, applyUnsure, correctIdx, canon, slimSess, hydrate,
  dayKey, save, savePrefs, drillMode, daysLeft
}`;

function boot(store = {}) {
  const ctx = vm.createContext(stubDom(store));
  for (const f of BANK_FILES) vm.runInContext(fs.readFileSync(R(f), "utf8"), ctx, { filename: f });
  vm.runInContext(engineSrc, ctx, { filename: "life-in-uk-mock-tests.html" });
  vm.runInContext(BRIDGE, ctx, { filename: "bridge" });
  return ctx.__api;
}

const app = boot();
const { POOL, QByG } = app;

/* ================= 1. which questions can be asked from the stem ================= */
{
  const fake = (t, opts) => ({ t, o: opts.map((x) => [x, false]) });

  ok(!app.recallable(fake("Which of these statements is correct?", ["A long statement", "Another long statement"])),
    'a "which of these statements is correct" stem must not get the fold — there is no question left without the options');
  ok(!app.recallable(fake("Which of these statements is incorrect?", ["x", "y"])),
    "the negated form of the same stem must not get it either");
  ok(!app.recallable(fake("The UK has a written constitution.", ["True", "False"])),
    "a literal true/false must not get the fold — hiding True and False tells you nothing");
  ok(!app.recallable(fake("Some claim.", ["true", "FALSE"])),
    "true/false detection must not be case-sensitive");
  ok(app.recallable(fake("In which year did the Habeas Corpus Act become law?", ["1215", "1679", "1689", "1707"])),
    "a real interrogative stem must get the fold");
  ok(app.recallable(fake("Which TWO countries took part in the Battle of Agincourt?", ["a", "b", "c", "d"])),
    "a select-two with a real stem must get the fold — it is the best material for this, not the worst");

  /* The share, measured against the live bank rather than asserted from memory.
     Bands, not a fixed number: the bank grows, and a new source shifting this a
     point is not a regression. A collapse is. */
  const share = app.RECALL_N / POOL.length;
  ok(share > 0.7 && share < 0.9,
    `${app.RECALL_N} of ${POOL.length} questions (${Math.round(share * 100)}%) can be asked from the stem — expected 70-90%. Outside that band the classifier has broken, not the bank.`);

  /* Nothing in the dead classes may have slipped through, and vice versa. */
  const deadWithFold = POOL.filter((q) => app.recallable(q) &&
    /^\s*which (of these |of the following )?statements? (is|are)/i.test(q.t)).length;
  eq(deadWithFold, 0, "content-free stems that were still offered the fold");
  const tfWithFold = POOL.filter((q) => app.recallable(q) &&
    q.o.length === 2 && q.o.every((o) => /^(true|false)$/i.test(String(o[0]).trim()))).length;
  eq(tfWithFold, 0, "literal true/false questions that were still offered the fold");
}

/* ================= 2. where it switches on ================= */
{
  app.prefs.recall = "weak";
  for (const src of [...app.RECALL_WEAK]) {
    ok(app.recallOn(src, false), `recall should be on for "${src}" at the default setting — that is the whole point of the default`);
    ok(!app.recallOn(src, true), `recall must be OFF for a TIMED "${src}" — a timed sit has to be the real exam`);
  }
  for (const src of ["drill", "sweep", "test", "random", "topic", "twist", "dates", "examq"]) {
    ok(!app.recallOn(src, false), `recall should be off for "${src}" at the default setting — coverage is what the sprint is short of`);
  }

  app.prefs.recall = "all";
  ok(app.recallOn("sweep", false), '"all" should reach an untimed sweep');
  ok(!app.recallOn("test", true), '"all" must still not reach a timed test');

  app.prefs.recall = "off";
  for (const src of [...app.RECALL_WEAK, "drill", "sweep"]) {
    ok(!app.recallOn(src, false), `"off" must mean off, including for "${src}"`);
  }
  app.prefs.recall = "weak";
}

/* ================= 3. a session carries the decision ================= */
{
  const qs = POOL.filter(app.recallable).slice(0, 6);
  app.makeSession(qs, { title: "Mistake set 1 of 1", timed: false, source: "mset" });
  ok(app.sess && app.sess.recall === true, "a mistake set did not start with the fold on");
  const it = app.sess.items[0];
  ok(app.recallHidden(it), "the first question of a mistake set should open folded");
  ok(!app.recallAsking(it), "the honesty row must not show before the options are open");

  app.revealOpts();
  ok(!app.recallHidden(app.sess.items[0]), "revealOpts() did not open the options");
  ok(app.recallAsking(app.sess.items[0]), "the honesty row should appear once the options are open");

  /* Fixed at the start, not re-read per question: changing the setting mid
     session must not fold question 4 of a session that never folded 1-3. */
  app.prefs.recall = "off";
  ok(app.sess.recall === true, "changing the setting mid-session changed the running session");
  app.prefs.recall = "weak";

  app.makeSession(POOL.slice(0, 4), { title: "Test 1", timed: true, testN: 1, source: "test" });
  ok(app.sess.recall === false, "a timed test started with the fold on");
  ok(!app.recallHidden(app.sess.items[0]), "a timed test folded a question away");
}

/* ================= 4. it survives a reload ================= */
{
  const qs = POOL.filter(app.recallable).slice(10, 14);
  app.makeSession(qs, { title: "Ever wrong", timed: false, source: "hset" });
  app.revealOpts();
  app.recallSay(0);                       // "didn't have it"
  const slim = JSON.parse(JSON.stringify(app.slimSess(app.sess)));
  ok(slim.recall === true, "the session's fold mode was not written to the store");
  eq(slim.items[0].sh, 1, "the opened-options flag was not written to the store");
  eq(slim.items[0].rc, "miss", "the owned-up miss was not written to the store");

  const back = app.hydrate(slim);
  ok(back && back.recall === true, "the fold mode did not come back from the store");
  ok(back && back.items[0].shown === true, "a resumed session would fold options you had already opened");
  eq(back && back.items[0].recall, "miss", "a resumed session would ask about a miss you already owned up to");
}

/* ================= 5. a recall miss is scored as a guess ================= */
{
  /* A question with real history: seen, promoted, sitting in a box above zero.
     That is the only state in which the routing is visible — from box 0 a
     restore and a promotion look the same. */
  const q = POOL.filter(app.recallable).find((x) => app.correctIdx(x).length === 1);
  const g = app.canon(q.g);
  app.S.sr[g] = { box: 3, due: 0, seen: 5, last: Date.now() - 5 * 864e5 };
  delete app.S.mistakes[g];

  app.makeSession([q], { title: "Mistake practice", timed: false, source: "mistakes" });
  app.revealOpts();
  app.recallSay(0);                                  // could not recall it
  app.sess.items[0].picked = app.correctIdx(q).slice();
  app.checkQ();

  const it = app.sess.items[0];
  ok(it._correct, "the seeded answer was not the correct one — the test is not testing what it claims");
  ok(it.unsure === true, "a right answer that could not be recalled was not routed into the guess path");
  const e = app.S.sr[g], mis = app.S.mistakes[g];
  eq(e.box, 3, "the box was not left where it was — a recall miss must not promote, and must not zero it either");
  ok((e.unsure || 0) >= 1, "the guess was not counted against the readiness model");
  ok(mis && !mis.done, "the question did not land on the mistakes list");
  ok(mis && !(mis.ok || []).includes(app.dayKey()), "the day it just banked was not taken back off — it would count towards clearing");
  ok(e.due <= Date.now() + 2 * 864e5, "it is not coming back promptly");
}

/* ================= 6. a recall HIT changes nothing ================= */
{
  const q = POOL.filter(app.recallable).find((x) => app.correctIdx(x).length === 1 && !app.S.sr[app.canon(x.g)]);
  const g = app.canon(q.g);
  app.S.sr[g] = { box: 2, due: 0, seen: 3, last: Date.now() - 5 * 864e5 };
  delete app.S.mistakes[g];

  app.makeSession([q], { title: "Mistake practice", timed: false, source: "mistakes" });
  app.revealOpts();
  app.recallSay(1);                                  // had it
  app.sess.items[0].picked = app.correctIdx(q).slice();
  app.checkQ();

  ok(!app.sess.items[0].unsure, "saying you had it still marked the question as a guess");
  eq(app.S.sr[g].box, 3, "a recalled right answer did not promote normally");
}

/* ================= 7. a recall miss on a WRONG answer adds nothing ================= */
{
  const q = POOL.filter(app.recallable).find((x) => app.correctIdx(x).length === 1 && !app.S.sr[app.canon(x.g)]);
  const g = app.canon(q.g);
  delete app.S.mistakes[g];

  app.makeSession([q], { title: "Mistake practice", timed: false, source: "mistakes" });
  app.revealOpts();
  app.recallSay(0);
  const wrong = q.o.map((_, i) => i).find((i) => !app.correctIdx(q).includes(i));
  app.sess.items[0].picked = [wrong];
  app.checkQ();

  ok(!app.sess.items[0]._correct, "the seeded wrong answer was not wrong");
  ok(!app.sess.items[0].unsure, "a wrong answer was also marked a guess — it is already a miss and needs no help");
  const mis = app.S.mistakes[g];
  ok(mis && (mis.count || 0) === 1, `a plain miss should count once, got ${mis && mis.count}`);
  ok(!(mis.unsure > 0), "a wrong answer was counted as a guess as well as a miss — it would be double-scored");
}

/* ---------------- report ---------------- */
if (fails.length) {
  console.error(`\n${fails.length} of ${checks} checks failed:\n`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`Recall fold: ${checks} checks pass.`);
console.log(`  ${app.RECALL_N} of ${POOL.length} questions can be asked from the stem alone.`);
