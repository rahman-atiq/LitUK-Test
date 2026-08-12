/**
 * The chapter pages as text: the ten handbook pages in the repo, reduced to one
 * entry per block of visible prose.
 *
 * Lifted out of tools/build-search-index.mjs so the search index and the bank
 * verifier read the same words. If they extracted separately they would drift,
 * and a verifier that checks questions against a slightly different corpus than
 * the one the app links you to is a verifier that argues with the app.
 */
import fs from "node:fs";
import { R } from "./banks.mjs";

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

/** Load order is load-bearing: search-index.js stores the file INDEX, not the name. */
export const FILES = [];
for (const n of [1, 2, 3, 4, 5]) FILES.push({ f: `life-in-uk-chapter${n}-story.html`, k: "story", c: n, t: STORY_TITLES[n] });
for (const n of [1, 2, 3, 4, 5]) FILES.push({ f: `life-in-uk-chapter${n}.html`, k: "ref", c: n, t: TITLES[n] });

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", pound: "£", deg: "°" };
export const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

export const tidy = (s) => decode(s)
  .replace(/\s+/g, " ")
  // the tag-boundary spaces above leave gaps before punctuation
  .replace(/\s+([,.;:!?%)\]”’])/g, "$1")
  .replace(/([(\[“‘£])\s+/g, "$1")
  .trim();

export function clip(s, n) {
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
export function extract(html) {
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

/**
 * Every block of every chapter page, tagged with where it came from.
 * Unclipped — search-index.js truncates to 220 characters for size, which is
 * fine for a search snippet and not fine for checking whether a sentence
 * supports a claim.
 */
export function loadChapters() {
  const out = [];
  FILES.forEach((meta, fi) => {
    for (const b of extract(fs.readFileSync(R(meta.f), "utf8"))) {
      out.push({ fi, file: meta.f, kind: meta.k, chapter: meta.c, chapterTitle: meta.t, ...b });
    }
  });
  return out;
}
