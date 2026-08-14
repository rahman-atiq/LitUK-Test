#!/usr/bin/env node
/**
 * Builds testprep-data.js — the 38 mock and 11 exam tests from TestPrep.UK as a
 * third question bank.
 *
 *   node tools/build-testprep-data.mjs
 *
 * Ids start at FIRST_ID and test numbers at 200/300, because saved progress is
 * keyed on both and the earlier banks own 0-1889 and 1-45/101-139 forever.
 * Never renumber: an id collision silently reattaches somebody's
 * spaced-repetition history to the wrong question. tools/validate-banks.mjs is
 * the guard.
 *
 * ONE bank, not two. The site's exam tests are a curation over the same pool as
 * its mock tests — 261 of the 263 exam questions also appear in a mock test — so
 * splitting them into two banks would mint 261 duplicate ids for identical
 * content. Exam-ness rides on the question instead, as x:1. See
 * PLAN-testprep-source.md §"The finding that reshapes the request".
 */
import fs from "node:fs";
import { R, loadBanks, allTests } from "./lib/banks.mjs";
import { loadAll, PER_TEST, isContent } from "./fetch-testprep-tests.mjs";

const FIRST_ID = 1890;      // INV-2: the earlier banks own 0-1889
const MOCK_BASE = 200;      // INV-3: mock tests land on 201-238
const EXAM_BASE = 300;      //        exam tests land on 301-311
const PASSMARK = 18;

/* ---------------- topics ----------------
   TestPrep numbers its chapters DIFFERENTLY from lifeintheuktest.com: its
   chapters 1 and 2 are the other way round. Copying CH2TOPIC across from
   build-practice-data.mjs would mis-file 46 questions into each other's topic
   and throw no error at all — it would just quietly corrupt the topic
   breakdown and the weakest-topic recommendation.

   Verified against the chapter tests' own references (see the table this file
   prints): chapter 1 carries what-is-the-uk and uk-cities, chapter 2 carries
   the-values-and-principles-of-the-uk and responsibilities-and-freedoms. */
const TP2TOPIC = { 1: 4, 2: 3, 3: 1, 4: 0, 5: 2 };
//  1 What is the UK?                      -> 4      (lifeintheuktest.com calls this 2)
//  2 The values and principles of the UK  -> 3      (lifeintheuktest.com calls this 1)
//  3 A Long and Illustrious History       -> 1
//  4 A Modern, Thriving Society           -> 0
//  5 UK government, law and your role     -> 2

/* Slugs are the fallback for the handful of questions that appear in no
   chapter test. Only trusted where the chapter tests put a slug under one
   chapter overwhelmingly — britain-since-1945 shows up twice under chapter 5
   and 68 times under chapter 3, and a bare majority is not evidence. */
const SLUG_MAJORITY = 0.8;
const SLUG_MIN = 3;

/* The one straggler that appears in no chapter test and whose reference slug
   (famous-writers) never appears in one either. Wordsworth's daffodils are
   Arts and culture, which is chapter 4 -> topic 0. */
const BY_HAND = [
  [/^What flowers did William Wordsworth write about/i, 0],
];

/* ---------------- dedup ----------------
   Question text plus the sorted option set, punctuation and case stripped.
   Text alone is not enough: stems like "Which of these statements is correct?"
   recur many times with completely different options. */
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const key = (q) => norm(q.t) + "||" + q.o.map((o) => norm(o[0])).sort().join("|");
const answerKey = (q) => q.o.filter((o) => o[1]).map((o) => norm(o[0])).sort().join("|");

/* The key tools/validate-banks.mjs uses to decide what the engine collapses at
   runtime (INV-6). Kept separate from key() above so the build can assert the
   two agree inside this bank rather than assume it. */
const vNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const vKey = (q) => vNorm(q.t) + " " + q.o.map((o) => vNorm(o[0])).sort().join("");

/* ---------------- load ---------------- */

const pages = await loadAll({ quiet: true });
const content = pages.filter(isContent);
const chapters = pages.filter((p) => p.kind === "chapter");
const problems = [];

/* ---------------- topic ground truth, from the chapter tests ----------------
   882 of the 902 questions also sit in a chapter test, which states the chapter
   outright. That is far better than guessing from a free-text reference line,
   which is what the lifeintheuktest.com builder is stuck with. */

const chOf = new Map();                    // dedup key -> chapter
const conflicts = [];
for (const p of chapters) {
  for (const q of p.questions) {
    const k = key(q);
    const prev = chOf.get(k);
    if (prev === undefined) chOf.set(k, p.chapter);
    else if (prev !== p.chapter) conflicts.push(`${q.t.slice(0, 60)} — chapters ${prev} and ${p.chapter}`);
  }
}
if (conflicts.length) {
  conflicts.slice(0, 10).forEach((c) => problems.push(`question in two chapters: ${c}`));
}

