#!/usr/bin/env node
/**
 * Checks the authored source of the `toughest` bank — and that the shipped
 * bank is a current build of it.
 *
 *   node tools/check-toughest-source.mjs
 *
 * The other four banks are scrapes: their source of truth is a website, and
 * tools/validate-banks.mjs checking the built data is the whole story. This one
 * is written by hand, so it has a second source of truth — tools/data/toughest/
 * — and two failure modes the bank validator cannot see:
 *
 *   1. A question that is wrong in a way only its own source shows. A "which
 *      TWO" stem keying one answer, an option set that collapses under the
 *      dedup key, a stem that duplicates one the scraped banks already ship.
 *      validate-banks sees the built file and has no idea what was intended.
 *
 *   2. A build that is stale. Edit a JSON file, forget to rerun the builder,
 *      and every check in the repo passes against yesterday's questions. This
 *      is the failure that costs a whole session, because nothing looks wrong.
 *
 * The number rule below is the one worth understanding. A question's ANSWER may
 * only state a figure the chapter pages state somewhere — the same reading of
 * "what a claim asserts" that tools/verify-bank.mjs uses. Authoring a question
 * whose answer is a number the handbook never prints is how a bank starts
 * teaching a fact the exam will mark wrong, and it is invisible once built:
 * verify-bank's contradiction signal only fires when the located passage
 * happens to carry a rival figure of the same kind.
 */
import fs from "node:fs";
import path from "node:path";
import { R, loadBanks, allQuestions } from "./lib/banks.mjs";
import { loadChapters } from "./lib/chapters.mjs";

const SRC = R("tools/data/toughest");
const BANK_ID = "toughest";
const FIRST_G = 3198;
const FIRST_N = 501;
const PER_TEST = 24;

const fails = [];
const fail = (m) => fails.push(m);

/* ---- the figures the chapters actually print ----
   Same reader as verify-bank.mjs: bare integers 1-12 are dropped (they generate
   noise, not claims), and "57m" is read as 57 because the chapters abbreviate
   where the banks spell out. */
const NUM = /\b(?:£\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]{1,}|\d+)\b/g;
const units = (s) => String(s || "").replace(/(\d)\s?(?:m|bn|k)\b/gi, "$1 ");
const numsRaw = (s) => [...new Set((units(s).match(NUM) || [])
  .map((n) => n.replace(/[\s,]/g, ""))
  .filter((n) => { const v = +n.replace(/[^\d.]/g, ""); return !(v >= 1 && v <= 12 && !/[£%]/.test(n)) }))];
const corpusNums = new Set(loadChapters().flatMap((b) => numsRaw(b.text)));

/* A NOT-stem and a FALSE key both assert the opposite of what they print, so
   their figures are not claims. verify-bank.mjs draws the line in the same place. */
const NEGATED = /\b(?:not|never|except|apart from|incorrect|false)\b/i;
function assertedNums(q) {
  const key = q.o.filter((o) => o[1]).map((o) => o[0]).join(" ").trim().toLowerCase();
  if (key === "false") return [];
  if (NEGATED.test(q.t)) return [];
  if (key === "true") return numsRaw(q.t);
  return numsRaw(q.o.filter((o) => o[1]).map((o) => o[0]).join(" "));
}

/* The engine's dedup key: stem PLUS normalised option set. Must stay identical
   to the one in validate-banks.mjs — a looser key here would let a duplicate
   through, a tighter one would report duplicates the engine does not merge. */
const dupNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (q) => dupNorm(q.t) + " " + q.o.map((o) => dupNorm(o[0])).sort().join("");

/* Questions already shipped by the four scraped banks. This bank's own ids are
   skipped: once toughest-data.js is built it is a loaded bank too, and every
   question would otherwise report as a duplicate of itself. */
const shipped = new Map();
for (const q of allQuestions(loadBanks())) if (q.g < FIRST_G) shipped.set(dupKey(q), q.g);

/* ---- read the source ---- */
if (!fs.existsSync(SRC)) {
  console.error(`no authored source at ${SRC}`);
  process.exit(1);
}
const files = fs.readdirSync(SRC).filter((f) => /^t\d+\.json$/.test(f))
  .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

const seen = new Map();
const source = [];
let total = 0, twoOpt = 0, twoAns = 0;
const topics = [0, 0, 0, 0, 0];

