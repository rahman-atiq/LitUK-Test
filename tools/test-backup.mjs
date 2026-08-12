#!/usr/bin/env node
/**
 * The restore test. Runs the real backup/restore code out of
 * life-in-uk-mock-tests.html against a stub DOM, with a stub localStorage that
 * survives a simulated reload.
 *
 *   node tools/test-backup.mjs
 *
 * An untested backup is not a backup. The failure this exists to catch is
 * silent and total: you export before changing phone, the file turns out to be
 * unreadable or a field short, and the 25 days of progress it was insurance for
 * are already gone by the time you find out. There is no second copy.
 *
 * What it cannot do is prove YOUR phone exported a good file — that needs a
 * real export off a real device. It proves the code is sound; you still have to
 * pull the file and put it back once. See the note at the end of the run.
 */
import fs from "node:fs";
import vm from "node:vm";
import { R, BANK_FILES } from "./lib/banks.mjs";

const LS_KEY = "lituk_v1";
/* readiness is a cache, recomputed by renderDashboard on every load, so it
   never compares equal across a reload and never should. */
const stable = (s) => JSON.stringify({ ...s, readiness: null });

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

/* ---------------- the engine, in a box ----------------
   Only the inline script matters: the two bank files are loaded the way the
   browser loads them, and app.js only supplies the theme toggle. Extracting by
   marker rather than by counting <script> tags, so adding one to the head does
   not silently start testing the wrong code. */
const html = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>\s*<\/body>/);
if (!m) {
  console.error("test-backup: could not find the engine <script> in life-in-uk-mock-tests.html");
  process.exit(1);
}
const engineSrc = m[1];

