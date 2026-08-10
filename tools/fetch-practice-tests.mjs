#!/usr/bin/env node
/**
 * Fetches and parses the 39 LifeInTheUKTest.com practice tests.
 *
 *   node tools/fetch-practice-tests.mjs          # fetch (cached), parse, report
 *   node tools/fetch-practice-tests.mjs --fresh  # ignore the cache
 *
 * Pages are server-rendered and carry the whole question set — options, correct
 * answers, explanations and a chapter reference — inside .faq_container blocks.
 * Each page is cached to tools/.cache/practice-tests/ so re-runs cost nothing
 * and the parser can be iterated on without touching the network again.
 *
 * Exports parse() and loadAll() for tools/build-practice-data.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", ".cache", "practice-tests");

export const TEST_COUNT = 39;
export const PER_TEST = 24;

const URL_FOR = (n) => `https://lifeintheuktest.com/test-${n}/`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- text ---------------- */

const ents = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'",
  "&#8217;": "’", "&#8216;": "‘", "&#8220;": "“", "&#8221;": "”",
  "&#8211;": "–", "&#8212;": "—", "&nbsp;": " ", "&hellip;": "…",
  "&pound;": "£", "&eacute;": "é",
};
const dec = (s) => s.replace(/&#(\d+);|&[a-z]+;/gi, (m) =>
  ents[m.toLowerCase()] ?? (m[1] === "#" ? String.fromCharCode(+m.slice(2, -1)) : m));
const txt = (h) => dec(h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
  .replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();

/* ---------------- parser ----------------
   Verified 100% across all 39 pages. The one non-obvious bit: correct answers
   arrive as a comma-joined string, and splitting on commas shreds any option
   that itself contains a comma. Matching option texts longest-first and
   asserting nothing is left over is what gets 936/936. */

export function parse(html) {
  const faqs = [...html.matchAll(
    /<div class="faq">([\s\S]*?)<div class="faq_answer_container">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)];
  const out = [];
  for (const [, qBlock, aBlock] of faqs) {
    const title = qBlock.match(/<div class="question-title">([\s\S]*?)<\/div>/);
    if (!title) continue;
    const t = txt(title[1]).replace(/^\d+\.\s*/, "");
    const opts = [...qBlock.matchAll(/<span class="options">([\s\S]*?)<\/span>/g)].map((m) => txt(m[1]));
    const ansRaw = aBlock.match(/<strong>Correct Answer:<\/strong>([\s\S]*?)<br\s*\/?>/);
    const expl = aBlock.match(/<strong>Explanation:<\/strong>([\s\S]*?)<br\s*\/?>\s*<strong>Reference:/);
    const ref = aBlock.match(/<strong>Reference:<\/strong>([\s\S]*?)<br\s*\/?>/);
    if (!ansRaw || !opts.length) { out.push({ bad: "missing", t }); continue; }

    // Resolve the comma-joined answer string against real option texts, longest
    // first, so options containing commas cannot be shredded by a naive split.
    let rest = txt(ansRaw[1]);
    const picked = new Set();
    for (const o of [...opts].sort((a, b) => b.length - a.length)) {
      const i = rest.indexOf(o);
      if (i >= 0) { picked.add(opts.indexOf(o)); rest = rest.slice(0, i) + rest.slice(i + o.length); }
    }
    const leftover = rest.replace(/[,\s]/g, "");
    out.push({
      t, o: opts.map((text, i) => [text, picked.has(i) ? 1 : 0]),
      e: expl ? txt(expl[1]) : "", ref: ref ? txt(ref[1]) : "",
      bad: !picked.size ? "no-answer" : leftover ? "leftover:" + leftover : null,
    });
  }
  return out;
}

/* ---------------- fetch ---------------- */

async function page(n, { fresh = false } = {}) {
  const file = path.join(CACHE, `test-${n}.html`);
  if (!fresh && fs.existsSync(file)) return { html: fs.readFileSync(file, "utf8"), cached: true };

  const res = await fetch(URL_FOR(n), {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`test-${n}: HTTP ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, html);
  return { html, cached: false };
}

/**
 * All 39 tests, parsed. Returns [{ n, url, questions: [...] }] where n is the
 * source test number (1–39), not the number the app will use.
 */
export async function loadAll({ fresh = false, quiet = false } = {}) {
  const tests = [];
  for (let n = 1; n <= TEST_COUNT; n++) {
    const { html, cached } = await page(n, { fresh });
    const questions = parse(html);
    tests.push({ n, url: URL_FOR(n), questions });
    if (!quiet) {
      const bad = questions.filter((q) => q.bad);
      console.log(
        `test-${String(n).padStart(2)}  ${String(questions.length).padStart(2)} questions` +
        `  ${bad.length ? `${bad.length} PROBLEM(S)` : "ok"}${cached ? "  (cached)" : ""}`
      );
    }
    if (!cached && n < TEST_COUNT) await sleep(DELAY_MS);   // be a polite guest
  }
  return tests;
}

/* ---------------- report ---------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = process.argv.includes("--fresh");
  const tests = await loadAll({ fresh });

  const all = tests.flatMap((t) => t.questions);
  const problems = tests.flatMap((t) =>
    t.questions.filter((q) => q.bad).map((q) => `test-${t.n}: ${q.bad} — ${q.t.slice(0, 70)}`));
  const wrongCount = tests.filter((t) => t.questions.length !== PER_TEST);

  console.log(`\n${tests.length} tests · ${all.length} questions · ${problems.length} parse problems`);
  console.log(`explanations present   ${all.filter((q) => q.e).length} / ${all.length}`);
  console.log(`references present     ${all.filter((q) => q.ref).length} / ${all.length}`);
  console.log(`multi-answer           ${all.filter((q) => q.o && q.o.filter((o) => o[1]).length > 1).length}`);

  for (const t of wrongCount) console.log(`!! test-${t.n} has ${t.questions.length} questions, expected ${PER_TEST}`);
  for (const p of problems.slice(0, 20)) console.log(`!! ${p}`);

  const ok = tests.length === TEST_COUNT && !wrongCount.length && !problems.length;
  console.log(ok ? "\nGO — 39 × 24, 0 parse problems." : "\nNO GO — see above.");
  if (!ok) process.exit(1);
}
