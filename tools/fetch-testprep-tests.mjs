#!/usr/bin/env node
/**
 * Fetches and parses the 89 TestPrep.UK test pages.
 *
 *   node tools/fetch-testprep-tests.mjs          # fetch (cached), parse, report
 *   node tools/fetch-testprep-tests.mjs --fresh  # ignore the cache
 *
 * 49 of them are content: 38 mock tests (/test-N) and 11 exam tests (/exam-N).
 * The other 40 are the chapter-organised tests (/chapter-C-test-N), which are
 * NOT imported — they are fetched because each one states the handbook chapter
 * for its questions, which is ground truth for the topic mapping that
 * build-testprep-data.mjs would otherwise have to guess. See
 * PLAN-testprep-source.md §4.
 *
 * Pages are server-rendered — quiz.js reads the questions back out of the DOM —
 * so every question, its options, correct answers, explanation, reference and
 * star rating are already in the markup as data attributes. Each page is cached
 * to tools/.cache/testprep-tests/ so re-runs cost nothing and the parser can be
 * iterated on without touching the network again.
 *
 * Exports parse() and loadAll() for tools/build-testprep-data.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", ".cache", "testprep-tests");

export const MOCK_COUNT = 38;
export const EXAM_COUNT = 11;
/** Chapter C has this many tests. 40 in total. */
export const CHAPTER_TESTS = { 1: 1, 2: 1, 3: 13, 4: 13, 5: 12 };
export const PER_TEST = 24;

const BASE = "https://testprep.uk/life-in-the-uk-test";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every page to fetch, in a fixed order. First-seen id assignment in the
 *  builder depends on mock 1-38 coming before exam 1-11, so this order is
 *  load-bearing (INV-2). */
export const PAGES = [];
for (let n = 1; n <= MOCK_COUNT; n++) PAGES.push({ slug: `test-${n}`, kind: "mock", n });
for (let n = 1; n <= EXAM_COUNT; n++) PAGES.push({ slug: `exam-${n}`, kind: "exam", n });
for (const c of [1, 2, 3, 4, 5]) {
  for (let n = 1; n <= CHAPTER_TESTS[c]; n++) {
    PAGES.push({ slug: `chapter-${c}-test-${n}`, kind: "chapter", n, chapter: c });
  }
}
/** The 49 pages that become the bank. */
export const isContent = (p) => p.kind === "mock" || p.kind === "exam";

/* ---------------- text ----------------
   Same helpers as fetch-practice-tests.mjs, plus hex entities: the data
   attributes here are escaped (&#34;, &lt;b&gt;) and have to be decoded before
   the JSON inside them will parse. */

const ents = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'",
  "&#8217;": "’", "&#8216;": "‘", "&#8220;": "“", "&#8221;": "”",
  "&#8211;": "–", "&#8212;": "—", "&nbsp;": " ", "&hellip;": "…",
  "&pound;": "£", "&eacute;": "é", "&apos;": "'",
};
const dec = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);|&[a-z]+;/gi, (m) =>
    ents[m.toLowerCase()] ?? (m[1] === "#" ? String.fromCodePoint(+m.slice(2, -1)) : m));