files.forEach((f, i) => {
  const n = +f.match(/\d+/)[0];
  if (n !== FIRST_N + i) fail(`${f} is out of order — expected t${FIRST_N + i}.json (ids are assigned in this order)`);
  let t;
  try { t = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8")) }
  catch (e) { return fail(`${f}: ${e.message}`) }
  if (!t.name) fail(`${f} has no name`);
  if (!Array.isArray(t.q)) return fail(`${f} has no q array`);
  if (t.q.length !== PER_TEST) fail(`${f} has ${t.q.length} questions, expected ${PER_TEST}`);

  t.q.forEach((q, qi) => {
    total++;
    source.push(q);
    const at = `${f} q${qi + 1}`;
    if (!q.t || typeof q.t !== "string") fail(`${at} has no stem`);
    if (!q.e || typeof q.e !== "string") fail(`${at} has no explanation — the Mistakes view and facts.js both read it`);
    if (!Number.isInteger(q.p) || q.p < 0 || q.p > 4) return fail(`${at} has topic ${q.p}, expected 0-4`);
    topics[q.p]++;
    if (!Array.isArray(q.o) || q.o.length < 2) return fail(`${at} has fewer than two options`);
    if (q.o.some((o) => !Array.isArray(o) || typeof o[0] !== "string" || !o[0])) return fail(`${at} has a malformed option`);
    if (q.o.some((o) => o[1] !== 0 && o[1] !== 1)) fail(`${at} has an option flag that is neither 0 nor 1`);

    const right = q.o.filter((o) => o[1]).length;
    if (!right) fail(`${at} has no correct option`);
    if (right === q.o.length) fail(`${at} marks every option correct`);
    if (q.o.length === 2) twoOpt++;
    if (right === 2) twoAns++;

    const norm = q.o.map((o) => dupNorm(o[0]));
    if (new Set(norm).size !== norm.length) {
      fail(`${at}: two options collapse into each other once normalised — ${JSON.stringify(q.o.map((o) => o[0]))}`);
    }

    /* The stem and the key have to agree about how many answers there are. A
       "which TWO" keying one answer is unanswerable; a two-answer question that
       does not say TWO reads as a bug to whoever meets it. */
    const saysTwo = /\bTWO\b/.test(q.t);
    if (saysTwo && right !== 2) fail(`${at} says TWO but keys ${right} answer(s)`);
    if (!saysTwo && right === 2) fail(`${at} keys 2 answers but the stem does not say TWO`);

    const k = dupKey(q);
    if (seen.has(k)) fail(`${at} is a duplicate of ${seen.get(k)} — the engine would collapse them onto one id`);
    else seen.set(k, at);
    if (shipped.has(k)) fail(`${at} duplicates q${shipped.get(k)}, already shipped by a scraped bank`);

    for (const nm of assertedNums(q)) {
      if (!corpusNums.has(nm)) fail(`${at} stakes its answer on the figure ${nm}, which appears nowhere in the chapter pages`);
    }
  });
});

/* ---- and the build must be current ----
   Compared on content, not on mtime: a rebuild that changed nothing is fine,
   and a source edit that never reached the bank is the thing to catch. */
const bank = loadBanks().find((b) => b.id === BANK_ID);
if (!bank) {
  fail(`no "${BANK_ID}" bank is loaded — is toughest-data.js in BANK_FILES and in the page's script tags?`);
} else {
  const built = bank.tests.flatMap((t) => t.q);
  if (built.length !== total) {
    fail(`toughest-data.js holds ${built.length} questions, the source has ${total} — rerun "node tools/build-toughest-data.mjs"`);
  } else {
    const drift = built.filter((b, i) => dupKey(b) !== dupKey(source[i]) || b.e !== source[i].e || b.p !== source[i].p).length;
    if (drift) fail(`${drift} question(s) in toughest-data.js do not match the source — rerun "node tools/build-toughest-data.mjs"`);
    const g = built.map((q) => q.g);
    const contiguous = g.every((v, i) => v === FIRST_G + i);
    if (!contiguous) fail(`ids in toughest-data.js are not ${FIRST_G} upwards in source order — progress is keyed on them, so they must never be reassigned`);
  }
}

/* ---- report ---- */
console.log(`toughest source: ${files.length} test file(s) · ${total} questions · ${twoOpt} two-option · ${twoAns} two-answer`);
console.log(`  topics — society ${topics[0]} · history ${topics[1]} · government ${topics[2]} · values ${topics[3]} · what-is-the-UK ${topics[4]}`);

if (fails.length) {
  console.error(`\n${fails.length} PROBLEM(S):`);
  for (const f of fails) console.error("  ✕ " + f);
  process.exit(1);
}
console.log("All authoring checks pass.");
