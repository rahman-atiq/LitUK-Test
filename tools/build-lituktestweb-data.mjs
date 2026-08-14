#!/usr/bin/env node
/**
 * Builds lituktestweb-data.js — the 17 exam tests from LifeInTheUKTestWeb.co.uk
 * as a fourth question bank.
 *
 *   node tools/build-lituktestweb-data.mjs
 *
 * Every test this source publishes is an exam paper — there is no mock/exam
 * split to preserve, unlike testprep.uk. So every question in the bank gets
 * x:1, derived in a second pass exactly as INV-9 requires elsewhere, never
 * authored in the first. See PLAN-lituktestweb-source.md.
 *
 * Ids start at FIRST_ID and test numbers at 400: saved progress is keyed on
 * both, and the three earlier banks own 0-2791 / 1-45 / 101-139 / 201-238 /
 * 301-311 forever. Never renumber. tools/validate-banks.mjs is the guard.
 */
import fs from "node:fs";
import { R, TOPICS, loadBanks, allTests } from "./lib/banks.mjs";
import { loadAll, PER_TEST } from "./fetch-lituktestweb-exams.mjs";

const FIRST_ID = 2792;      // INV-2: the three earlier banks own 0-2791
const TEST_BASE = 400;      // INV-3: exam tests land on 401-417
const PASSMARK = 18;

const problems = [];

/* ---------------- load ---------------- */

const { indexBad, tests: pages } = await loadAll({ quiet: true });
if (indexBad.length) problems.push(...indexBad);

/* ---------------- topics — derived from the site's own legend, never
   hardcoded ----------------
   This site numbers its chapters the OPPOSITE way round from testprep.uk:
   its legend states {1:3, 2:4, 3:1, 4:0, 5:2}, identical to CH2TOPIC in
   build-practice-data.mjs and the reverse of TP2TOPIC in
   build-testprep-data.mjs. Copying the more recently written TP2TOPIC across
   would silently mis-file every chapter-1 and chapter-2 question into the
   other's topic and throw no error — so the mapping is derived from the
   legend's own parent names on every page, matched against TOPICS
   case/punctuation-insensitively, and asserted to be a bijection before a
   single question is filed under it. */
const topicNorm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const TOPIC_NORMS = TOPICS.map(topicNorm);

function deriveTopicMap(legend) {
  const ch2topic = {};       // chapter number (1-5) -> topic index (0-4)
  const leaf2ch = {};        // leaf category id -> chapter number
  const usedTopics = new Set();
  const local = [];

  for (const [parentId, parent] of Object.entries(legend || {})) {
    const m = String(parent.name || "").match(/^Chapter\s+(\d+):\s*(.*)$/i);
    if (!m) { local.push(`legend entry ${parentId} has a name that doesn't match "Chapter N: ..." — "${parent.name}"`); continue; }
    const chNum = +m[1];
    if (parent.index !== chNum) local.push(`legend entry ${parentId} states index ${parent.index} but its name says Chapter ${chNum}`);

    const rest = topicNorm(m[2]);
    const ti = TOPIC_NORMS.indexOf(rest);
    if (ti < 0) { local.push(`no TOPICS entry matches "${m[2]}" (from Chapter ${chNum})`); continue; }
    if (ch2topic[chNum] !== undefined) local.push(`chapter ${chNum} appears twice in the legend`);
    if (usedTopics.has(ti)) local.push(`topic "${TOPICS[ti]}" is matched by more than one chapter`);
    ch2topic[chNum] = ti;
    usedTopics.add(ti);

    for (const leafId of Object.keys(parent.children || {})) leaf2ch[leafId] = chNum;
  }

  if (Object.keys(ch2topic).length !== 5 || usedTopics.size !== 5) {
    local.push(`legend -> TOPICS resolved ${Object.keys(ch2topic).length}/5 chapters and ${usedTopics.size}/5 distinct topics — not a bijection`);
  }
  return { ch2topic, leaf2ch, problems: local };
}

if (!pages.length || !pages[0].legend) problems.push("no category legend found on the first page — cannot derive topics");
const { ch2topic, leaf2ch, problems: topicProblems } = pages.length && pages[0].legend
  ? deriveTopicMap(pages[0].legend)
  : { ch2topic: {}, leaf2ch: {}, problems: [] };
