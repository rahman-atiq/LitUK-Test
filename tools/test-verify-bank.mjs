#!/usr/bin/env node
/**
 * Pins the human review of tools/verify-bank.mjs.
 *
 *   node tools/test-verify-bank.mjs
 *
 * Phase 5's GO bar is not "the tool runs" — it is "its top flags are worth a
 * human's time", and that is a judgement, not an assertion. It was made once,
 * on 2026-08-12, by reading the top 20 of each chapter-based signal against the
 * chapter pages. This file is that reading, written down so it survives.
 *
 * Every id below was looked at. The MUST-FLAG list is the findings that reading
 * produced; the MUST-NOT list is the false positives it produced, each tagged
 * with the failure mode that caused it. All of them behaved the other way round
 * before the fixes — the MUST-NOT ids were literally the top of the old report,
 * so this file fails loudly against the tool as it stood that morning.
 *
 * The point is threshold changes. Every constant in verify-bank.mjs is a
 * judgement call over prose, and the temptation with a noisy triage tool is to
 * turn a knob until the count looks nice. Turning one now has to keep four real
 * findings and twenty-one ruled-out ones on the right side of the line.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg) };

/* ---------------- run the real tool ---------------- */

let report;
try {
  const raw = execFileSync(process.execPath, [path.join(here, "verify-bank.mjs"), "--json", "--all"],
    { encoding: "utf8", maxBuffer: 64 << 20 });
  report = JSON.parse(raw);
} catch (e) {
  console.error("test-verify-bank: could not run verify-bank.mjs --json\n" + (e.stderr || e.message));
  process.exit(1);
}

const flagged = new Map();                 // question id -> Set of signal kinds
for (const f of report.findings) {
  if (!flagged.has(f.g)) flagged.set(f.g, new Set());
  flagged.get(f.g).add(f.kind);
}
const has = (g, kind) => flagged.has(g) && flagged.get(g).has(kind);

/* ---------------- the findings the review kept ----------------
   Four facts. Each is the bank stating a figure the chapters contradict, and in
   every case the bank is describing the world as it is now while the chapters
   describe the handbook edition the exam is set from — which is precisely the
   direction of error that costs marks. */
const MUST_FLAG = [
  [194, "contradiction", "Commonwealth: bank says 56 member states, chapters say 54"],
  [748, "contradiction", "Commonwealth: the second copy of the same disagreement"],
  [170, "contradiction", "small claims: bank says £10,000, chapters say £5,000"],
  [142, "contradiction", "small claims, second phrasing"],
  [22, "contradiction", "small claims, third phrasing"],
  [735, "contradiction", "small claims, fourth phrasing"],
  [112, "contradiction", "jury service: bank says 18-75, chapters say 18-70"],
  [7, "contradiction", "Brexit: bank asserts 2020, which the chapters never mention"],
];

for (const [g, kind, what] of MUST_FLAG) {
  ok(has(g, kind), `q${g} should still be flagged as ${kind} — ${what}`);
}

/* ---------------- the false positives the review ruled out ----------------
   Grouped by what was wrong with them, because a regression will come back as a
   group and the group name is the diagnosis. */