/** A DOM that answers every question the engine asks and remembers nothing. */
function stubDom(store, log) {
  const els = {};
  const el = () => {
    const e = {
      textContent: "", innerHTML: "", value: "", hidden: false, disabled: false,
      style: {}, dataset: {}, files: null, type: "", accept: "", className: "",
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild() {}, removeChild() {}, remove() {}, insertAdjacentHTML() {},
      setAttribute() {}, getAttribute: () => null, addEventListener() {},
      focus() {}, scrollIntoView() {}, querySelectorAll: () => [],
      querySelector: () => null, click() { log.push("click:" + (e.download || e.type)) },
    };
    return e;
  };
  const doc = {
    /* Same node for the same id, so what toast() wrote is still there to read. */
    getElementById: (id) => (els[id] || (els[id] = el())),
    createElement: () => el(),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    documentElement: { setAttribute() {}, getAttribute: () => "light" },
    body: el(),
    head: el(),
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = {
    document: doc, localStorage, console,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, scrollTo() {}, print() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    location: { hash: "", reload: () => log.push("reload") },
    URL: { createObjectURL: (b) => { log.push(b); return "blob:stub" }, revokeObjectURL() {} },
    Blob: class { constructor(parts) { this.parts = parts } },
    /* Synchronous stand-in: the file's text rides on the stub File itself. */
    FileReader: class {
      readAsText(f) { this.result = f._text; try { this.onload() } catch (e) { log.push("onload threw: " + e.message) } }
    },
    structuredClone, JSON, Math, Date, Object, Array, String, Number, Boolean,
    Set, Map, RegExp, Error, isNaN, parseInt, parseFloat,
    LitUK: { toggleTheme() {} },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

/* The engine declares almost everything with const/let, which in a VM live in
   the script's lexical scope and never appear on the context object. So the
   bridge is built by evaluating a snippet inside the same context, where those
   names are in scope. Reading `S` through a getter matters: `S=` is reassigned
   by resetAll(), and a captured reference would go stale. */
const BRIDGE = `globalThis.__api={
  get S(){return S}, set S(v){S=v},
  get prefs(){return prefs},
  get pendingRestore(){return pendingRestore}, set pendingRestore(v){pendingRestore=v},
  POOL, correctIdx, recordAnswer, noteRecent, readiness, save, savePrefs, dayKey,
  migrate, exportData, readBackup, importData, applyRestore, confirmRestore, summarise,
  toastText:()=>document.getElementById('toast').textContent
}`;

/** Boot a fresh engine against a persistent store — this is what a reload is. */
function boot(store) {
  const log = [];
  const ctx = vm.createContext(stubDom(store, log));
  for (const f of BANK_FILES) vm.runInContext(fs.readFileSync(R(f), "utf8"), ctx, { filename: f });
  vm.runInContext(engineSrc, ctx, { filename: "life-in-uk-mock-tests.html" });
  vm.runInContext(BRIDGE, ctx, { filename: "bridge" });
  return { ctx: ctx.__api, log, store };
}

/** The JSON the download would have contained. */
function exportedJson(app) {
  app.log.length = 0;
  app.ctx.exportData();
  const blob = app.log.find((x) => x && x.parts);
  if (!blob) throw new Error("exportData() produced no Blob");
  return blob.parts.join("");
}

/* ---------------- a profile worth losing ----------------
   Mid-sprint state, built through the engine's own recordAnswer so the shape is
   whatever the engine actually writes rather than whatever this file imagines
   it writes. That distinction is the entire point: a hand-built fixture would
   still pass on the day recordAnswer starts writing a field export forgets. */
function seed(app) {
  const { ctx } = app;
  const pool = ctx.POOL;
  for (let i = 0; i < 400; i++) {
    const q = pool[i];
    const correct = i % 3 !== 0;            // ~67%, a real early-sprint accuracy
    ctx.recordAnswer(q, correct, correct ? ctx.correctIdx(q) : [0]);   // notes recent itself
  }
  ctx.S.tests[7] = { best: 21, attempts: 3, lastPass: Date.now() - 2 * 864e5, revealed: false };
  ctx.S.tests[12] = { best: 16, attempts: 1, lastPass: null, revealed: true };
  ctx.S.drill = { last: ctx.dayKey(), streak: 6, best: 9 };
  ctx.S.history = [{ t: Date.now() - 864e5, title: "Test 7", score: 21, total: 24 }];
  ctx.S.flags[3] = 1;
  ctx.S.examDate = "2026-09-05";
  ctx.readiness();                          // leaves S.readiness for the hub
  ctx.save();
  ctx.prefs.dailyTarget = 100;
  ctx.savePrefs();
}

/* ================= 1. the round trip ================= */
{
  const store = {};
  const before = boot(store);
  seed(before);
  const file = exportedJson(before);
  const stateBefore = JSON.parse(JSON.stringify(before.ctx.S));
  const prefsBefore = JSON.parse(JSON.stringify(before.ctx.prefs));

  ok(before.ctx.S.answered >= 400, `seeded state answered ${before.ctx.S.answered}, expected >= 400`);
  ok(Object.keys(before.ctx.S.sr).length > 300, "seeded state has no spaced-repetition records to lose");
  ok(before.ctx.S.readiness && typeof before.ctx.S.readiness.p === "number",
    "seeded state has no readiness — the hub's pass-chance tile would be blank after a restore");

  /* The phone is gone. New device, empty browser, one file. */
  const after = boot({});
  eq(after.ctx.S.answered, 0, "fresh device did not start empty");
  const parsed = after.ctx.readBackup(file);
  ok(parsed && parsed.state, "readBackup() refused a file this very build exported");
  if (parsed) {
    after.ctx.pendingRestore = parsed;
    after.ctx.applyRestore();
    ok(after.log.includes("reload"), "applyRestore() did not reload — S in memory would be the old device's");

    const restored = boot(after.store);          // the reload
    const s = restored.ctx.S;
    eq(s.answered, stateBefore.answered, "answered count did not survive the restore");
    eq(s.correct, stateBefore.correct, "correct count did not survive the restore");
    eq(Object.keys(s.sr).length, Object.keys(stateBefore.sr).length, "spaced-repetition records lost in restore");
    eq(Object.keys(s.mistakes).length, Object.keys(stateBefore.mistakes).length, "mistakes lost in restore");
    eq(s.drill.streak, stateBefore.drill.streak, "day streak lost in restore");
    eq(s.recent.length, stateBefore.recent.length, "rolling-accuracy ring lost in restore");
    eq(s.examDate, stateBefore.examDate, "exam date lost in restore");
    eq(JSON.stringify(s.tests), JSON.stringify(stateBefore.tests), "test scores changed in restore");
    eq(JSON.stringify(s.flags), JSON.stringify(stateBefore.flags), "flagged questions lost in restore");
    eq(restored.ctx.prefs.dailyTarget, prefsBefore.dailyTarget, "settings (drill size) lost in restore");

    /* Every key of the saved state, not just the ones named above — this is what
       catches a field added next month that export never learned about. */
    for (const k of Object.keys(stateBefore)) {
      if (k === "readiness") continue;         // recomputed, checked separately
      eq(JSON.stringify(s[k]), JSON.stringify(stateBefore[k]), `state key "${k}" changed across the restore`);
    }

    /* The number the hub leads on has to come back the same, or the first thing
       the new device tells you is that your pass chance moved while you slept. */
    const p0 = Math.round(stateBefore.readiness.p * 100);
    const p1 = Math.round(restored.ctx.readiness().p * 100);
    eq(p1, p0, "pass probability changed across the restore");
  }
}

/* ================= 2. the wrong file =================
   Driven through importData(), not readBackup(), because that is the path a
   mis-click actually takes: readBackup throws on malformed JSON by design and
   importData is what turns the throw into a refusal. Testing the inner function
   alone would pass on the day the try/catch around it is deleted. */
{
  const app = boot({});
  seed(app);
  const held = JSON.stringify(app.ctx.S);
  const refuse = [
    ["not json at all", "this is not json {"],
    ["an empty file", ""],
    ["a truncated backup", '{"app":"lituk","v":1,"lituk_v1":{"tests":{},"mist'],
    ["some other app's json", JSON.stringify({ app: "notlituk", data: [1, 2, 3] })],
    ["a bare array", JSON.stringify([1, 2, 3])],
    ["null", "null"],
    ["the right wrapper round the wrong payload", JSON.stringify({ app: "lituk", v: 1, lituk_v1: { hello: 1 } })],
    ["a state missing sr", JSON.stringify({ tests: {}, mistakes: {}, answered: 4 })],
    ["a state whose answered is a string", JSON.stringify({ tests: {}, mistakes: {}, sr: {}, answered: "4" })],
    ["a photo renamed .json", "��JFIF JFIF"],
  ];
  for (const [what, raw] of refuse) {
    app.ctx.pendingRestore = null;
    let threw = null;
    try { app.ctx.importData({ files: [{ _text: raw }] }) } catch (e) { threw = e.message }
    ok(!threw, `importData() threw on ${what}: ${threw}`);
    ok(app.ctx.pendingRestore === null,
      `importData() queued a restore from ${what} — confirming it would wipe the device`);
    ok(/isn't a Life in the UK backup|Could not read/.test(app.ctx.toastText()),
      `importData() said nothing useful about ${what}: "${app.ctx.toastText()}"`);
  }
  eq(JSON.stringify(app.ctx.S), held, "a refused file still changed the state on the device");
  eq(JSON.stringify(JSON.parse(app.store[LS_KEY])), held, "a refused file still wrote to localStorage");

  /* And the file picked with no file picked at all. */
  app.ctx.pendingRestore = null;
  app.ctx.importData({ files: [] });
  ok(app.ctx.pendingRestore === null, "importData() with no file selected queued a restore anyway");
}

/* ================= 3. the backup you already have =================
   Anything exported before Phase 4 has no `recent` and no `readiness`, and
   anything exported before Phase 2 has mistakes in the old streak shape. Those
   are the files sitting on the phones right now, so they are the ones that
   matter most. */
{
  const modern = boot({});
  seed(modern);
  const full = JSON.parse(exportedJson(modern));

  const old = JSON.parse(JSON.stringify(full.lituk_v1));
  delete old.recent; delete old.readiness; delete old.mig; delete old.examDate;
  for (const k of Object.keys(old.mistakes)) {          // pre-Phase-2 mistake shape
    old.mistakes[k].streak = 1;
    delete old.mistakes[k].ok;
  }
  for (const k of Object.keys(old.sr)) delete old.sr[k].unsure;

  const app = boot({});
  const parsed = app.ctx.readBackup(JSON.stringify(old));
  ok(parsed && parsed.state, "readBackup() refused a pre-Phase-4 backup — the files on the phones right now");
  if (parsed) {
    app.ctx.pendingRestore = parsed;
    app.ctx.applyRestore();
    let restored;
    try { restored = boot(app.store) } catch (e) { fails.push(`restoring a pre-Phase-4 backup crashed the engine: ${e.message}`); }
    if (restored) {
      const s = restored.ctx.S;
      eq(s.answered, old.answered, "answered count lost restoring an old backup");
      ok(Array.isArray(s.recent), "restored old backup has no rolling-accuracy ring — load() did not fill the default");
      eq(s.examDate, "2026-09-05", "restored old backup did not pick up the default exam date");
      for (const mm of Object.values(s.mistakes)) {
        ok(Array.isArray(mm.ok), "migrate() left a pre-Phase-2 mistake in the old streak shape");
        ok(mm.streak === undefined, "migrate() left the dead streak field on a mistake");
      }
      const r = restored.ctx.readiness();
      ok(r && typeof r.p === "number" && r.p >= 0 && r.p <= 1,
        `readiness() over a restored old backup returned ${JSON.stringify(r && r.p)}`);

      /* Migrations run again on every load, and a restore is a load. Twice must
         equal once or a restored file drifts a little further every time. */
      const once = JSON.stringify(restored.ctx.S);
      restored.ctx.migrate();
      eq(JSON.stringify(restored.ctx.S), once, "migrate() is not idempotent — a restored backup changes on every reload");

      /* And idempotent on state that has been STUDIED since the restore, which
         is the case that costs something. Checking it on a freshly-migrated
         file only proves migrate() leaves empty things empty: every retirement
         day earned after the restore could still be wiped on the next reload,
         and days-on-separate-days is the one thing that cannot be re-earned. */
      const g = Object.keys(restored.ctx.S.mistakes)[0];
      ok(g !== undefined, "seeded profile produced no mistakes to study");
      if (g !== undefined) {
        const before = { ok: [20260810, 20260811], done: false, count: 2, leech: false };
        Object.assign(restored.ctx.S.mistakes[g], before);
        restored.ctx.S.sr[g] = { box: 3, due: Date.now() + 3 * 864e5, seen: 5, last: Date.now(), unsure: 1 };
        restored.ctx.save();
        const studied = JSON.stringify(restored.ctx.S);
        restored.ctx.migrate();
        eq(JSON.stringify(restored.ctx.S.mistakes[g].ok), JSON.stringify(before.ok),
          "migrate() reset the retirement days on a mistake studied since the restore");
        eq(restored.ctx.S.sr[g].box, 3, "migrate() knocked a studied question back down its spaced-repetition ladder");
        eq(JSON.stringify(restored.ctx.S), studied, "migrate() rewrote state that had been studied since the restore");
      }
    }
  }
}

/* ================= 4. the bare dump ================= */
{
  const src = boot({});
  seed(src);
  const state = JSON.parse(exportedJson(src)).lituk_v1;
  const app = boot({});
  const parsed = app.ctx.readBackup(JSON.stringify(state));   // no wrapper, older export
  ok(parsed && parsed.state && parsed.prefs === null, "readBackup() mishandled a bare lituk_v1 dump");
  if (parsed) {
    app.ctx.pendingRestore = parsed;
    app.ctx.applyRestore();
    eq(boot(app.store).ctx.S.answered, state.answered, "bare dump restored the wrong answered count");
  }
}

/* ================= 5. restoring over live progress ================= */
{
  const src = boot({});
  seed(src);
  const file = exportedJson(src);
  const srcAnswered = src.ctx.S.answered;

  const dev = boot({});
  for (let i = 0; i < 20; i++) dev.ctx.recordAnswer(dev.ctx.POOL[i], true, dev.ctx.correctIdx(dev.ctx.POOL[i]));
  dev.ctx.save();
  const parsed = dev.ctx.readBackup(file);
  dev.ctx.pendingRestore = parsed;
  dev.ctx.confirmRestore(parsed);          // must not throw with progress present
  dev.ctx.applyRestore();
  const after = boot(dev.store);
  eq(after.ctx.S.answered, srcAnswered, "restore merged with the device's progress instead of replacing it");

  /* Cancel has to leave everything alone — it is the button you press when the
     summary says this is the wrong file. */
  const dev2 = boot({});
  dev2.ctx.recordAnswer(dev2.ctx.POOL[0], true, dev2.ctx.correctIdx(dev2.ctx.POOL[0]));
  dev2.ctx.save();
  const held = stable(dev2.ctx.S);
  dev2.ctx.pendingRestore = dev2.ctx.readBackup(file);
  dev2.ctx.pendingRestore = null;          // what the Cancel button does
  dev2.ctx.applyRestore();                 // no pending restore: must be a no-op
  eq(stable(boot(dev2.store).ctx.S), held, "cancelling a restore still overwrote the device");
}

/* ================= 6. the summary you decide on ================= */
{
  const app = boot({});
  seed(app);
  const s = app.ctx.summarise(app.ctx.S);
  ok(/\d+ tests? passed/.test(s) && /\d+ answered/.test(s) && /open mistake/.test(s) && /day streak/.test(s),
    `summarise() no longer says what is in the file: "${s}"`);
  /* An empty file must not read like a full one — that summary is the only
     thing standing between a mis-click and 25 days. */
  const empty = app.ctx.summarise({ tests: {}, mistakes: {}, sr: {}, answered: 0 });
  ok(/0 answered/.test(empty), `summarise() of an empty backup does not say it is empty: "${empty}"`);
}

/* ---------------- report ---------------- */
if (fails.length) {
  console.error(`\n${fails.length} of ${checks} checks FAILED\n`);
  for (const f of fails) console.error("  ✗ " + f);
  console.error("\nDo not trust an export until this passes.\n");
  process.exit(1);
}
console.log(`Backup/restore: ${checks} checks pass.

  round trip · wrong file refused · pre-Phase-4 backup migrated · bare dump ·
  restore over live progress · cancel is a no-op

This proves the CODE restores. It does not prove your phone's file does.
Do this once per device, today:
  1. Progress → Manage data → Export backup.
  2. Move the file off the phone (email it to yourself; keep it).
  3. On any other browser, open the app → Restore… → pick the file.
  4. Check the dashboard reads what it read on the phone.
Until step 4 has happened on both phones, the sprint has no insurance.`);
