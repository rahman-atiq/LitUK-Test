#!/usr/bin/env node
/**
 * Triages the question banks against the handbook chapters in this repo.
 *
 *   node tools/verify-bank.mjs                 top flags to the terminal
 *   node tools/verify-bank.mjs --all           every flag
 *   node tools/verify-bank.mjs --out FILE      write the full report
 *   node tools/verify-bank.mjs --only conflict|unsupported|contradiction
 *
 * Both banks are third-party scrapes. They are not authoritative and they
 * contain errors, and an error here is worse than a gap: a wrong answer drilled
 * on a spaced-repetition schedule is a wrong fact rehearsed to the point of
 * confidence, and then written down in an exam.
 *
 * THIS TOOL DOES NOT CORRECT ANYTHING. It produces a list for a human to read.
 * That is deliberate. Its three signals are heuristics over prose, they are
 * wrong a useful fraction of the time, and an auto-corrector running on top of
 * them would launder its own false positives into the bank — replacing an error
 * rate you can measure with one you cannot.
 *
 * Ground truth here is the chapter pages in this repo, which are a rendering of
 * the official handbook, not the handbook itself. So "unsupported" means "this
 * repo does not say it", never "the handbook does not say it". The conflict
 * signal needs no ground truth at all and is the one to read first.
 */
import fs from "node:fs";
import { loadBanks, allQuestions } from "./lib/banks.mjs";
import { loadChapters } from "./lib/chapters.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d };
const SHOW = has("--all") ? Infinity : +val("--top", 25);
const ONLY = val("--only", null);
const OUT = val("--out", null);

/* ---------------- text ---------------- */

const STOP = new Set((
  "the a an of in on at to for and or is are was were be been being am by with from into during over under " +
  "between than then also this that these those there here it its as which what who whom when where how why " +
  "you your they them their his her him she he we our us not no yes can could will would shall should may " +
  "might must do does did done have has had but if all any some more most other others one such only own " +
  "same so too very just about after before above below out off again further once each following statement " +
  "statements below true false correct answer question people country year years time first also called " +
  "known part many much new old still often usually around called include includes including"
).split(" "));

/** Numbers survive whole; words lose a plural 's' so "islands" meets "island". */
function tokens(s) {
  const out = [];
  for (const raw of String(s || "").toLowerCase().split(/[^a-z0-9£%]+/)) {
    if (!raw) continue;
    if (/^\d/.test(raw)) { out.push(raw); continue; }
    const w = raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (w.length >= 3 && !STOP.has(w) && !STOP.has(raw)) out.push(w);
  }
  return out;
}
const uniq = (a) => [...new Set(a)];

/* A number worth arguing about. Bare ordinals and single digits generate far
   more noise than signal — "the 1st of January" is not a claim under dispute. */
const NUM = /\b(?:£\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]{1,}|\d+)\b/g;
const numsIn = (s) => uniq((String(s || "").match(NUM) || [])
  .map((n) => n.replace(/[\s,]/g, ""))
  .filter((n) => { const v = +n.replace(/[^\d.]/g, ""); return !(v >= 1 && v <= 12 && !/[£%]/.test(n)) }));
const isYear = (n) => /^\d{3,4}$/.test(n) && +n >= 400 && +n <= 2029;

/* ---------------- corpus ---------------- */

const chapters = loadChapters();
const blocks = chapters.map((b, i) => ({ ...b, i, toks: uniq(tokens(b.text)), nums: numsIn(b.text) }));

const df = new Map();
for (const b of blocks) for (const t of b.toks) df.set(t, (df.get(t) || 0) + 1);
const N = blocks.length;
/** Rare words carry the claim; "government" in a book about government does not. */
const idf = (t) => Math.log(N / ((df.get(t) || 0) + 1)) + 0.15;

const postings = new Map();
for (const b of blocks) for (const t of b.toks) {
  let p = postings.get(t); if (!p) postings.set(t, p = []);
  p.push(b.i);
}
/** Every number anywhere in the chapters, for "this figure appears nowhere". */
const corpusNums = new Set(blocks.flatMap((b) => b.nums));

/* ---------------- the bank ---------------- */

const dupNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (q) => dupNorm(q.t) + " " + q.o.map((o) => dupNorm(o[0])).sort().join("");

const banks = loadBanks();
const bankOf = new Map();
for (const b of banks) for (const t of b.tests) for (const q of t.q) if (!bankOf.has(q.g)) bankOf.set(q.g, b.id);

const seen = new Set();
const POOL = [];
for (const q of allQuestions(banks).sort((a, b) => a.g - b.g)) {
  const k = dupKey(q);
  if (seen.has(k)) continue;                 // the lowest id owns the state, as the engine does
  seen.add(k);
  POOL.push(q);
}
const answerOf = (q) => q.o.filter((o) => o[1]).map((o) => o[0]).join(" · ");

/* ---------------- signal 1: the chapters do not say this ----------------
   Score the claim (its stated answer plus its own explanation) against every
   chapter block, and keep the best. A fact usually straddles a heading and the
   bullet under it, so pairs of adjacent blocks are scored too. */