problems.push(...topicProblems);

// The legend is site-wide, not per-page — but it is re-embedded on every page,
// so a page that disagrees with the first is a real signal, not noise.
for (const p of pages) {
  if (JSON.stringify(p.legend) !== JSON.stringify(pages[0].legend)) {
    problems.push(`${p.slug}: category legend differs from exam-1's`);
  }
}

function topicOf(leafCategory) {
  const ch = leaf2ch[leafCategory];
  if (ch === undefined) return -1;
  const t = ch2topic[ch];
  return t === undefined ? -1 : t;
}

/* ---------------- dedup (INV-6) ----------------
   Stem plus the sorted, normalised option set — text alone would merge
   distinct discrimination-pair questions that share a stem. Two questions in
   this source collide under this key (see PLAN-lituktestweb-source.md §1);
   they share one id, exactly as repeats do in the other builders. */
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const key = (q) => norm(q.t) + "||" + q.o.map((o) => norm(o[0])).sort().join("|");
const answerKey = (q) => q.o.filter((o) => o[1]).map((o) => norm(o[0])).sort().join("|");

/* The key tools/validate-banks.mjs uses at runtime (INV-6). Kept separate so
   the build can assert the two agree rather than assume it. */
const vNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const vKey = (q) => vNorm(q.t) + " " + q.o.map((o) => vNorm(o[0])).sort().join("");

/* ---------------- build ----------------
   First pass assembles the bank in Exam 1 -> 17 order, so ids run in the
   order a reader would meet them. x is NOT set here — INV-9 says it is
   derived, and the second pass below is the only thing allowed to write it. */
const canon = new Map();      // dedup key -> the canonical question
const tests = [];
let nextId = FIRST_ID;

for (const p of pages) {
  if (p.questions.length !== PER_TEST) problems.push(`${p.slug}: ${p.questions.length} questions`);
  const q = [];
  for (const raw of p.questions) {
    if (raw.bad) { problems.push(`${p.slug} ${raw.i}: ${raw.bad} — ${raw.t.slice(0, 60)}`); continue; }

    const k = key(raw);
    const hit = canon.get(k);
    if (hit) {
      if (answerKey(hit.raw) !== answerKey(raw)) problems.push(`conflicting answers for: ${raw.t.slice(0, 60)}`);
      q.push(hit.q);
      hit.seenIn.push(p.slug);
      continue;
    }

    const t = topicOf(raw.category);
    if (t < 0) { problems.push(`${p.slug} ${raw.i}: no topic for category "${raw.category}" — ${raw.t.slice(0, 60)}`); continue; }

    const built = { g: nextId++, t: raw.t, e: raw.e, p: t, o: raw.o };
    canon.set(k, { q: built, raw, seenIn: [p.slug] });
    q.push(built);
  }
  const n = TEST_BASE + p.n;
  tests.push({ n, kind: "exam", name: `Reported Exam ${p.n}`, q });
}

/* ---------------- second pass: x (INV-9) ----------------
   Every test in this bank is kind:"exam", so every question qualifies — but
   it is still derived from test membership here, not written during
   assembly, so a future edit that adds a non-exam test to this bank cannot
   leave a stale x:1 behind. */
for (const t of tests) if (t.kind === "exam") for (const q of t.q) q.x = 1;

const examIds = new Set(tests.filter((t) => t.kind === "exam").flatMap((t) => t.q.map((q) => q.g)));
for (const c of canon.values()) {
  const flagged = c.q.x === 1;
  const reachable = examIds.has(c.q.g);
  if (flagged !== reachable) problems.push(`INV-9: q${c.q.g} has x=${c.q.x} but ${reachable ? "is" : "is not"} in an exam test`);
}

/* The dedup this file did must be the dedup validate-banks.mjs will do. */
const vKeys = new Set([...canon.values()].map((c) => vKey(c.q)));
if (vKeys.size !== canon.size) {
  problems.push(`${canon.size} questions collapse to ${vKeys.size} under the validator's INV-6 key — the two keys disagree`);
}

