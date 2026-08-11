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

/* ---- duplicate content, and the key that must never merge too much (INV-6) ----
   32 ids are the same question twice, so the engine collapses them onto one
   canonical id and keys spaced repetition and mistakes there. It must use the
   same key as this file: stem PLUS normalised option set.

   The stem alone is forbidden. 141 questions ask "Which of these statements is
   correct?" and differ only in their two options — they are the discrimination
   pairs, the best twist-training material in the bank, and a stem-only key
   would merge 140 of them into one. The assertions below are what stops that
   happening the next time someone touches the key. */
const dupNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (q) => dupNorm(q.t) + " " + q.o.map((o) => dupNorm(o[0])).sort().join("");
const uniq = new Map();                // dupKey -> [q, ...]
for (const q of canonical.values()) {
  if (!uniq.has(dupKey(q))) uniq.set(dupKey(q), []);
  uniq.get(dupKey(q)).push(q);
}
const dupGroups = [...uniq.values()].filter((g) => g.length > 1);
const UNIQUE_EXPECT = 1858;            // the count both the engine and the hub carry
if (uniq.size !== UNIQUE_EXPECT) {
  fail(`the banks hold ${uniq.size} unique questions, expected ${UNIQUE_EXPECT}. If a bank was added on purpose, update UNIQUE_EXPECT here, in life-in-uk-mock-tests.html and UNIQUE_QUESTIONS in index.html together. If not, the dedup key is merging questions it should not.`);
}
/* A merged group whose members disagree on the answer would attach one
   spaced-repetition box to two contradictory questions. */
const answerOf = (q) => q.o.filter((o) => o[1]).map((o) => dupNorm(o[0])).sort().join("|");
for (const g of dupGroups) {
  if (new Set(g.map(answerOf)).size > 1) fail(`ids ${g.map((q) => q.g).join(", ")} look like the same question but disagree on the correct answer — they must not be merged`);
}
/* Normalisation must not flatten two options of one question into one. */
for (const q of canonical.values()) {
  const n = q.o.map((o) => dupNorm(o[0]));
  if (new Set(n).size !== n.length) fail(`q${q.g}'s options collapse into each other once normalised: ${JSON.stringify(q.o.map((o) => o[0]))}`);
}
/* The discrimination family must survive the key intact. */
const disc = [...canonical.values()].filter((q) => /which of these statements is correct/i.test(q.t));
if (new Set(disc.map(dupKey)).size !== disc.length) {
  fail(`the dedup key merges ${disc.length - new Set(disc.map(dupKey)).size} of the ${disc.length} "which of these statements is correct" questions — INV-6 violated, the key is too loose`);
}

/* ---- two-option questions and the price of a coin flip ----
   511 of the unique questions have two options: 354 true/false and 157
   discrimination pairs. A question you can guess right half the time must cost
   more days to retire than a four-option one, or the spaced-repetition boxes
   fill with accidents. The engine prices that in RETIRE_2 / RETIRE_4. */
const twoOption = [...uniq.values()].filter((g) => g[0].o.length === 2).length;
const engineSrc = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const retire = engineSrc.match(/const RETIRE_4=(\d+),RETIRE_2=(\d+),LEECH_AT=(\d+);/);
if (!retire) fail(`could not find the RETIRE_4 / RETIRE_2 / LEECH_AT constants in life-in-uk-mock-tests.html`);
else {
  const [, r4, r2, leech] = retire.map(Number);
  if (!(r2 > r4)) fail(`RETIRE_2 is ${r2} and RETIRE_4 is ${r4} — a two-option question must take MORE separate days to retire, not fewer, because half of getting it right is luck`);
  if (r4 < 2) fail(`RETIRE_4 is ${r4}: one right answer retiring a mistake is the bug this rule exists to fix`);
  if (leech < r4) fail(`LEECH_AT is ${leech}, below RETIRE_4 (${r4}) — every mistake would become a leech and nothing would ever retire`);
}
/* INV-8: nothing may be scheduled past the exam. */
if (!/function clampDue\(/.test(engineSrc)) fail(`life-in-uk-mock-tests.html has no clampDue() — INV-8 (no due date after the exam) is unenforced`);

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
for (const [name, want] of [["TOTAL_TESTS", tests.length], ["TOTAL_QUESTIONS", qCount], ["UNIQUE_QUESTIONS", uniq.size]]) {
  const m = hub.match(new RegExp(`var ${name} = (\\d+);`));
  if (!m) fail(`could not find ${name} in index.html`);
  else if (+m[1] !== want) fail(`index.html has ${name} = ${m[1]}, the banks say ${want}`);
}
/* The engine carries the same unique count, and warns in the console if its
   own dedup disagrees. Both copies have to move together. */
const ue = engineSrc.match(/const UNIQUE_EXPECT=(\d+);/);
if (!ue) fail(`could not find UNIQUE_EXPECT in life-in-uk-mock-tests.html`);
else if (+ue[1] !== uniq.size) fail(`life-in-uk-mock-tests.html has UNIQUE_EXPECT=${ue[1]}, the banks say ${uniq.size}`);
const tag = hub.match(/<span class="tag">(\d+) tests<\/span>/);
if (!tag) fail(`could not find the tests tag in index.html`);
else if (+tag[1] !== tests.length) fail(`index.html's tile says "${tag[1]} tests", the banks say ${tests.length}`);

/* ---- report ---- */
console.log(`${banks.length} bank(s): ${banks.map((b) => `${b.id} (${b.tests.length} tests)`).join(", ")}`);
console.log(`${tests.length} tests · ${tests.reduce((a, t) => a + t.q.length, 0)} slots · ${qCount} question ids · passmark ${pm}/${PER_TEST}`);
console.log(`${uniq.size} unique questions · ${qCount - uniq.size} redundant ids in ${dupGroups.length} group(s), collapsed by the engine`);
console.log(`${twoOption} two-option questions (${Math.round(twoOption / uniq.size * 100)}% — a 50% guess rate), retired on ${retire ? retire[2] : "?"} separate days against ${retire ? retire[1] : "?"} for the rest`);
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
