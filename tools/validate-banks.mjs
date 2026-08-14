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

/* ---- id and test-number blocks (INV-2 / INV-3) ----
   Each bank owns a block of both number spaces and the blocks never move.
   Progress is keyed on those numbers, so a test or a question that drifts out
   of its block is one step from colliding with another bank's — and the
   collision above only catches it once the two actually overlap. This catches
   the drift itself, while it is still harmless.

   The two older banks are pinned by EXISTING_MAX_G / EXISTING_MAX_N above. */
const BLOCKS = {
  testprep: { g: [1890, Infinity], n: [[201, 238], [301, 311]] },
};
const showRange = ([lo, hi]) => `${lo}-${hi === Infinity ? "∞" : hi}`;
for (const b of banks) {
  const blk = BLOCKS[b.id];
  if (!blk) continue;
  const badN = b.tests.filter((t) => !blk.n.some(([lo, hi]) => t.n >= lo && t.n <= hi)).map((t) => t.n);
  const badG = [...new Set(b.tests.flatMap((t) => t.q.map((q) => q.g)))]
    .filter((g) => g < blk.g[0] || g > blk.g[1]);
  if (badN.length) fail(`INV-3: test number(s) ${badN.slice(0, 5).join(", ")}${badN.length > 5 ? `, +${badN.length - 5} more` : ""} in "${b.id}" are outside its block ${blk.n.map(showRange).join(" / ")}`);
  if (badG.length) fail(`INV-2: question id(s) ${badG.slice(0, 5).join(", ")}${badG.length > 5 ? `, +${badG.length - 5} more` : ""} in "${b.id}" are outside its block ${showRange(blk.g)}`);
}

/* ---- kind, x and r, and the assertion that keeps the differentiation honest ----
   testprep.uk is one pool of questions sliced two ways: 38 mock tests and 11
   exam tests, and 261 of the 263 exam questions also sit in a mock. So exam-ness
   rides on the question as `x:1`, not on a bank boundary — which is the only
   reason the badge can fire on a question you first met in Mock 12.

   `x` is DERIVED, never authored (INV-9). The moment someone hand-sets it — or
   a rebuild drops a slot's copy of it — the badge starts claiming a question was
   asked in a real exam when nothing in the data says so, and there is no screen
   anywhere that would look wrong. This is that screen. */