/* Slug -> chapter, derived from those same pages rather than hand-written. */
const slugVotes = new Map();               // slug -> Map(chapter -> count)
for (const p of chapters) {
  for (const q of p.questions) {
    for (const s of q.slugs) {
      if (!slugVotes.has(s)) slugVotes.set(s, new Map());
      const m = slugVotes.get(s);
      m.set(p.chapter, (m.get(p.chapter) || 0) + 1);
    }
  }
}
const slugCh = new Map();
const slugRejected = [];
for (const [s, m] of slugVotes) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const [ch, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  if (total >= SLUG_MIN && n / total >= SLUG_MAJORITY) slugCh.set(s, ch);
  else slugRejected.push(`${s} (${[...m.entries()].map(([c, v]) => `ch${c}:${v}`).join(" ")})`);
}

function chapterOf(q) {
  const direct = chOf.get(key(q));
  if (direct !== undefined) return { ch: direct, via: "chapter-test" };
  const votes = new Map();
  for (const s of q.slugs) {
    const c = slugCh.get(s);
    if (c !== undefined) votes.set(c, (votes.get(c) || 0) + 1);
  }
  if (votes.size === 1) return { ch: [...votes.keys()][0], via: "slug" };
  if (votes.size > 1) {
    const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > sorted[1][1]) return { ch: sorted[0][0], via: "slug" };
  }
  return { ch: null, via: null };
}

function topicOf(q) {
  const { ch, via } = chapterOf(q);
  if (ch !== null && TP2TOPIC[ch] !== undefined) return { p: TP2TOPIC[ch], via };
  for (const [re, t] of BY_HAND) if (re.test(q.t)) return { p: t, via: "by-hand" };
  return { p: -1, via: null };
}

/* ---------------- build ----------------
   First pass assembles the bank in PAGES order — mock 1-38, then exam 1-11 —
   so ids run in the order a reader would meet them. x is NOT set here: INV-9
   says it is derived from exam-test membership, never authored, and the second
   pass below is the only thing allowed to write it. */

const canon = new Map();      // dedup key -> the canonical question
const tests = [];
const via = { "chapter-test": 0, slug: 0, "by-hand": 0 };
let nextId = FIRST_ID;

for (const p of content) {
  if (p.questions.length !== PER_TEST) problems.push(`${p.slug}: ${p.questions.length} questions`);
  const q = [];
  for (const raw of p.questions) {
    if (raw.bad) { problems.push(`${p.slug}: ${raw.bad} — ${raw.t.slice(0, 60)}`); continue; }

    const k = key(raw);
    const hit = canon.get(k);
    if (hit) {
      // Same question, seen in an earlier test. Two questions that dedup
      // together but disagree on the answer would be a data bug, not a repeat.
      if (answerKey(hit.raw) !== answerKey(raw)) problems.push(`conflicting answers for: ${raw.t.slice(0, 60)}`);
      q.push(hit.q);
      hit.seenIn.push(p.slug);
      continue;
    }

    const t = topicOf(raw);
    if (t.p < 0) { problems.push(`${p.slug}: no topic — ${raw.t.slice(0, 60)} [${raw.slugs.join(",")}]`); continue; }
    via[t.via]++;

    const built = { g: nextId++, t: raw.t, e: raw.e, p: t.p, o: raw.o };
    if (raw.r) built.r = raw.r;                       // rated-0 means unrated; omit it
    canon.set(k, { q: built, raw, seenIn: [p.slug] });
    q.push(built);
  }
  const n = (p.kind === "exam" ? EXAM_BASE : MOCK_BASE) + p.n;
  const name = `TestPrep ${p.kind === "exam" ? "Exam" : "Mock"} ${p.n}`;
  tests.push({ n, kind: p.kind, name, q });
}

/* ---------------- second pass: x (INV-9) ----------------
   x:1 iff the question is reachable from a kind:"exam" test in this bank.
   Derived from the assembled bank, so it cannot drift from the tests. The
   objects are shared by reference across tests, so a question that appears in
   both Mock 12 and Exam 3 gets the flag once and carries it everywhere — which
   is the whole point of keeping this to one bank. */
for (const t of tests) if (t.kind === "exam") for (const q of t.q) q.x = 1;

/* And the assertion that keeps it honest, run against the emitted objects. */
const examIds = new Set(tests.filter((t) => t.kind === "exam").flatMap((t) => t.q.map((q) => q.g)));
for (const c of canon.values()) {
  const flagged = c.q.x === 1;
  const reachable = examIds.has(c.q.g);
  if (flagged !== reachable) problems.push(`INV-9: q${c.q.g} has x=${c.q.x} but ${reachable ? "is" : "is not"} in an exam test`);
  if (c.q.x !== undefined && c.q.x !== 1) problems.push(`INV-9: q${c.q.g} has x=${c.q.x}, expected 1 or absent`);
}