const txt = (h) => dec(h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
  .replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();

/** A data-* attribute: entity-decode, then JSON.parse. Returns undefined when
 *  the attribute is missing or empty (data-reference="" is common and means
 *  "no reference", not "broken"), and null when the JSON will not parse, so
 *  the caller can tell those two apart. */
function attrJSON(block, name) {
  const m = block.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  if (!m || !m[1].trim()) return undefined;
  try { return JSON.parse(dec(m[1])); } catch { return null; }
}

/* ---------------- parser ----------------
   One .question div per question, carrying everything as data attributes.
   Two things make this source much cheaper than lifeintheuktest.com:

   - data-answers is an array of option INDICES, so multi-answer questions need
     no matching of answer text against option text at all.
   - "Select N correct answer" is an independent statement of how many answers
     there should be, so asserting selectN === data-answers.length turns "the
     parser probably works" into a measurement. */

const BLOCK_RE = /<div class="question(?: [^"]*)?" id="question-(\d+)"([\s\S]*?)(?=<div class="question(?: [^"]*)?" id="question-\d+"|<div class="question-navigator|<script|$)/g;

export function parse(html) {
  const out = [];
  for (const [, idx, block] of html.matchAll(BLOCK_RE)) {
    const q = { i: +idx };
    const bad = [];

    const title = block.match(/<h3 class="questionDescription"[^>]*>([\s\S]*?)<\/h3>/);
    q.t = title ? txt(title[1]) : "";
    if (!q.t) bad.push("no question text");

    // Options come from their labels, which carry the option index explicitly.
    // Trusting the index rather than array position is what makes data-answers
    // safe to use directly.
    const opts = [];
    for (const [, , oi, inner] of block.matchAll(
      /<label for="option-(\d+)-(\d+)"[^>]*>([\s\S]*?)<\/label>/g)) {
      const span = inner.match(/<span class="option-text">([\s\S]*?)<\/span>/);
      const img = inner.match(/<img[^>]+src="([^"]+)"/);
      opts[+oi] = span ? txt(span[1]) : img ? { img: img[1] } : "";
    }
    if (opts.length < 2 || [...opts.keys()].some((i) => opts[i] === undefined)) bad.push("options not 0..n-1");
    if (opts.some((o) => o && o.img)) bad.push("image option");
    if (opts.some((o) => typeof o === "string" && !o)) bad.push("empty option");

    const ans = attrJSON(block, "data-answers");
    if (!Array.isArray(ans) || !ans.length) bad.push("no data-answers");
    else if (ans.some((a) => !Number.isInteger(a) || a < 0 || a >= opts.length)) bad.push("answer index out of range");
    else if (new Set(ans).size !== ans.length) bad.push("duplicate answer index");
    else if (ans.length >= opts.length) bad.push("every option correct");

    // The free integrity check: the page says how many answers it expects.
    const sel = block.match(/<div class="select-correct-options">\s*Select (\d+) correct answer/i);
    q.selectN = sel ? +sel[1] : null;
    if (!sel) bad.push("no Select N");
    else if (Array.isArray(ans) && ans.length !== +sel[1]) bad.push(`Select ${sel[1]} but ${ans.length} answer(s)`);

    // The explanation is a JSON *string* of HTML. The engine renders through
    // esc(), so the <b> wrappers have to come off here or they show on screen.
    const expl = attrJSON(block, "data-explanation");
    if (expl === null) bad.push("unparseable data-explanation");
    q.e = typeof expl === "string" ? txt(expl) : "";
    if (!q.e) bad.push("no explanation");

    // data-reference is an array of handbook URLs; the last path segment is the
    // section slug, which the builder falls back on for topic mapping.
    const ref = attrJSON(block, "data-reference");
    if (ref === null) bad.push("unparseable data-reference");
    q.refs = Array.isArray(ref) ? ref.filter((u) => typeof u === "string") : [];
    q.slugs = q.refs.map((u) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()).filter(Boolean);

    // rated-0 is the site's "not rated yet" state, not a zero-star rating —
    // 165 of the 2,136 questions carry it. Report it as absent so the builder
    // simply omits r rather than emitting an out-of-range 0.
    const rated = block.match(/class="question-rating[^"]*\brated-(\d)\b[^"]*"/);
    q.r = rated && +rated[1] > 0 ? +rated[1] : null;
    if (!rated) bad.push("no rated-N class");
    else if (+rated[1] > 5) bad.push(`rating ${rated[1]}`);

    q.o = opts.map((text, i) => [text, Array.isArray(ans) && ans.includes(i) ? 1 : 0]);
    q.bad = bad.length ? bad.join("; ") : null;
    out.push(q);
  }
  return out;
}

/* ---------------- the JSON-LD cross-check ----------------
   Every page also ships a schema.org FAQPage listing each question with its
   accepted answer as TEXT. It is written by a different code path than the
   data-answers indices, so agreeing with it is real evidence that index 2 is
   the option we think it is — the one assumption this parser rests on. */

export function faqAnswers(html) {
  // Pages carry two ld+json blocks; take whichever one is the FAQPage. Parsing
  // each in full matters — a regex that stops at the first "}" after "FAQPage"
  // truncates the JSON and silently yields nothing to check against.
  let data = null;
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(body); } catch { continue; }
    if (d && d["@type"] === "FAQPage") { data = d; break; }
  }
  if (!data || !Array.isArray(data.mainEntity)) return null;
  return data.mainEntity.map((e) => ({
    t: txt(String(e.name ?? "")),
    a: txt(String(e.acceptedAnswer?.text ?? "")),
  }));
}

/** Does the schema.org answer text agree with the options data-answers picked? */
export function faqAgrees(q, faq) {
  if (!faq) return true;                       // nothing to check against
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (norm(faq.t) !== norm(q.t)) return false;
  const picked = q.o.filter((o) => o[1]).map((o) => norm(o[0]));
  const got = norm(faq.a);
  // Multi-answer joins with " and ", which normalises away; comparing the
  // concatenation both ways avoids caring about the join or the order.
  return picked.join("") === got.replace(/and/g, "") || picked.every((p) => got.includes(p));
}