function support(claimToks) {
  const w = new Map();
  let total = 0;
  for (const t of claimToks) { const v = idf(t); w.set(t, v); total += v }
  if (!total) return { score: 0, best: null };

  const hit = new Map();                     // block -> covered idf mass
  for (const [t, v] of w) for (const i of postings.get(t) || []) hit.set(i, (hit.get(i) || 0) + v);
  if (!hit.size) return { score: 0, best: null };

  let bestI = -1, bestV = 0;
  for (const [i, v] of hit) {
    /* The block after this one, if they sit in the same section — a heading
       scores nothing on its own and carries half the claim's context. */
    const nb = blocks[i + 1];
    const pair = nb && nb.fi === blocks[i].fi && nb.anchor === blocks[i].anchor ? (hit.get(i + 1) || 0) : 0;
    const joint = v + pair * 0.9;
    if (joint > bestV) { bestV = joint; bestI = i }
  }
  return { score: Math.min(1, bestV / total), best: bestI < 0 ? null : blocks[bestI] };
}

/* ---------------- signal 2: the chapters say a different number ----------------
   Match on the claim's WORDS only, then look at what numbers the winning
   passage carries. A claim whose own figure is missing from a passage that is
   plainly about the same thing, and which states other figures of the same
   kind, is the shape of a scraped answer that drifted. */
function numericConflict(q, claimNums, ctxToks) {
  const claimYears = claimNums.filter(isYear), claimPlain = claimNums.filter((n) => !isYear(n));
  if (!claimNums.length) return null;
  const ctx = support(ctxToks.filter((t) => !/^\d/.test(t)));
  if (!ctx.best || ctx.score < 0.45) return null;

  const near = [ctx.best, blocks[ctx.best.i + 1], blocks[ctx.best.i - 1]]
    .filter((b) => b && b.fi === ctx.best.fi);
  const hereNums = uniq(near.flatMap((b) => b.nums));
  if (!hereNums.length) return null;

  const missing = claimNums.filter((n) => !hereNums.includes(n));
  if (!missing.length) return null;
  /* Only argue when the passage offers a rival of the SAME kind: a year against
     a year, a count against a count. A block that says "1801" is no evidence
     about a claim of "£30". */
  const rivals = hereNums.filter((n) => (claimYears.length && isYear(n)) || (claimPlain.length && !isYear(n)));
  if (!rivals.length) return null;

  const nowhere = missing.filter((n) => !corpusNums.has(n));
  return {
    passage: ctx.best, ctxScore: ctx.score, missing, rivals,
    nowhere,                                  // absent from all ten pages, not just here
  };
}

/* ---------------- signal 3: the banks disagree with each other ----------------
   No ground truth needed and none assumed: if the same question with the same
   choices is keyed two different ways, one of them is wrong whatever the
   handbook says. This is the signal to read first — the only one that cannot be
   argued away as the chapters wording something differently.

   The comparison is between OPTION SETS, not stems. Two questions asking "which
   TWO countries are in the Commonwealth?" over different lists of countries
   have different right answers and neither is wrong; the first cut of this
   flagged forty such pairs and every one was noise. What is never innocent is
   the same menu with a different item ticked. */
const ansKey = (q) => q.o.filter((o) => o[1]).map((o) => tokens(o[0]).join(" ")).sort().join(" | ");
const optKey = (q) => q.o.map((o) => tokens(o[0]).join(" ")).sort().join(" | ");
const stemSet = (q) => new Set(tokens(q.t));
function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

function conflicts() {
  const out = [];
  const byOpts = new Map();
  for (const q of POOL) {
    const k = optKey(q);
    if (!k.replace(/[\s|]/g, "")) continue;
    let g = byOpts.get(k); if (!g) byOpts.set(k, g = []);
    g.push(q);
  }
  for (const group of byOpts.values()) {
    for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      const A = group[a], B = group[b];
      if (ansKey(A) === ansKey(B)) continue;
      const jac = jaccard(stemSet(A), stemSet(B));
      /* Identical choices can still belong to opposite questions — "which of
         these is NOT a public holiday" over the same four days. Only the ones
         asking the same thing are a contradiction. */
      if (jac < 0.6) continue;
      out.push({ a: A, b: B, jac, why: "identical choices, different answer keyed" });
    }
  }

  /* And the pairs the engine itself merges. dupKey — stem plus sorted options —
     is what collapses 32 ids into their canonical twin, keeping the lower id's
     record and discarding the other. If a collapsed pair disagrees about the
     answer, the app has already silently picked one, and nothing anywhere says
     which. */
  const byDup = new Map();
  for (const q of allQuestions(banks)) {
    const k = dupKey(q);
    let g = byDup.get(k); if (!g) byDup.set(k, g = []);
    g.push(q);
  }
  for (const group of byDup.values()) {
    if (group.length < 2) continue;
    const keys = uniq(group.map(ansKey));
    if (keys.length < 2) continue;
    const [A, B] = group.sort((x, y) => x.g - y.g);
    out.push({ a: A, b: B, jac: 1, why: "the engine collapses these two into one and they disagree — it keeps q" + A.g + "'s answer" });
  }
  return out.sort((x, y) => y.jac - x.jac);
}

