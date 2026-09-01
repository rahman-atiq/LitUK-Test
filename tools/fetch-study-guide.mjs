#!/usr/bin/env node
/**
 * Fetches the study guide at britizen.uk as plain text.
 *
 *   node tools/fetch-study-guide.mjs           # fetch (cached), extract, report
 *   node tools/fetch-study-guide.mjs --fresh   # ignore the cache
 *   node tools/fetch-study-guide.mjs --diff    # figures the guide prints that the repo's chapters do not
 *
 * The chapter pages in this repo are a CONDENSED rendering of this guide, and
 * they are the corpus every check here judges a bank against. That gap is the
 * whole reason this tool exists. Writing questions from the live guide alone
 * produces claims the repo cannot support — the first draft of the `toughest`
 * bank did exactly that fourteen times (allotments, Morecambe and Wise, darts,
 * the soap operas: all in the handbook, none of them on a chapter page). So:
 *
 *   the live guide  →  what the handbook says
 *   the repo's chapters (tools/dump-chapters.mjs)  →  what we can verify
 *
 * Write questions against the intersection. `--diff` prints one measure of the
 * gap: every figure the guide states that no chapter page does. A question
 * whose answer is one of those numbers will pass verify-bank today and mislead
 * whoever reads the linked chapter page tomorrow.
 *
 * Pages are server-rendered Nextra — the whole handbook is in the markup, no
 * API and no JS to execute. Cached to tools/.cache/study-guide/, which is
 * gitignored: the guide is fetched, not ours to redistribute, and this tool
 * reproduces it in about thirty seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChapters } from "./lib/chapters.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", ".cache", "study-guide");

const BASE = "https://britizen.uk";
const INDEX_URL = `${BASE}/study-guide/`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DELAY_MS = 800;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
              hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", pound: "£", deg: "°" };
const dec = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

async function get(url, slug) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, slug + ".html");
  if (!has("--fresh") && fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file, "utf8");
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const html = await res.text();
  fs.writeFileSync(file, html);
  await sleep(DELAY_MS);
  return html;
}

/* The nav shell repeats on every page; <main> is the handbook itself. */
function extract(html) {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const m = s.match(/<main\b[\s\S]*?<\/main>/i);
  if (!m) return null;
  let b = m[0]
    .replace(/<h([1-6])[^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|tr|section|ul|ol|table|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ");
  return dec(b.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n").map((l) => l.trimEnd()).join("\n").trim();
}

const slugOf = (u) => u.replace(/^\/study-guide\/?/, "").replace(/\/$/, "").replace(/\//g, "_") || "index";

/* ---------------- run ---------------- */
const index = await get(INDEX_URL, "index");
/* Chapter landing pages are just link lists — the prose lives on the sections. */
const urls = [...new Set((index.match(/href="\/study-guide\/[^"]*"/g) || [])
  .map((h) => h.slice(6, -1)))]
  .filter((u) => /\/study-guide\/chapter-\d+\/.+/.test(u))
  .sort();

if (!urls.length) {
  console.error(`no section links found at ${INDEX_URL} — the site's markup has changed, or the fetch was blocked.`);
  process.exit(1);
}

const out = path.join(CACHE, "text");
fs.mkdirSync(out, { recursive: true });
let chars = 0;
const texts = [];
for (const u of urls) {
  const slug = slugOf(u);
  const t = extract(await get(BASE + u, slug));
  if (!t) { console.error(`  ! ${slug}: no <main> — skipped`); continue; }
  fs.writeFileSync(path.join(out, slug + ".txt"), t);
  texts.push(t);
  chars += t.length;
  console.log(`${String(t.length).padStart(6)}  ${slug}`);
}
console.log(`\n${texts.length} section(s) · ${(chars / 1024).toFixed(0)} KB → ${out}`);

if (has("--diff")) {
  const NUM = /\b(?:£\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]{1,}|\d+)\b/g;
  const units = (s) => String(s || "").replace(/(\d)\s?(?:m|bn|k)\b/gi, "$1 ");
  const nums = (s) => (units(s).match(NUM) || [])
    .map((n) => n.replace(/[\s,]/g, ""))
    .filter((n) => { const v = +n.replace(/[^\d.]/g, ""); return !(v >= 1 && v <= 12 && !/[£%]/.test(n)) });
  const repo = new Set(loadChapters().flatMap((b) => nums(b.text)));
  const guide = new Set(texts.flatMap(nums));
  const only = [...guide].filter((n) => !repo.has(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  console.log(`\n${only.length} figure(s) the guide prints and the repo's chapters do not:`);
  console.log(only.join(" "));
  console.log(`\nNone of these may be the answer to a question — check-toughest-source.mjs rejects them,`);
  console.log(`and a learner following the "read why" link would not find them on the chapter page.`);
}
