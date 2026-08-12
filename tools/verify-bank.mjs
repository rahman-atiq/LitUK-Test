#!/usr/bin/env node
/**
 * Triages the question banks against the handbook chapters in this repo.
 *
 *   node tools/verify-bank.mjs                 top flags to the terminal
 *   node tools/verify-bank.mjs --all           every flag
 *   node tools/verify-bank.mjs --out FILE      write the full report
 *   node tools/verify-bank.mjs --json          findings as JSON, for the tests
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

/* Numbers survive whole; words are cut back to a crude stem.
   A plural 's' alone is not enough. The banks and the chapters were written by
   different hands, so they inflect differently — the chapters say "recycle",
   the bank asks about "recycling"; the chapters say "voting age", the question
   says "the right to vote" — and against a stem-blind comparison every one of
   those reads as a word the chapters never use. That is how "recycling your
   waste" was reported as absent from a book containing the line "Environment:
   recycle (less energy, less landfill)". */
function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith("ly")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length >= 4 && w.endsWith("e")) w = w.slice(0, -1);   // vote/voting, recycle/recycling
  if (w.length >= 4 && w.endsWith("y")) w = w.slice(0, -1) + "i"; // country/countries, voluntary/voluntarily
  return w;
}
function tokens(s) {
  const out = [];
  for (const raw of String(s || "").toLowerCase().split(/[^a-z0-9£%]+/)) {
    if (!raw) continue;
    if (/^\d/.test(raw)) { out.push(raw); continue; }
    const w = stem(raw);
    if (w.length >= 3 && !STOP.has(w) && !STOP.has(raw)) out.push(w);
  }
  return out;
}
const uniq = (a) => [...new Set(a)];

/* A number worth arguing about. Bare ordinals and single digits generate far
   more noise than signal — "the 1st of January" is not a claim under dispute. */
const NUM = /\b(?:£\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]{1,}|\d+)\b/g;

/* The chapters abbreviate where the banks spell out — "1998 · 57m" against
   "(1998, 57 million)". There is no word boundary between the digits and the
   "m", so the corpus read no 57 at all, and the tool spent the whole first cut
   asserting that the UK's 1998 population "appears nowhere in the chapters"
   while the population curve sat there stating it. */
const units = (s) => String(s || "").replace(/(\d)\s?(?:m|bn|k)\b/gi, "$1 ");

const numsRaw = (s) => uniq((units(s).match(NUM) || [])
  .map((n) => n.replace(/[\s,]/g, ""))
  .filter((n) => { const v = +n.replace(/[^\d.]/g, ""); return !(v >= 1 && v <= 12 && !/[£%]/.test(n)) }));
/** What a claim asserts — scrubbed. The corpus is read raw: a date the chapters
    print in brackets is still the chapters stating it. */
const numsIn = (s) => numsRaw(scrub(s));
const isYear = (n) => /^\d{3,4}$/.test(n) && +n >= 400 && +n <= 2029;

/* Constructs that print a number nobody is asking about, removed before any
   number is read. All four were found by reading the top 20 flags, and between
   them they accounted for most of it:
     (1941-93), (1955- ), (1888-1946)   a lifespan in brackets — 92 questions
     (2,292 square kilometres)          a conversion of a figure already given
     see page 134                       a cross-reference to a book not in this repo
     1853–56                            a range whose tail reads as the number "56"
   The conversions are the worst of them, because 1,865 km² and 2,170 km² pass
   isYear() and then get argued against the dates in a paragraph about castles. */
