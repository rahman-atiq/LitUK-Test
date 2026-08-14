#!/usr/bin/env node
/**
 * Fetches and parses the 17 LifeInTheUKTestWeb.co.uk exam pages.
 *
 *   node tools/fetch-lituktestweb-exams.mjs          # fetch (cached), parse, report
 *   node tools/fetch-lituktestweb-exams.mjs --fresh  # ignore the cache
 *
 * The site's ~60 mock/practice tests are deliberately not fetched — see
 * PLAN-lituktestweb-source.md. Only the 17 exam pages linked from /exams/.
 *
 * The 17 URLs are NOT /exam-1/ … /exam-17/. Years of SEO churn left them at
 * five different slug patterns, so the set is discovered by scraping the
 * /exams/ index page rather than constructed from a template that will rot
 * the next time the site renames one. Discovery asserts exactly 17 links,
 * numbered 1-17 with no gaps, before anything else runs.
 *
 * Pages are server-rendered — questions, options, the answer key and the
 * topic legend are all in the markup, no API and no JS to execute. Each page
 * is cached to tools/.cache/lituktestweb-exams/ so re-runs cost nothing and
 * the parser can be iterated on without touching the network again.
 *
 * Exports parse() and loadAll() for tools/build-lituktestweb-data.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dec, txt } from "./fetch-practice-tests.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", ".cache", "lituktestweb-exams");

export const EXAM_COUNT = 17;
export const PER_TEST = 24;

const BASE = "https://lifeintheuktestweb.co.uk";
const INDEX_URL = `${BASE}/exams/`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- index discovery ----------------
   The /exams/ page carries a link-button per exam, each with a slug that
   matches nothing you could template ("Exam N" always shows in the button
   text, but the URL underneath ranges from /british-citizenship-test-N/ to
   /exam-17/). Reading the number off the text and the URL off the href is
   what makes discovery immune to the site renaming a page yet again. */
const INDEX_LINK_RE =
  /href="(https:\/\/lifeintheuktestweb\.co\.uk\/[^"]+\/)"[^>]*>\s*<span class="elementor-button-content-wrapper">\s*<span class="elementor-button-text">\s*Exam\s*(\d+)/g;

export function discoverUrls(html) {
  const found = new Map();          // n -> url, last one wins (site links each n once)
  for (const [, url, n] of html.matchAll(INDEX_LINK_RE)) found.set(+n, url);
  const ns = [...found.keys()].sort((a, b) => a - b);
  const bad = [];
  if (ns.length !== EXAM_COUNT) bad.push(`found ${ns.length} exam link(s), expected ${EXAM_COUNT}`);
  for (let n = 1; n <= EXAM_COUNT; n++) if (!found.has(n)) bad.push(`no link found for Exam ${n}`);
  return { urls: ns.map((n) => ({ n, url: found.get(n) })), bad };
}

/* ---------------- the category legend ----------------
   var all_question_categories = JSON.parse('{...}') is a single-line, single-
   quoted JSON literal with no embedded apostrophes anywhere in the handbook's
   chapter/section names, so a brace-balanced scan from the first `{` finds its
   true end reliably — unlike a lazy regex, which stops at the first `}` inside
   the (deeply nested) object. */
function extractBalanced(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  let i = at + marker.length, depth = 0;
  const start = i;
  while (i < html.length) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  if (depth !== 0) return null;
  try { return JSON.parse(html.slice(start, i)); } catch { return null; }
}

/* ---------------- parser ----------------
   Two things make this source cheap: `solution` gives option IDs ("r0", "r1"),
   not option text, so there is no comma-shredding risk and no text matching —
   and the checkbox/radio input type is an independent statement of whether a
   question wants one answer or several, so asserting the two agree turns "the
   parser probably works" into a measurement (it passes 408/408, see the
   report below). The block terminator is <div id="container_button_check_answer">,
   not any container_result element — a regex that stops on the wrong element
   silently drops the 24th question of every page, which is exactly what
   happened once during planning and only question_quantity caught it. */