/* ---------------- fetch ---------------- */

async function page(slug, { fresh = false } = {}) {
  const file = path.join(CACHE, `${slug}.html`);
  if (!fresh && fs.existsSync(file)) return { html: fs.readFileSync(file, "utf8"), cached: true };

  const res = await fetch(`${BASE}/${slug}`, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, html);
  return { html, cached: false };
}

/**
 * All 89 pages, parsed. Returns [{ slug, kind, n, chapter, url, questions }]
 * in PAGES order — mock 1-38, exam 1-11, then the chapter tests. `n` is the
 * source test number, not the number the app will use.
 *
 * `only` narrows to a kind ("mock" | "exam" | "chapter") when you want just the
 * content pages or just the topic ground truth.
 */
export async function loadAll({ fresh = false, quiet = false, only = null } = {}) {
  const want = PAGES.filter((p) => !only || p.kind === only);
  const tests = [];
  for (let i = 0; i < want.length; i++) {
    const p = want[i];
    const { html, cached } = await page(p.slug, { fresh });
    const questions = parse(html);
    tests.push({ ...p, url: `${BASE}/${p.slug}`, questions, faq: faqAnswers(html) });
    if (!quiet) {
      const bad = questions.filter((q) => q.bad);
      console.log(
        `${p.slug.padEnd(20)} ${String(questions.length).padStart(2)} questions` +
        `  ${bad.length ? `${bad.length} PROBLEM(S)` : "ok"}${cached ? "  (cached)" : ""}`
      );
    }
    if (!cached && i < want.length - 1) await sleep(DELAY_MS);   // be a polite guest
  }
  return tests;
}

/* ---------------- report ---------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = process.argv.includes("--fresh");
  const tests = await loadAll({ fresh });

  const content = tests.filter(isContent);
  const chapter = tests.filter((t) => t.kind === "chapter");
  const all = tests.flatMap((t) => t.questions);
  const problems = tests.flatMap((t) =>
    t.questions.filter((q) => q.bad).map((q) => `${t.slug} q${q.i}: ${q.bad} — ${q.t.slice(0, 60)}`));
  const wrongCount = tests.filter((t) => t.questions.length !== PER_TEST);

  // The independent check. Counted, not assumed.
  let checked = 0, disagree = [];
  for (const t of tests) {
    if (!t.faq) continue;
    for (const q of t.questions) {
      if (q.bad || !t.faq[q.i]) continue;
      checked++;
      if (!faqAgrees(q, t.faq[q.i])) disagree.push(`${t.slug} q${q.i}: ${q.t.slice(0, 55)}`);
    }
  }

  const counts = {};
  for (const q of all) if (!q.bad) counts[q.o.length] = (counts[q.o.length] || 0) + 1;

  console.log(`\n${tests.length} pages (${content.length} content + ${chapter.length} chapter) · ` +
    `${all.length} questions · ${problems.length} parse problems`);
  console.log(`content questions     ${content.reduce((a, t) => a + t.questions.length, 0)}`);
  console.log(`explanations present  ${all.filter((q) => q.e).length} / ${all.length}`);
  console.log(`references present    ${all.filter((q) => q.slugs.length).length} / ${all.length}`);
  console.log(`ratings present       ${all.filter((q) => q.r).length} / ${all.length}`);
  console.log(`multi-answer          ${all.filter((q) => q.o && q.o.filter((o) => o[1]).length > 1).length}`);
  console.log(`options per question  ${Object.entries(counts).map(([k, v]) => `${k}→${v}`).join("  ")}`);
  console.log(`schema.org agrees     ${checked - disagree.length} / ${checked}`);

  for (const t of wrongCount) console.log(`!! ${t.slug} has ${t.questions.length} questions, expected ${PER_TEST}`);
  for (const p of problems.slice(0, 20)) console.log(`!! ${p}`);
  for (const d of disagree.slice(0, 20)) console.log(`!! schema.org disagrees — ${d}`);

  const ok = tests.length === PAGES.length && !wrongCount.length && !problems.length && !disagree.length;
  console.log(ok
    ? `\nGO — ${content.length} content pages × ${PER_TEST}, ${chapter.length} chapter pages × ${PER_TEST}, 0 parse problems.`
    : "\nNO GO — see above.");
  if (!ok) process.exit(1);
}