const NOISE = [
  [/\(\s*\d{3,4}\s*[-–—]\s*(?:\d{2,4})?\s*\)/g, " "],
  [/\(\s*[\d,]+(?:\.\d+)?\s*(?:square kilometre|sq\.? ?km|km²|kilometre)\w*\s*\)/gi, " "],
  [/\bsee page\s+\d+/gi, " "],
  [/\b(\d{4})\s*[-–—]\s*\d{2}\b/g, "$1"],
  /* "11:00" is one assertion, not an 11 and a 00 — and the 11 is dropped as a
     small integer, leaving the tool arguing about a number that is half a
     clock face. Two pub-opening questions reached the top 20 that way. */
  [/\b\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?/gi, " "],
  /* "25-Mar-57" — the tail is 1957 written short, and the chapters spell it. */
  [/\b\d{1,2}[-/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/]\d{2}\b/gi, " "],
];
function scrub(s) {
  let t = String(s || "");
  for (const [re, to] of NOISE) t = t.replace(re, to);
  return t;
}

/* ---------------- corpus ---------------- */

const chapters = loadChapters();
const blocks = chapters.map((b, i) => ({ ...b, i, toks: uniq(tokens(b.text)), nums: numsRaw(b.text) }));

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

/* ---------------- locating the passage ----------------
   Score the claim (its stated answer plus its own explanation) against every
   chapter block, and keep the best. A fact usually straddles a heading and the
   bullet under it, so pairs of adjacent blocks are scored too.

   This finds WHERE the chapters talk about something. It is a poor judge of
   whether they SAY it — see signal 1 — so it is used to locate and to print,
   and its score is only ever a secondary test. */
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
   kind, is the shape of a scraped answer that drifted.

   What counts as "the claim's figure" is the whole game here. The first cut read
   every number in the answer AND its explanation, which is why it produced 137
   flags containing one real finding: 577 of the 768 questions carrying a number
   carry none at all in the answer, so the signal spent its time arguing about
   Bobby Moore's dates in a question asking which sport he played. The figure
   under test is the one the question stakes itself on — nothing else is drilled,
   and an explanation is prose read once.

   For a true/false question the stem is the claim, so its numbers count — but
   only when the key is TRUE. A FALSE-keyed stem asserts that its own numbers are
   wrong, and agreeing with the chapters about that is not a finding. */
function assertedNums(q) {
  const key = answerOf(q).trim().toLowerCase();
  if (key === "true") return NEGATED.test(q.t) ? [] : numsIn(q.t);
  if (key === "false") return [];
  /* "In which of these years did Britain NOT host the Olympics?" keys 1928
     exactly because 1908, 1948 and 2012 are the real ones. */
  if (NEGATED.test(q.t)) return [];
  return numsIn(answerOf(q));
}

/* How much of what a claim is *about* a block covers — the same idf-weighted
   overlap `support` uses, scored against one block rather than the best of all.
   A fixed "shares one of the top 3 rarest words" cut was tried first and is
   arbitrary in exactly the wrong way: which words make a top 3 depends on the
   claim's length, so the voting-age question corroborated at top 5 and stopped
   corroborating at top 3, with nothing about either question changing. */
function overlap(block, claimToks) {
  let total = 0, have = 0;
  for (const t of claimToks) {
    if (/^\d/.test(t)) continue;
    const v = idf(t); total += v;
    if (block.toks.includes(t)) have += v;
  }
  return total ? have / total : 0;
}

/* Does ANY passage plausibly about this claim carry the figure?

   This replaces trusting the single best-scoring block, which was the largest
   remaining source of noise once the explanation's numbers were dropped. The
   locator matches on topical word overlap, so "how many members does a jury
   have in Scotland?" landed on a paragraph about 129 MSPs, 60 AMs and 108 MLAs
   — the right country, the wrong fact — and the tool duly reported that the
   chapters say 129 where the bank says 15. They say 15 too, three pages away.

   Corroboration is topical, not global: a block only counts if it shares one of
   the claim's rarest words. Otherwise "£10,000" is corroborated by "~10,000
   years ago" in the prehistory chapter and the real small-claims disagreement
   disappears. */