const BLOCK_RE = /<div class="container_question" data-id_question="(p\d+)">([\s\S]*?)(?=<div class="container_question" data-id_question="p\d+">|<div id="container_button_check_answer">)/g;
const BUTTON_RE = /<div class="question_button" data-id_question="(p\d+)" data-category="(\d+)">/g;
const LABEL_RE = /<label for="(p\d+r\d+)">([\s\S]*?)<\/label>/g;

export function parse(html) {
  const bad0 = [];
  const time = html.match(/const time = (\d+)/);
  const idTest = html.match(/const id_test = (\d+)/);
  const qq = html.match(/const question_quantity = (\d+)/);
  const solM = html.match(/const solution = (\{[^\n]*\})/);
  if (!time) bad0.push("no time");
  if (!idTest) bad0.push("no id_test");
  if (!qq) bad0.push("no question_quantity");
  let solution = null;
  if (!solM) bad0.push("no solution");
  else { try { solution = JSON.parse(solM[1]); } catch { bad0.push("unparseable solution"); } }

  const legend = extractBalanced(html, "all_question_categories = JSON.parse('");
  if (!legend) bad0.push("no category legend");

  const catOf = {};
  for (const [, pid, cat] of html.matchAll(BUTTON_RE)) catOf[pid] = cat;

  const out = [];
  for (const [, pid, block] of html.matchAll(BLOCK_RE)) {
    const q = { i: +pid.slice(1) };
    const bad = [];

    const qm = block.match(/<div class="question">([\s\S]*?)<\/div>/);
    q.t = qm ? txt(qm[1]) : "";
    if (!q.t) bad.push("no question text");

    if (block.includes("<img")) bad.push("image option");

    const opts = [];
    for (const [, oid, inner] of block.matchAll(LABEL_RE)) {
      const typeM = inner.match(/type="(checkbox|radio)"/);
      const ansIdM = inner.match(/data-id_answer="(r\d+)"/);
      const text = txt(inner.replace(/<input[^>]*>/, ""));
      opts.push({ oid, type: typeM ? typeM[1] : null, ansId: ansIdM ? ansIdM[1] : null, text });
    }
    if (opts.length < 2) bad.push("fewer than two options");
    if (opts.some((o) => !o.text)) bad.push("empty option");
    if (opts.some((o) => !o.type)) bad.push("option missing checkbox/radio type");
    if (opts.some((o) => !o.ansId)) bad.push("option missing data-id_answer");
    if (new Set(opts.map((o) => o.ansId)).size !== opts.length) bad.push("duplicate data-id_answer");

    const ans = solution && solution[pid] ? solution[pid].split(",") : null;
    if (!ans) bad.push(`no solution for ${pid}`);
    else if (ans.some((a) => !opts.some((o) => o.ansId === a))) bad.push("solution references an option id not on the page");

    // The free integrity check: input type must agree with answer count.
    if (opts.length && ans) {
      const isMulti = ans.length > 1;
      const allCheckbox = opts.every((o) => o.type === "checkbox");
      const allRadio = opts.every((o) => o.type === "radio");
      if (isMulti && !allCheckbox) bad.push(`${ans.length} answers but options are not all checkboxes`);
      if (!isMulti && !allRadio) bad.push("one answer but options are not all radios");
    }

    q.o = opts.map((o) => [o.text, ans && ans.includes(o.ansId) ? 1 : 0]);
    if (ans && !q.o.some((o) => o[1])) bad.push("no correct option");

    const explM = block.match(/<div class="container_explication"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    const explHtml = explM
      ? explM[1].replace(/<div class="container_response_correct_incorrect">[\s\S]*?<\/div>/, "")
      : null;
    q.e = explHtml !== null ? txt(explHtml) : "";
    if (!q.e) bad.push("no explanation");

    q.category = catOf[pid] || null;
    if (!q.category) bad.push("no category (question_button not found)");

    q.bad = bad.length ? bad.join("; ") : null;
    out.push(q);
  }

  const qqN = qq ? +qq[1] : null;
  if (qqN !== null && out.length !== qqN) bad0.push(`${out.length} question block(s) parsed, question_quantity says ${qqN}`);

  return { time: time ? +time[1] : null, idTest: idTest ? +idTest[1] : null, questionQuantity: qqN, legend, questions: out, bad: bad0 };
}

/* ---------------- fetch ---------------- */

async function fetchPage(url, cacheName, { fresh = false } = {}) {
  const file = path.join(CACHE, cacheName);
  if (!fresh && fs.existsSync(file)) return { html: fs.readFileSync(file, "utf8"), cached: true };

  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, html);
  return { html, cached: false };
}