const KINDS = ["mock", "exam"];
const examCount = new Map();               // bank id -> question ids carrying x:1
for (const b of banks) {
  const slots = b.tests.flatMap((t) => t.q);
  if (b.tests.some((t) => t.kind !== undefined)) {
    for (const t of b.tests) {
      if (t.kind === undefined) fail(`test ${t.n} in "${b.id}" has no kind, but other tests in the bank declare one — the dashboard splits on it, so an undeclared test lands in neither section`);
      else if (!KINDS.includes(t.kind)) fail(`test ${t.n} in "${b.id}" has kind "${t.kind}", expected one of ${KINDS.join(" / ")}`);
    }
  }
  /* Reachable from a kind:"exam" test in this bank — the whole of what x means. */
  const examG = new Set();
  for (const t of b.tests) if (t.kind === "exam") for (const q of t.q) examG.add(q.g);
  const badVal = [...new Set(slots.filter((q) => q.x !== undefined && q.x !== 1).map((q) => q.g))];
  const stray = [...new Set(slots.filter((q) => q.x === 1 && !examG.has(q.g)).map((q) => q.g))];
  const absent = [...new Set(slots.filter((q) => q.x === undefined && examG.has(q.g)).map((q) => q.g))];
  const badR = [...new Set(slots.filter((q) => q.r !== undefined && (!Number.isInteger(q.r) || q.r < 1 || q.r > 5)).map((q) => q.g))];
  const list = (a) => a.slice(0, 5).join(", ") + (a.length > 5 ? `, +${a.length - 5} more` : "");
  if (badVal.length) fail(`INV-9: q${list(badVal)} in "${b.id}" carr(ies) an x that is neither 1 nor absent — x is a flag, not a count`);
  if (stray.length) fail(`INV-9: q${list(stray)} in "${b.id}" carr(ies) x:1 but appear(s) in no kind:"exam" test — x is derived from exam membership, never hand-written, so this is a badge claiming an exam sighting the data does not support`);
  if (absent.length) fail(`INV-9: q${list(absent)} in "${b.id}" appear(s) in a kind:"exam" test but carr(ies) no x — every slot of an exam question needs it, or the badge fires on some of its tests and not others`);
  if (badR.length) fail(`q${list(badR)} in "${b.id}" has a rating that is not an integer 1-5`);
  examCount.set(b.id, examG.size);
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
const UNIQUE_EXPECT = 2757;            // the count both the engine and the hub carry
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

/* ---- facts.js (INV-7) ----
   Every fact card must be a slice of an explanation that is actually in the
   bank, and every chapter link must point at a page that exists. The file is
   generated, so the only way it goes wrong is a bank edit that moves an
   explanation out from under an offset — which would show a fact card that
   starts mid-word, or worse, reads as a different claim. */
const factsPath = R("facts.js");
if (!fs.existsSync(factsPath)) {
  fail(`facts.js is missing — run "node tools/build-facts.mjs" (the Mistakes view's fact cards and "read why" links come from it)`);
} else {
  const w = {};
  new Function("window", fs.readFileSync(factsPath, "utf8"))(w);
  const F = w.LITUK_FACTS;
  if (!F || !F.cut || !F.link || !F.targets || !F.files) fail(`facts.js did not define a usable window.LITUK_FACTS`);
  else {
    /* Same canonical set the engine drills: one question per piece of content. */
    const canonQ = new Map();
    for (const q of [...uniq.values()].map((g) => g.sort((a, b) => a.g - b.g)[0])) canonQ.set(q.g, q);
    let badCut = 0, orphan = 0, badLink = 0, stale = 0;
    for (const [g, c] of Object.entries(F.cut)) {
      const q = canonQ.get(+g);
      if (!q) { orphan++; continue; }
      const s = (q.e || "").substr(c[0], c[1]);
      if (!s || s.length !== c[1] || !(q.e || "").includes(s)) badCut++;
    }
    for (const [g, i] of Object.entries(F.link)) {
      if (!canonQ.has(+g)) { orphan++; continue; }
      const t = F.targets[i];
      if (!t || !F.files[t[0]] || !fs.existsSync(R(F.files[t[0]][0]))) badLink++;
    }
    stale = [...canonQ.keys()].filter((g) => F.cut[g] === undefined && F.link[g] === undefined).length;
    if (badCut) fail(`facts.js has ${badCut} fact slice(s) that no longer land inside their explanation — the banks moved, rerun tools/build-facts.mjs`);
    if (orphan) fail(`facts.js carries ${orphan} entr(ies) for question ids that are not canonical any more — rerun tools/build-facts.mjs`);
    if (badLink) fail(`facts.js has ${badLink} chapter link(s) pointing at a file that is not in the repo`);
    if (stale > uniq.size * 0.05) fail(`facts.js covers neither a fact nor a link for ${stale} of ${uniq.size} questions — that is more than the 5% the builder should leave behind, so it is out of date`);
    console.log(`facts.js: ${Object.keys(F.cut).length} fact cards · ${Object.keys(F.link).length} chapter links · ${F.targets.length} targets`);
  }
}

/* ---- search-index.js ----
   The hub's search box is the only way into one specific question, and the
   index is generated. Edit a bank without rebuilding it and the box searches
   the old text: new questions cannot be found at all, and a search that finds
   nothing is indistinguishable from a search with no matches. Nothing here
   looked at the index until now, which made PLAN-testprep-source.md §Phase 3's
   "both are validator-enforced" half true. It is true now. */
const idxPath = R("search-index.js");
if (!fs.existsSync(idxPath)) {
  fail(`search-index.js is missing — run "node tools/build-search-index.mjs" (the hub's search box reads it)`);
} else {
  const w = {};
  new Function("window", fs.readFileSync(idxPath, "utf8"))(w);
  const I = w.LITUK_INDEX;
  if (!I || !Array.isArray(I.qs) || !Array.isArray(I.blocks) || !Array.isArray(I.topics)) {
    fail(`search-index.js did not define a usable window.LITUK_INDEX`);
  } else {
    const indexed = new Map(I.qs.map((r) => [r[0], r]));
    const missing = [...gSeen.keys()].filter((g) => !indexed.has(g));
    const orphan = [...indexed.keys()].filter((g) => !gSeen.has(g));
    const drift = [...indexed.values()].filter((r) => canonical.has(r[0]) && canonical.get(r[0]).t !== r[3]).length;
    const near = (a) => a.slice(0, 3).join(", ") + (a.length > 3 ? ", …" : "");
    if (missing.length) fail(`search-index.js has no entry for ${missing.length} question(s) that are in the banks (${near(missing)}) — rerun tools/build-search-index.mjs`);
    if (orphan.length) fail(`search-index.js carries ${orphan.length} question id(s) no bank holds any more (${near(orphan)}) — rerun tools/build-search-index.mjs`);
    if (drift) fail(`search-index.js has ${drift} question(s) whose indexed text no longer matches the bank — rerun tools/build-search-index.mjs`);
    if (JSON.stringify(I.topics) !== JSON.stringify(TOPICS)) fail(`search-index.js ships a topic list that does not match tools/lib/banks.mjs — rerun tools/build-search-index.mjs`);
    console.log(`search-index.js: ${I.qs.length} questions · ${I.blocks.length} chapter blocks`);
  }
}

/* ---- the twist material Phase 3 is built on ----
   The Twist Gauntlet exists because 509 questions have two options. If a bank
   edit collapses that number the gauntlet quietly becomes a short drill, and
   the mode that trains the exam's hardest format stops being worth opening. */
if (!/const TWO_OPT=POOL\.filter\(q=>q\.o\.length===2\)/.test(engineSrc)) {
  fail(`life-in-uk-mock-tests.html no longer builds TWO_OPT from the two-option questions — the Twist Gauntlet has nothing to serve`);
}
if (twoOption < 300) fail(`only ${twoOption} two-option questions remain (was 509) — the Twist Gauntlet is built on them`);
/* INV-7 as it applies to the Date Gauntlet: it may re-frame, never write. Its
   options come from YEAR_POOL (years already in the bank) and from question
   stems, verbatim. A future edit that starts composing option text would not
   fail any other check here. */
for (const [name, re] of [["dateForward", /function dateForward\(/], ["dateReverse", /function dateReverse\(/],
                          ["YEAR_POOL", /const YEAR_POOL=/], ["clusterOrder", /function clusterOrder\(/]]) {
  if (!re.test(engineSrc)) fail(`life-in-uk-mock-tests.html has no ${name}() — Phase 3's gauntlets are gone or renamed`);
}

/* ---- readiness, and the numbers it must never fake (Phase 4) ----
   The pass probability is the headline on both the dashboard and the hub, so
   the two things that make it honest are worth a build failure: an unseen
   question contributes its guess rate rather than a zero, and the same saved
   progress always produces the same number. A wobbling headline is a headline
   nobody believes, and a floor of zero makes coverage look like knowledge. */
for (const [name, re] of [["readiness", /function readiness\(/], ["guessRate", /function guessRate\(/],
                          ["pKnow", /function pKnow\(/], ["calibration", /function calibration\(/],
                          ["renderCram", /function renderCram\(/], ["noteRecent", /function noteRecent\(/]]) {
  if (!re.test(engineSrc)) fail(`life-in-uk-mock-tests.html has no ${name}() — Phase 4's readiness model or cram sheet is gone or renamed`);
}
if (!/if\(!e\)return floor;/.test(engineSrc)) {
  fail(`pKnow() no longer floors an unseen question at its guess rate — a bank you have never opened would read as a 0% chance of passing, and coverage would look like knowledge`);
}
const seed = engineSrc.match(/MC_SEED=(0x[0-9a-f]+|\d+)/i);
if (!seed) fail(`life-in-uk-mock-tests.html has no MC_SEED — the Monte Carlo is unseeded, so the pass probability moves a point or two on every reload`);
const revealed = engineSrc.match(/const REVEALED_W=(\.?\d*\.?\d+)/);
if (!revealed) fail(`could not find REVEALED_W in life-in-uk-mock-tests.html`);
else if (!(+revealed[1] < 1)) fail(`REVEALED_W is ${revealed[1]} — a best score set with the answers on screen must count for LESS than a blind one, not the same or more`);
/* The final week serves nothing new. A drill that introduces fresh material
   six days out is spending the last hours on questions there is no time to
   learn, and it is the one mix ratio that must stay at zero. */
const finalMix = engineSrc.match(/final:\s*\{due:\.?\d*\.?\d+,mistake:\.?\d*\.?\d+,new:(\.?\d*\.?\d+)\}/);
if (!finalMix) fail(`could not find the final-week entry in MIX in life-in-uk-mock-tests.html`);
else if (+finalMix[1] !== 0) fail(`MIX.final.new is ${finalMix[1]} — the last six days must serve no new questions`);
if (!/@media print\{/.test(engineSrc)) fail(`life-in-uk-mock-tests.html has no print stylesheet — the cram sheet prints the dark theme as a black rectangle`);
/* The hub cannot model anything (no bank data), so it reads what the engine
   left in S.readiness. Both halves have to exist or the tile is blank. */
const hubSrc = fs.readFileSync(R("index.html"), "utf8");
if (!/S\.readiness=/.test(engineSrc)) fail(`the engine never writes S.readiness — the hub's pass-chance tile has nothing to read`);
if (!/M\.readiness/.test(hubSrc)) fail(`index.html does not read M.readiness — the hub is still leading on tests passed`);
if (!/M\.recent/.test(hubSrc)) fail(`index.html does not read M.recent — the hub is still showing lifetime accuracy`);

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
const hub = hubSrc;
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
  const kinds = KINDS.map((k) => `${b.tests.filter((t) => t.kind === k).length} ${k}`).filter((s) => !s.startsWith("0 "));
  const ex = examCount.get(b.id);
  console.log(`  ${b.id.padEnd(9)} ids ${Math.min(...gs)}-${Math.max(...gs)}  tests ${Math.min(...ns)}-${Math.max(...ns)}` +
    `${kinds.length ? `  ${kinds.join(" / ")} · ${ex} exam question${ex === 1 ? "" : "s"}` : ""}  ${b.source}`);
}

if (fails.length) {
  console.error(`\n${fails.length} PROBLEM(S):`);
  for (const f of fails) console.error("  ✕ " + f);
  process.exit(1);
}
console.log("\nAll checks pass.");