/* The bar is the passage we were about to cite. If some block states the figure
   AND is at least as on-topic as the one we would have argued from, there is no
   argument to make — the chapters say it, elsewhere.

   Self-calibrating, which a fixed cutoff was not: at 0.15 a chapter-3 summary
   sentence mentioning England, Wales and "10,000 years ago" corroborated the
   small-claims limit of £10,000 and swallowed a real finding. Against the civil
   courts passage — money, limit, small, claims, procedure, England, Wales — it
   does not come close, and the finding survives. */
/* "At least as on-topic" is too strict when the located passage is a very good
   match: the chapters say "For 400 years the Romans rule" two blocks away from
   "Roman army left in AD 410", and against the second the first does not score.
   Six tenths of the bar admits it and still rejects the £10,000 case. The list
   is identical anywhere from 0.6 down to 0.4, so this is a plateau rather than a
   number that was fitted. */
const CORROBORATE_REL = 0.6;
function corroborated(num, claimToks, floor) {
  for (const b of blocks) {
    if (!b.nums.includes(num)) continue;
    if (overlap(b, claimToks) >= floor) return true;
  }
  return false;
}

/* A stem that asks which option is NOT true inverts the whole test: its answer
   is chosen precisely because the chapters do not support it. */
const NEGATED = /\b(?:not|never|except|apart from|incorrect|false)\b/i;

