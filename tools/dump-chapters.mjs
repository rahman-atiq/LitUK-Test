#!/usr/bin/env node
/**
 * The handbook chapters in this repo, as plain text.
 *
 *   node tools/dump-chapters.mjs                  everything, to stdout
 *   node tools/dump-chapters.mjs --ref            reference pages only (the exam text)
 *   node tools/dump-chapters.mjs --chapter 3      one chapter
 *   node tools/dump-chapters.mjs --out DIR        one file per chapter
 *   node tools/dump-chapters.mjs --numbers        every figure the chapters print
 *   node tools/dump-chapters.mjs --grep bannockburn
 *
 * Why this exists: writing a question means reading the ground truth first, and
 * the ground truth is ten HTML pages with a navigation shell in each. Reading
 * them as markup wastes most of a session and invites quoting a nav link as if
 * it were handbook prose. loadChapters() already strips all that for the search
 * index and the bank verifier — this just prints what they see.
 *
 * `--numbers` is the list to consult before writing any question whose ANSWER
 * is a figure. tools/check-toughest-source.mjs rejects an answer stating a
 * number that is not in it, for the reason spelled out there.
 *
 * Two kinds of page load. `ref` is the reference rendering — condensed, and the
 * corpus tools/verify-bank.mjs judges every bank against. `story` is the
 * narrative companion. A claim supported only by a story page is a claim the
 * verifier may still flag, so prefer to anchor questions on `ref`.
 */
import fs from "node:fs";
import path from "node:path";
import { loadChapters } from "./lib/chapters.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d };

const NUM = /\b(?:£\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]{1,}|\d+)\b/g;
const units = (s) => String(s || "").replace(/(\d)\s?(?:m|bn|k)\b/gi, "$1 ");
const numsRaw = (s) => (units(s).match(NUM) || [])
  .map((n) => n.replace(/[\s,]/g, ""))
  .filter((n) => { const v = +n.replace(/[^\d.]/g, ""); return !(v >= 1 && v <= 12 && !/[£%]/.test(n)) });

let blocks = loadChapters();
if (has("--ref")) blocks = blocks.filter((b) => b.kind === "ref");
if (has("--story")) blocks = blocks.filter((b) => b.kind === "story");
const ch = val("--chapter", null);
if (ch) blocks = blocks.filter((b) => b.chapter === +ch);

const pattern = val("--grep", null);
if (pattern) {
  const re = new RegExp(pattern, "i");
  const hits = blocks.filter((b) => re.test(b.text));
  for (const b of hits) console.log(`ch${b.chapter} ${b.kind.padEnd(5)} ${b.head ? `« ${b.head} » ` : ""}${b.text}`);
  console.error(`\n${hits.length} block(s) of ${blocks.length} match /${pattern}/i`);
  process.exit(0);
}

if (has("--numbers")) {
  const set = new Set(blocks.flatMap((b) => numsRaw(b.text)));
  const sorted = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  console.log(sorted.join(" "));
  console.error(`\n${sorted.length} distinct figure(s) across ${blocks.length} block(s).`);
  console.error(`An answer may only state a figure from this list — see tools/check-toughest-source.mjs.`);
  process.exit(0);
}

const render = (bs) => bs.map((b) => (b.isHead ? "\n## " : "") + b.text).join("\n");

const outDir = val("--out", null);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const groups = new Map();
  for (const b of blocks) {
    const k = `ch${b.chapter}-${b.kind}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  for (const [k, bs] of groups) {
    const f = path.join(outDir, `${k}.txt`);
    fs.writeFileSync(f, render(bs));
    console.log(`${String(bs.length).padStart(4)} blocks  ${f}`);
  }
  process.exit(0);
}

console.log(render(blocks));
console.error(`\n${blocks.length} block(s).`);