/* The dedup this file did must be the dedup validate-banks.mjs will do, or the
   unique count it asserts will not be the one this build predicts. */
const vKeys = new Set([...canon.values()].map((c) => vKey(c.q)));
if (vKeys.size !== canon.size) {
  problems.push(`${canon.size} questions collapse to ${vKeys.size} under the validator's INV-6 key — the two keys disagree`);
}

/* ---------------- collisions with the banks already shipped ----------------
   Not a problem: they get fresh ids and the engine collapses them onto one
   card at runtime. Disagreeing about the answer WOULD be a problem. */
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
  throw new Error(`${problems.length} problem(s) — refusing to write testprep-data.js`);
}

/* ---------------- emit ---------------- */

const lastId = nextId - 1;
const shared = [...canon.values()].filter((c) => c.seenIn.length > 1).length;
const examQ = [...canon.values()].filter((c) => c.q.x === 1).length;
const examOnly = [...canon.values()].filter((c) => c.q.x === 1 && c.seenIn.every((s) => s.startsWith("exam-"))).length;
const perTopic = [0, 0, 0, 0, 0];
for (const c of canon.values()) perTopic[c.q.p]++;
const mocks = tests.filter((t) => t.kind === "mock");
const exams = tests.filter((t) => t.kind === "exam");

const head = `/* Question bank: 38 mock and 11 exam tests from testprep.uk, question ids
   ${FIRST_ID}-${lastId}, test numbers ${mocks[0].n}-${mocks[mocks.length - 1].n} (mock) and ${exams[0].n}-${exams[exams.length - 1].n} (exam).
   Generated by tools/build-testprep-data.mjs — do not edit by hand.

   The site's exam tests are a curation over the same pool as its mock tests,
   not a separate source: ${examQ} questions carry x:1 and all but ${examOnly} of them also
   appear in a mock test. So this is one bank with one id space, and exam-ness
   is a property of the question — x:1 means "appears in at least one exam
   test", derived from the tests below and never hand-edited (INV-9). r is the
   site's own 1-5 star rating, omitted where the site has not rated it.

   ${shared} questions appear in more than one test and share a single id, so they
   are one card in your progress. Ids and test numbers are load-bearing: saved
   progress is keyed on them, so never renumber. See tools/validate-banks.mjs. */
(window.LITUK_BANKS = window.LITUK_BANKS || []).push({
  id: "testprep",
  label: "TestPrep Tests",
  source: "TestPrep.UK",
  sourceUrl: "https://testprep.uk/life-in-the-uk-test/practice-tests",
  passmark: ${PASSMARK},
  perTest: ${PER_TEST},
  tests: [\n`;

const js = head + tests.map((t) => "    " + JSON.stringify(t)).join(",\n") + "\n  ],\n});\n";
fs.writeFileSync(R("testprep-data.js"), js);

console.log(`slug -> chapter table, derived from the ${chapters.length} chapter tests:`);
for (const c of [1, 2, 3, 4, 5]) {
  const s = [...slugCh.entries()].filter(([, v]) => v === c).map(([k]) => k);
  console.log(`  ch${c} -> topic ${TP2TOPIC[c]}  ${s.join(", ")}`);
}
if (slugRejected.length) console.log(`  not trusted: ${slugRejected.join(", ")}`);

console.log(`\ntestprep-data.js  ${(js.length / 1024).toFixed(0)} KB`);
console.log(`  ${tests.length} tests (${mocks.length} mock ${mocks[0].n}-${mocks[mocks.length - 1].n}, ${exams.length} exam ${exams[0].n}-${exams[exams.length - 1].n}) · ${tests.reduce((a, t) => a + t.q.length, 0)} slots`);
console.log(`  ${canon.size} unique questions, ids ${FIRST_ID}-${lastId} · ${shared} shared across tests`);
console.log(`  ${examQ} carry x:1 (${examOnly} of them exam-only) · ${[...canon.values()].filter((c) => c.q.r).length} carry r`);
console.log(`  topic via: ${Object.entries(via).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  per topic: ${perTopic.join(", ")}`);
console.log(`  explanations ${[...canon.values()].filter((c) => c.q.e).length}/${canon.size}`);
console.log(`  ${collisions.length} collide with a bank already shipped, 0 answer conflicts:`);
for (const c of collisions) console.log(`    new g${c.g} = existing g${c.prev}  ${c.t.slice(0, 55)}`);