const MUST_NOT = [
  /* A lifespan or a birth year printed beside the answer, in a question that is
     not about dates at all. 92 questions carry one. */
  [817, "contradiction", "lifespan: 'born in Italy ... in 1820', asked about the country"],
  [1209, "contradiction", "lifespan: Bobby Moore (1941-1993), asked about the sport"],
  [255, "contradiction", "lifespan: Ian Botham (1955-), asked about the sport"],
  [724, "contradiction", "lifespan: Andy Murray (1987-), asked who he is"],
  [105, "contradiction", "birth year: Pankhurst born Manchester 1858, asked about the city"],
  /* "1941-93" and "25-Mar-57" — a year cut in half by its own formatting. */
  [224, "contradiction", "truncated range: '1941-93' read as the number 93"],
  [749, "contradiction", "truncated range, on the question whose answer 1966 is correct"],
  [833, "contradiction", "date format: '25-Mar-57' read as the number 57"],
  /* A metric conversion of a figure the same sentence already gave in miles.
     1,865 and 2,170 also pass for years, so they were argued against dates. */
  [1396, "contradiction", "conversion: 1,865 km² of Loch Lomond, asked which country"],
  [1581, "contradiction", "conversion: 2,170 and 1,865 km², asked which are landmarks"],
  [521, "contradiction", "conversion: 2,292 km² of the Lake District"],
  [970, "contradiction", "conversion: 2,170 km² of Snowdonia, asked what Snowdon is"],
  /* A cross-reference to a page of a book this repo does not contain. */
  [1399, "contradiction", "page reference: '(see page 134)' in the Scottish jury answer"],
  /* A clock face read as two integers. */
  [769, "contradiction", "clock time: '11:00' opening hours read as the number 00"],
  [487, "contradiction", "clock time, second pub question"],
  /* The chapters DO state the figure — somewhere other than the block the
     locator picked. This was the largest group once the above were gone. */
  [602, "contradiction", "corroborated: Scottish jury of 15 is in the number stones"],
  [1588, "contradiction", "corroborated: the same jury fact, other bank"],
  [974, "contradiction", "corroborated: WWI ends 1918, under a heading saying so"],
  [340, "contradiction", "corroborated: WWI begins 1914, likewise"],
  [653, "contradiction", "corroborated: voting age 1969 is stated twice"],
  [1145, "contradiction", "corroborated: voting age reduced to 18, likewise"],
  [1068, "contradiction", "corroborated: England is 84% of the population, the chant"],
  [1743, "contradiction", "corroborated: Mahomet's 1759, which the chapters bracket"],
  [1269, "contradiction", "corroborated: 'For 400 years the Romans rule', two blocks over"],
  [344, "contradiction", "abbreviation: the curve gives 1998 as '57m', not '57 million'"],
  [884, "contradiction", "abbreviation: the same population figure, other phrasing"],
  /* A stem asking which option is NOT true keys the unsupported one on purpose. */
  [1322, "contradiction", "negated stem: 1928 is keyed BECAUSE Britain did not host"],
  /* Claims the printed passage itself supports — the verbosity bug. */
  [1285, "unsupported", "the cited block reads 'Membership is voluntary'"],
  [663, "unsupported", "the cited block reads 'Environment: recycle ...'"],
];

for (const [g, kind, why] of MUST_NOT) {
  ok(!has(g, kind), `q${g} should no longer be flagged as ${kind} — ${why}`);
}

/* ---------------- properties that hold whatever the thresholds ---------------- */

ok(report.counts.conflict === 0,
  `cross-bank conflicts should still be 0, got ${report.counts.conflict} — read them, this signal needs no ground truth`);

ok(report.counts.contradiction > 0 && report.counts.contradiction <= 30,
  `contradiction flags should be a list a human reads in one sitting, got ${report.counts.contradiction}`);

ok(report.counts.unsupported <= 150,
  `unsupported flags should stay triageable, got ${report.counts.unsupported}`);

/* The four facts above are what the signal exists to find. If a change leaves
   the counts healthy but drops every real finding, the counts are lying. */
const FACTS = [[194, 748], [170, 142, 22, 735], [112], [7]];
const found = FACTS.filter((ids) => ids.some((g) => has(g, "contradiction"))).length;
ok(found === FACTS.length,
  `all ${FACTS.length} reviewed findings should survive, ${found} did`);

/* Nothing may be flagged twice by the same signal, and every id must be real. */
const seen = new Set();
for (const f of report.findings) {
  const k = `${f.kind}:${f.g}`;
  if (seen.has(k)) fails.push(`q${f.g} appears twice under ${f.kind}`);
  seen.add(k);
}
checks++;
ok(report.findings.every((f) => Number.isInteger(f.g) && f.g >= 0 && f.g <= 1889),
  "every flag should name a question id inside the bank's range");

/* ---------------- report ---------------- */

console.log(`verify-bank: ${report.counts.conflict} conflict · ${report.counts.contradiction} contradiction · ${report.counts.unsupported} unsupported`);
if (fails.length) {
  console.error(`\n${fails.length} of ${checks} checks failed:\n`);
  for (const f of fails) console.error("  ✗ " + f);
  console.error(`\nThese encode a reading of the report done on 2026-08-12. If a change`);
  console.error(`makes one wrong, re-read that flag against the chapter pages and update`);
  console.error(`the list with what you found — do not delete the line to get to green.`);
  process.exit(1);
}
console.log(`${checks} checks pass.`);
console.log(`\nReviewed 2026-08-12: ${MUST_FLAG.length} findings kept, ${MUST_NOT.length} false positives ruled out.`);
console.log(`The 4 findings are the Commonwealth's member count, the small-claims limit,`);
console.log(`the jury age range and the Brexit date — in every case the bank is current`);
console.log(`and the chapters are the handbook edition the exam is set from.`);
