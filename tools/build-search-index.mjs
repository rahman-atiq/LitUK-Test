#!/usr/bin/env node
/**
 * Builds search-index.js — everything the hub's search box looks through:
 * every text block of the ten chapter pages, plus all 1080 questions.
 *
 *   node tools/build-search-index.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (f) => path.join(ROOT, f);

const TITLES = {
  1: "The Values and Principles of the UK",
  2: "What is the UK?",
  3: "A Long and Illustrious History",
  4: "A Modern, Thriving Society",
  5: "The UK Government, the Law and Your Role",
};
const STORY_TITLES = {
  1: "The Deal", 2: "The Map, Decoded", 3: "The Island Story",
  4: "Your First Year", 5: "Follow the Power",
};

const FILES = [];
for (const n of [1, 2, 3, 4, 5]) FILES.push({ f: `life-in-uk-chapter${n}-story.html`, k: "story", c: n, t: STORY_TITLES[n] });
for (const n of [1, 2, 3, 4, 5]) FILES.push({ f: `life-in-uk-chapter${n}.html`, k: "ref", c: n, t: TITLES[n] });

/* ---------------- helpers ---------------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", pound: "£", deg: "°" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

const tidy = (s) => decode(s)
  .replace(/\s+/g, " ")
  // the tag-boundary spaces above leave gaps before punctuation
  .replace(/\s+([,.;:!?%)\]”’])/g, "$1")
  .replace(/([(\[“‘£])\s+/g, "$1")
  .trim();

function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

const BLOCK_TAG = /^(p|div|li|ul|ol|h[1-6]|section|header|footer|tr|td|th|br|blockquote|figure|figcaption|dl|dt|dd|table|main|article|aside|nav|details|summary)$/i;

/**
 * Walks the markup, emitting one entry per block of visible text along with the
 * nearest enclosing section id and the heading it sits under.
 */
function extract(html) {
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // <title>, the doctype and the theme button are not chapter content.
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) html = body[1];

  const out = [];
  let anchor = "", head = "", headBuf = null;
  let buf = "";

  const flush = () => {
    const t = tidy(buf);
    buf = "";
    if (t.length >= 24) out.push({ anchor, head, text: t });
  };

  const tagRe = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let last = 0, m;
  while ((m = tagRe.exec(html))) {
    // Every tag boundary is a word boundary, or "<span>1679</span><span>Plague"
    // comes out as "1679Plague".
    const chunk = html.slice(last, m.index) + " ";
    buf += chunk;
    if (headBuf !== null) headBuf += chunk;
    last = tagRe.lastIndex;

    const closing = m[0][1] === "/";
    const name = m[1].toLowerCase();
    const attrs = m[2] || "";

    if (!closing && name === "section") {
      const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/);
      if (id) { flush(); anchor = id[1]; }
    }
    if (/^h[1-4]$/.test(name)) {
      if (!closing) { flush(); headBuf = ""; }
      else if (headBuf !== null) {
        const t = tidy(headBuf);
        headBuf = null;
        if (t) { head = t; out.push({ anchor, head: t, text: t, isHead: true }); }
        buf = "";
        continue;
      }
    }
    if (BLOCK_TAG.test(name)) flush();
  }
  buf += html.slice(last);
  flush();

  // Collapse repeats (nav lists, repeated captions) while keeping the first hit.
  const seen = new Set();
  return out.filter((b) => {
    const k = b.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------------- chapter blocks ---------------- */

const heads = [];
const headIdx = new Map();
function headId(h) {
  if (!h) return -1;
  if (!headIdx.has(h)) { headIdx.set(h, heads.length); heads.push(h); }
  return headIdx.get(h);
}

const blocks = [];
FILES.forEach((meta, fi) => {
  const html = fs.readFileSync(R(meta.f), "utf8");
  let kept = 0;
  for (const b of extract(html)) {
    blocks.push([fi, b.anchor, headId(b.head), clip(b.text, 220), b.isHead ? 1 : 0]);
    kept++;
  }
  console.log(`${meta.f.padEnd(32)} ${String(kept).padStart(4)} blocks`);
});

/* ---------------- questions ---------------- */

const mock = fs.readFileSync(R("life-in-uk-mock-tests.html"), "utf8");
const dm = mock.match(/<script>const DATA=(\{[\s\S]*?\});<\/script>/);
if (!dm) throw new Error("could not find DATA in life-in-uk-mock-tests.html");
const DATA = JSON.parse(dm[1]);

const expl = [];
const explIdx = new Map();
function exId(e) {
  if (!e) return -1;
  if (!explIdx.has(e)) { explIdx.set(e, expl.length); expl.push(e); }
  return explIdx.get(e);
}

const qs = [];
for (const t of DATA.tests) {
  for (const q of t.q) {
    const answer = q.o.filter((o) => o[1]).map((o) => o[0]).join(" · ");
    qs.push([q.g, t.n, q.p, q.t, answer, exId(clip(q.e || "", 150))]);
  }
}
console.log(`${"questions".padEnd(32)} ${String(qs.length).padStart(4)} entries`);

/* ---------------- emit ---------------- */

const payload = {
  v: 1,
  files: FILES.map((f) => [f.f, f.k, f.c, f.t]),
  heads,
  blocks,
  topics: DATA.topics,
  expl,
  qs,
};

const js = "/* Generated by tools/build-search-index.mjs — do not edit by hand. */\n" +
  "window.LITUK_INDEX=" + JSON.stringify(payload) + ";\n";
fs.writeFileSync(R("search-index.js"), js);
console.log(`\nsearch-index.js  ${(js.length / 1024).toFixed(0)} KB  (${blocks.length} blocks, ${qs.length} questions, ${heads.length} headings)`);