/* ---------------- collisions with the banks already shipped ----------------
   Not a problem: fresh ids, the engine collapses them onto one card at
   runtime. Disagreeing about the answer WOULD be a problem. */
const existing = new Map();
for (const t of allTests(loadBanks())) for (const q of t.q) if (!existing.has(vKey(q))) existing.set(vKey(q), q);
const collisions = [];
for (const c of canon.values()) {
  const prev = existing.get(vKey(c.q));
  if (!prev) continue;
  collisions.push({ g: c.q.g, prev: prev.g, t: c.q.t });
  if (answerKey(prev) !== answerKey(c.q)) {
    problems.push(`answer conflict with the existing bank: q${prev.g} vs new q${c.q.g} — ${c.q.t.slice(0, 60)}`);
  }
}

if (problems.length) {
  problems.slice(0, 20).forEach((p) => console.error("!! " + p));
  throw new Error(`${problems.length} problem(s) — refusing to write lituktestweb-data.js`);
}

/* ---------------- emit ---------------- */

const lastId = nextId - 1;
const shared = [...canon.values()].filter((c) => c.seenIn.length > 1).length;
const perTopic = [0, 0, 0, 0, 0];
for (const c of canon.values()) perTopic[c.q.p]++;

const head = `/* Question bank: 17 exam tests from lifeintheuktestweb.co.uk, question ids
   ${FIRST_ID}-${lastId}, test numbers ${tests[0].n}-${tests[tests.length - 1].n}.
   Generated by tools/build-lituktestweb-data.mjs — do not edit by hand.

   Every test this source publishes is an exam paper — there is no mock pool
   to slice it from, unlike testprep.uk. So x:1 is set on every question here,
   derived from test membership and never hand-edited (INV-9), same mechanism
   as the testprep bank. No r: this source publishes no star rating.

   ${shared} question(s) appear in more than one test and share a single id.
   Ids and test numbers are load-bearing: saved progress is keyed on them, so
   never renumber. See tools/validate-banks.mjs. */
(window.LITUK_BANKS = window.LITUK_BANKS || []).push({
  id: "lituktestweb",
  label: "Reported Exam Tests",
  source: "LifeInTheUKTestWeb.co.uk",
  sourceUrl: "https://lifeintheuktestweb.co.uk/exams/",
  passmark: ${PASSMARK},
  perTest: ${PER_TEST},
  tests: [\n`;

const js = head + tests.map((t) => "    " + JSON.stringify(t)).join(",\n") + "\n  ],\n});\n";
fs.writeFileSync(R("lituktestweb-data.js"), js);

console.log(`chapter -> topic table, derived from the site's own legend:`);
for (const c of [1, 2, 3, 4, 5]) console.log(`  ch${c} -> topic ${ch2topic[c]} (${TOPICS[ch2topic[c]]})`);

console.log(`\nlituktestweb-data.js  ${(js.length / 1024).toFixed(0)} KB`);
console.log(`  ${tests.length} tests (${tests[0].n}-${tests[tests.length - 1].n}) · ${tests.reduce((a, t) => a + t.q.length, 0)} slots`);
console.log(`  ${canon.size} unique questions, ids ${FIRST_ID}-${lastId} · ${shared} shared across tests`);
console.log(`  ${examIds.size} carry x:1 (all of them) · explanations ${[...canon.values()].filter((c) => c.q.e).length}/${canon.size}`);
console.log(`  per topic: ${perTopic.join(", ")}`);
console.log(`  ${collisions.length} collide with a bank already shipped, 0 answer conflicts:`);
for (const c of collisions) console.log(`    new g${c.g} = existing g${c.prev}  ${c.t.slice(0, 55)}`);

const ok = tests.length === 17 && tests.every((t) => t.q.length === PER_TEST) && canon.size === vKeys.size;
console.log(ok
  ? `\nGO — 17 tests · ${tests.reduce((a, t) => a + t.q.length, 0)} slots · ${canon.size} ids ${FIRST_ID}-${lastId} · ${examIds.size} exam · 0 problems.`
  : "\nNO GO — see above.");