function numericConflict(q, claimNums, ctxToks) {
  const claimYears = claimNums.filter(isYear), claimPlain = claimNums.filter((n) => !isYear(n));
  if (!claimNums.length) return null;
  const ctx = support(ctxToks.filter((t) => !/^\d/.test(t)));
  if (!ctx.best || ctx.score < 0.45) return null;

  const near = [ctx.best, blocks[ctx.best.i + 1], blocks[ctx.best.i - 1]]
    .filter((b) => b && b.fi === ctx.best.fi);
  const hereNums = uniq(near.flatMap((b) => b.nums));
  if (!hereNums.length) return null;

  /* Missing from the located passage AND uncorroborated anywhere else the
     chapters discuss this claim. The second half is the load-bearing one. */
  /* Keyed on what the QUESTION is about, not on its explanation's vocabulary.
     "When were women given the right to vote at the age of 18?" has an
     explanation whose rarest words are "franchise" and "extended", neither of
     which the chapters use — so keying on the claim found no corroboration for
     1969 and flagged a date the chapters state twice. */
  const asserted = assertedToks(q);
  const floor = overlap(ctx.best, asserted) * CORROBORATE_REL;
  const missing = claimNums
    .filter((n) => !hereNums.includes(n))
    .filter((n) => !corroborated(n, asserted, floor));
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

/* ---------------- signal 1: the chapters do not say this ----------------
   The first cut scored the whole claim — the answer plus its entire explanation
   — against the single best block, and flagged anything under 34%. That measures
   the bank's verbosity against the chapters' concision, not support. Two of its
   own top-20 flags refute it:

     q1285  "Countries join the Commonwealth voluntarily"          scored 19%
            against a block reading "Membership is voluntary"
     q663   "Recycling your waste"                                 scored 18%
            against "Environment: recycle (less energy, less landfill)"

   In both the printed passage contains the answer. A long explanation cannot be
   fully covered by a one-line bullet, so a well-supported claim with a wordy
   scrape scores lower than a bare one — exactly backwards.

   What this signal can honestly claim is "this repo does not say it", so it now
   asks that directly: of the words the question stakes itself on, weighted so
   the rare ones carry the claim, what share does the corpus use ANYWHERE? A term
   the ten pages never use once — "canvassing", "ISAF", "darts" — is a real gap
   you cannot revise from. A term they use in a paragraph the locator happened not
   to pick is not, and it no longer counts against the question. */
function assertedToks(q) {
  const bare = /^(true|false|yes|no)$/i.test(answerOf(q).trim());
  return uniq(tokens(bare ? q.t : `${q.t} ${answerOf(q)}`));
}

/* Whether "do the chapters say this?" is even the right question. A FALSE-keyed
   statement and a NOT-stem are both answered correctly *because* the chapters
   do not support what they say, so their absence is the point, not a finding. */
function saysWhatItAsserts(q) {
  const key = answerOf(q).trim().toLowerCase();
  if (key === "false" || key === "no") return false;
  return !NEGATED.test(q.t);
}

/* idf-weighted share of the claim's own vocabulary that the chapters use at all,
   plus the words they do not.

   The missing list is reported as well as scored because an absent word is
   scored at the maximum idf — the formula's weight for a word appearing in no
   block at all — and one such word swamps a short claim. "Recycling your waste"
   is four words the chapters use and one they do not ("waste"), against a line
   reading "Environment: recycle (less energy, less landfill)"; on mass alone
   that scores 0.74 and flags. One unused common noun is not a gap in the
   chapters, so the caller wants two. */
function vocabSupport(claimToks) {
  let total = 0, have = 0;
  const missing = [];
  for (const t of claimToks) {
    const v = idf(t); total += v;
    if (df.has(t)) have += v; else missing.push(t);
  }
  return { score: total ? have / total : 1, missing };
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

/* Both thresholds were set by reading flags, not by theory. VOCAB_MIN is where
   the list stops being questions the chapters never mention and starts being
   questions they mention in other words; BLOCK_MIN is the second key on the
   door — a claim whose words are missing AND which no single passage is about. */
const VOCAB_MIN = 0.80;
const BLOCK_MIN = 0.34;
const MISSING_MIN = 2;

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
  const nc = numericConflict(q, assertedNums(q), uniq([...claimToks, ...stemToks]));

  if (nc) {
    /* A figure that appears nowhere in ten chapters is a much stronger call
       than one that merely lost to a neighbour in the same paragraph. */
    const conf = nc.nowhere.length ? 0.75 + 0.2 * nc.ctxScore : 0.35 + 0.3 * nc.ctxScore;
    findings.push({
      kind: "contradiction", q, score: conf, best: nc.passage,
      why: `the answer states ${nc.missing.join(", ")}${nc.nowhere.length ? ` (${nc.nowhere.join(", ")} appears nowhere in the chapters)` : ""}` +
           `; the passage says ${nc.rivals.join(", ")}`,
    });
  }

  const voc = saysWhatItAsserts(q) ? vocabSupport(assertedToks(q)) : { score: 1, missing: [] };
  if (voc.score < VOCAB_MIN && voc.missing.length >= MISSING_MIN && sup.score < BLOCK_MIN) {
    findings.push({
      kind: "unsupported", q, score: 1 - voc.score, best: sup.best,
      why: `the chapters never use ${voc.missing.join(", ")} — ${Math.round((1 - voc.score) * 100)}% of what` +
           ` this question turns on — and no single passage is about it (best block ${Math.round(sup.score * 100)}%)`,
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

if (has("--json")) {
  /* For tools/test-verify-bank.mjs, which pins the flags a human has already
     ruled on. Parsing the printed report would tie those rulings to its
     layout. */
  console.log(JSON.stringify({
    counts,
    findings: shown.map((f) => ({
      kind: f.kind, g: f.q.g, other: f.other ? f.other.g : null,
      bank: bankOf.get(f.q.g), test: f.q._test,
      score: +f.score.toFixed(3), why: f.why,
    })),
  }));
} else if (OUT) {
  fs.writeFileSync(OUT, header + "\n" + body + "\n");
  console.log(header);
  console.log(`Full report (${shown.length} flags) written to ${OUT}`);
} else {
  console.log(header);
  console.log(shown.slice(0, SHOW).map((f, i) => render(f, i + 1)).join("\n\n"));
  if (shown.length > SHOW) console.log(`\n… ${shown.length - SHOW} more. --all for everything, --out FILE to write it down.`);
}
