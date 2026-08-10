#!/usr/bin/env node
/**
 * Guards the question banks against the two failures that do not throw.
 *
 *   node tools/validate-banks.mjs
 *
 * A duplicate question id silently reattaches spaced-repetition boxes and
 * mistake history to the wrong question. A duplicate test number silently
 * merges two tests' scores. Neither shows up as an error — you would notice
 * weeks later, if at all. Run this before every deploy.
 */
import fs from "node:fs";
import { R, TOPICS, loadBanks, allTests } from "./lib/banks.mjs";

const EXISTING_MAX_G = 1079;   // INV-2: ids 0-1079 belong to the britizen bank
const EXISTING_MAX_N = 45;     // INV-3: tests 1-45 belong to the britizen bank
const LEGACY_BANK = "mock";
const PER_TEST = 24;

const fails = [];
const fail = (m) => fails.push(m);
const banks = loadBanks();
const tests = allTests(banks);

/* ---- ids ---- */
const gSeen = new Map();       // g -> bank id
for (const t of tests) {
  for (const q of t.q) {
    const owner = gSeen.get(q.g);
    if (owner === undefined) gSeen.set(q.g, t.bank.id);
    else if (owner !== t.bank.id) fail(`question id ${q.g} is used by both "${owner}" and "${t.bank.id}"`);
  }
}
for (const [g, id] of gSeen) {
  if (!Number.isInteger(g) || g < 0) fail(`question id ${g} in "${id}" is not a non-negative integer`);
  if (id !== LEGACY_BANK && g <= EXISTING_MAX_G) fail(`question id ${g} in "${id}" collides with the ${LEGACY_BANK} bank's 0-${EXISTING_MAX_G}`);
}

/* ---- test numbers ---- */
const nSeen = new Map();
for (const t of tests) {
  if (nSeen.has(t.n)) fail(`test number ${t.n} is used by both "${nSeen.get(t.n)}" and "${t.bank.id}"`);
  else nSeen.set(t.n, t.bank.id);
  if (t.bank.id !== LEGACY_BANK && t.n <= EXISTING_MAX_N) fail(`test ${t.n} in "${t.bank.id}" collides with the ${LEGACY_BANK} bank's 1-${EXISTING_MAX_N}`);
}

/* ---- question shape ---- */
for (const t of tests) {
  if (t.q.length !== PER_TEST) fail(`test ${t.n} ("${t.bank.id}") has ${t.q.length} questions, expected ${PER_TEST}`);
  for (const q of t.q) {
    const where = `q${q.g} (test ${t.n}, "${t.bank.id}")`;
    if (!q.t || typeof q.t !== "string") fail(`${where} has no question text`);
    if (!Array.isArray(q.o) || q.o.length < 2) fail(`${where} has fewer than two options`);
    else {
      if (!q.o.some((o) => o[1])) fail(`${where} has no correct option`);
      if (q.o.every((o) => o[1])) fail(`${where} marks every option correct`);
      if (q.o.some((o) => !o[0] || typeof o[0] !== "string")) fail(`${where} has an empty option`);
    }
    if (!Number.isInteger(q.p) || q.p < 0 || q.p >= TOPICS.length) fail(`${where} has topic ${q.p}, expected 0-${TOPICS.length - 1}`);
  }
}

/* ---- a question shared between tests must be the same question ---- */
const canonical = new Map();
for (const t of tests) {
  for (const q of t.q) {
    const prev = canonical.get(q.g);
    if (!prev) { canonical.set(q.g, q); continue; }
    if (prev.t !== q.t) fail(`question id ${q.g} has two different texts`);
    if (JSON.stringify(prev.o) !== JSON.stringify(q.o)) fail(`question id ${q.g} has two different option sets`);
    if (prev.p !== q.p) fail(`question id ${q.g} has two different topics`);
  }
}

/* ---- passmark ---- */
const pm = banks[0].passmark;
for (const b of banks) if (b.passmark !== pm) fail(`bank "${b.id}" has passmark ${b.passmark}, "${banks[0].id}" has ${pm}`);
if (!Number.isInteger(pm) || pm < 1 || pm > PER_TEST) fail(`passmark ${pm} is not a sane score out of ${PER_TEST}`);

/* ---- bank metadata ---- */
for (const b of banks) {
  for (const k of ["id", "label", "source", "sourceUrl"]) if (!b[k]) fail(`bank "${b.id}" is missing ${k}`);
}
const ids = banks.map((b) => b.id);
if (new Set(ids).size !== ids.length) fail(`duplicate bank id in ${ids.join(", ")}`);

/* ---- the three copies of the topic list must agree ----
   The engine keys q.p and S.topics[i] on this order, the hub reads it to name
   your weakest topic, and the search index ships it. Drift between them
   mislabels every topic without erroring. */
function topicsIn(file, re) {
  const m = fs.readFileSync(R(file), "utf8").match(re);
  if (!m) return fail(`could not find the topic list in ${file}`), null;
  return m[1].split(/['"]\s*,\s*['"]/).map((s) => s.replace(/^['"\s]+|['"\s]+$/g, "")).filter(Boolean);
}
const copies = {
  "life-in-uk-mock-tests.html": topicsIn("life-in-uk-mock-tests.html", /const TOPICS=\[([\s\S]*?)\];/),
  "index.html": topicsIn("index.html", /var TOPIC_NAMES = \[([\s\S]*?)\];/),
};
for (const [file, list] of Object.entries(copies)) {
  if (!list) continue;
  if (JSON.stringify(list) !== JSON.stringify(TOPICS)) {
    fail(`the topic list in ${file} does not match tools/lib/banks.mjs:\n      ${JSON.stringify(list)}\n      ${JSON.stringify(TOPICS)}`);
  }
}

/* ---- the hub's hardcoded totals ----
   index.html does not load the 750KB of bank data just to draw four stat
   tiles, so it carries the counts. Cheap to state, expensive to notice wrong. */
const qCount = gSeen.size;
const hub = fs.readFileSync(R("index.html"), "utf8");
for (const [name, want] of [["TOTAL_TESTS", tests.length], ["TOTAL_QUESTIONS", qCount]]) {
  const m = hub.match(new RegExp(`var ${name} = (\\d+);`));
  if (!m) fail(`could not find ${name} in index.html`);
  else if (+m[1] !== want) fail(`index.html has ${name} = ${m[1]}, the banks say ${want}`);
}
const tag = hub.match(/<span class="tag">(\d+) tests<\/span>/);
if (!tag) fail(`could not find the tests tag in index.html`);
else if (+tag[1] !== tests.length) fail(`index.html's tile says "${tag[1]} tests", the banks say ${tests.length}`);

/* ---- report ---- */
console.log(`${banks.length} bank(s): ${banks.map((b) => `${b.id} (${b.tests.length} tests)`).join(", ")}`);
console.log(`${tests.length} tests · ${tests.reduce((a, t) => a + t.q.length, 0)} slots · ${qCount} unique questions · passmark ${pm}/${PER_TEST}`);
for (const b of banks) {
  const gs = b.tests.flatMap((t) => t.q.map((q) => q.g));
  const ns = b.tests.map((t) => t.n);
  console.log(`  ${b.id.padEnd(9)} ids ${Math.min(...gs)}-${Math.max(...gs)}  tests ${Math.min(...ns)}-${Math.max(...ns)}  ${b.source}`);
}

if (fails.length) {
  console.error(`\n${fails.length} PROBLEM(S):`);
  for (const f of fails) console.error("  ✕ " + f);
  process.exit(1);
}
console.log("\nAll checks pass.");