/* ---------------- run ---------------- */

const findings = [];

for (const q of POOL) {
  const ans = answerOf(q);
  const claim = `${ans} ${q.e || ""}`;
  const claimToks = uniq(tokens(claim));
  const stemToks = uniq(tokens(q.t));
  if (!claimToks.length) {
    findings.push({ kind: "unsupported", q, score: 0, why: "no explanation and no answer text to check", best: null });
    continue;
  }

  const sup = support(claimToks);
  const nc = numericConflict(q, numsIn(claim), uniq([...claimToks, ...stemToks]));

  if (nc) {
    /* A figure that appears nowhere in ten chapters is a much stronger call
       than one that merely lost to a neighbour in the same paragraph. */
    const conf = nc.nowhere.length ? 0.75 + 0.2 * nc.ctxScore : 0.35 + 0.3 * nc.ctxScore;
    findings.push({
      kind: "contradiction", q, score: conf, best: nc.passage,
      why: `answer states ${nc.missing.join(", ")}${nc.nowhere.length ? ` (${nc.nowhere.join(", ")} appears nowhere in the chapters)` : ""}` +
           `; the passage says ${nc.rivals.join(", ")}`,
    });
  }
  if (sup.score < 0.34) {
    findings.push({
      kind: "unsupported", q, score: 1 - sup.score, best: sup.best,
      why: `only ${Math.round(sup.score * 100)}% of the claim's distinctive wording appears anywhere in the chapters`,
    });
  }
}

for (const c of conflicts()) {
  findings.push({
    kind: "conflict", q: c.a, other: c.b, score: 0.9 + c.jac / 20,
    why: `${c.why} — q${c.a.g} says "${answerOf(c.a)}", q${c.b.g} says "${answerOf(c.b)}"`,
    best: null,
  });
}

findings.sort((a, b) => b.score - a.score);
const shown = ONLY ? findings.filter((f) => f.kind === ONLY) : findings;

/* ---------------- report ---------------- */

const RANK = { conflict: "BANKS DISAGREE", contradiction: "CHAPTERS DISAGREE", unsupported: "NOT IN THE CHAPTERS" };
function render(f, n) {
  const L = [];
  L.push(`${String(n).padStart(4)}. [${RANK[f.kind]}] q${f.q.g} · ${bankOf.get(f.q.g)} · test ${f.q._test} · confidence ${(f.score).toFixed(2)}`);
  L.push(`      Q: ${f.q.t}`);
  L.push(`      A: ${answerOf(f.q)}`);
  if (f.q.e) L.push(`      E: ${f.q.e}`);
  if (f.other) {
    L.push(`      ---`);
    L.push(`      Q: ${f.other.t}   (q${f.other.g} · ${bankOf.get(f.other.g)} · test ${f.other._test})`);
    L.push(`      A: ${answerOf(f.other)}`);
    if (f.other.e) L.push(`      E: ${f.other.e}`);
  }
  L.push(`      ! ${f.why}`);
  if (f.best) L.push(`      chapter ${f.best.chapter} (${f.best.file}#${f.best.anchor || ""}) — ${f.best.head || "?"}\n        “${f.best.text.slice(0, 300)}${f.best.text.length > 300 ? "…" : ""}”`);
  return L.join("\n");
}

const counts = { conflict: 0, contradiction: 0, unsupported: 0 };
for (const f of findings) counts[f.kind]++;

const header = [
  `tools/verify-bank.mjs — ${new Date().toISOString().slice(0, 10)}`,
  ``,
  `${POOL.length} unique questions checked against ${blocks.length} blocks of the ten chapter pages.`,
  ``,
  `  ${String(counts.conflict).padStart(4)}  BANKS DISAGREE       two near-identical questions, two different answers`,
  `  ${String(counts.contradiction).padStart(4)}  CHAPTERS DISAGREE    the answer's figure is not the one the passage gives`,
  `  ${String(counts.unsupported).padStart(4)}  NOT IN THE CHAPTERS  the claim's wording is largely absent from the repo's handbook pages`,
  ``,
  `Read top-down and stop when the flags stop being worth it. Nothing here is`,
  `corrected automatically: BANKS DISAGREE is near-certain, CHAPTERS DISAGREE is`,
  `usually real, NOT IN THE CHAPTERS is the noisiest and includes questions that`,
  `are simply worded differently from the book.`,
  ``,
].join("\n");

const body = shown.map((f, i) => render(f, i + 1)).join("\n\n");

if (OUT) {
  fs.writeFileSync(OUT, header + "\n" + body + "\n");
  console.log(header);
  console.log(`Full report (${shown.length} flags) written to ${OUT}`);
} else {
  console.log(header);
  console.log(shown.slice(0, SHOW).map((f, i) => render(f, i + 1)).join("\n\n"));
  if (shown.length > SHOW) console.log(`\n… ${shown.length - SHOW} more. --all for everything, --out FILE to write it down.`);
}