/**
 * All 17 exam pages, discovered from /exams/ and parsed. Returns
 * { urls, indexBad, tests } where tests is [{ n, slug, url, ...parse() }] in
 * Exam 1 -> 17 order — the order the builder relies on for first-seen id
 * assignment (INV-2).
 */
export async function loadAll({ fresh = false, quiet = false } = {}) {
  const { html: indexHtml, cached: indexCached } = await fetchPage(INDEX_URL, "_index.html", { fresh });
  const { urls, bad: indexBad } = discoverUrls(indexHtml);
  if (!quiet) {
    console.log(`/exams/ index: ${urls.length} exam link(s) discovered${indexCached ? "  (cached)" : ""}`);
    for (const b of indexBad) console.log(`!! ${b}`);
  }

  const tests = [];
  for (let i = 0; i < urls.length; i++) {
    const { n, url } = urls[i];
    const slug = url.replace(BASE, "").replace(/^\/|\/$/g, "");
    const { html, cached } = await fetchPage(url, `${slug}.html`, { fresh });
    const parsed = parse(html);
    tests.push({ n, slug, url, ...parsed });
    if (!quiet) {
      const bad = parsed.bad.length + parsed.questions.filter((q) => q.bad).length;
      console.log(
        `exam-${String(n).padStart(2)}  ${slug.padEnd(46)} ${String(parsed.questions.length).padStart(2)} questions` +
        `  ${bad ? `${bad} PROBLEM(S)` : "ok"}${cached ? "  (cached)" : ""}`
      );
    }
    if (!cached && i < urls.length - 1) await sleep(DELAY_MS);   // be a polite guest
  }
  return { urls, indexBad, tests };
}

/* ---------------- report ---------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = process.argv.includes("--fresh");
  const { indexBad, tests } = await loadAll({ fresh });

  const all = tests.flatMap((t) => t.questions);
  const pageProblems = tests.flatMap((t) => t.bad.map((b) => `${t.slug}: ${b}`));
  const questionProblems = tests.flatMap((t) =>
    t.questions.filter((q) => q.bad).map((q) => `${t.slug} ${q.i}: ${q.bad} — ${q.t.slice(0, 60)}`));
  const problems = [...indexBad, ...pageProblems, ...questionProblems];
  const wrongCount = tests.filter((t) => t.questions.length !== PER_TEST);

  const counts = {};
  for (const q of all) if (!q.bad) counts[q.o.length] = (counts[q.o.length] || 0) + 1;
  const multi = all.filter((q) => q.o && q.o.filter((o) => o[1]).length > 1).length;

  console.log(`\n${tests.length} exam pages · ${all.length} questions · ${problems.length} parse problems`);
  console.log(`explanations present   ${all.filter((q) => q.e).length} / ${all.length}`);
  console.log(`multi-answer           ${multi}`);
  console.log(`options per question   ${Object.entries(counts).map(([k, v]) => `${k}→${v}`).join("  ")}`);

  for (const t of wrongCount) console.log(`!! ${t.slug} has ${t.questions.length} questions, expected ${PER_TEST}`);
  for (const p of problems.slice(0, 20)) console.log(`!! ${p}`);

  const ok = tests.length === EXAM_COUNT && !indexBad.length && !wrongCount.length && !problems.length;
  console.log(ok
    ? `\nGO — ${EXAM_COUNT} exam URLs discovered, numbered 1-${EXAM_COUNT} with no gaps, ${EXAM_COUNT} pages × ${PER_TEST} questions, 0 parse problems.`
    : "\nNO GO — see above.");
  if (!ok) process.exit(1);
}
