#!/usr/bin/env node
/**
 * Builds facts.js — one atomic fact per question, and the chapter section that
 * explains it.
 *
 *   node tools/build-facts.mjs      (run tools/build-search-index.mjs first)
 *
 * Two rules shape this file.
 *
 * INV-7, no generated content. The fact is not written, summarised or
 * paraphrased: it is stored as a [start, length] slice of the question's own
 * explanation, so what the app renders is provably a substring of text a human
 * wrote. A mined fact that is subtly wrong is a fact you would then drill every
 * day until the exam, which is worse than having no fact card at all.
 *
 * Offsets, not strings. 1,858 explanations are already in practice-data.js and
 * mock-data.js; shipping them again would double 750KB of bank data for no new
 * information. The whole file lands around 100KB and is loaded on demand.
 *
 * The chapter link reuses machinery that already exists: search-index.js knows
 * every text block of the ten chapter pages, and app.js already highlights
 * ?find= on arrival. All this does is pick which block, once, at build time,
 * instead of shipping a 610KB index to the mock-tests page to do it live.
 */
import fs from "node:fs";
import { R, loadBanks, allQuestions } from "./lib/banks.mjs";

/* ---------------- the bank, deduplicated the way the engine does ---------------- */

const dupNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (q) => dupNorm(q.t) + " " + q.o.map((o) => dupNorm(o[0])).sort().join("");

const banks = loadBanks();
const seen = new Set();
const POOL = [];
for (const q of allQuestions(banks).sort((a, b) => a.g - b.g)) {
  const k = dupKey(q);
  if (seen.has(k)) continue;         // lowest id owns the state, exactly as CANON does
  seen.add(k);
  POOL.push(q);
}

const STOP = new Set((
  "the a an of in on at to for and or is are was were be been being which what who whom when where how why " +
  "this that these those there here it its as by with from into during over under between than then also " +
  "you your they them their his her him she he we our us not no yes can could will would shall should may " +
  "might must do does did done have has had but if all any some more most other others one two three both " +
  "such only own same so too very just about after before above below out off own again further once each " +
  "statement below true false correct following people country year years time first"
).split(" "));

const words = (s) => String(s).toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean);
const content = (s) => words(s).filter((w) => w.length > 3 && !STOP.has(w));

/* ---------------- the fact: one verbatim slice of the explanation ---------------- */

/** Sentence and bullet boundaries, as [start, length] pairs into `e`. */
function segments(e) {
  const out = [];
  const re = /([.!?])(?=[\s"'”’)]|$)|\n+/g;
  let start = 0, m;
  while ((m = re.exec(e))) {
    const end = m[0][0] === "\n" ? m.index : m.index + 1;
    if (end > start) out.push([start, end - start]);
    start = re.lastIndex;
  }
  if (start < e.length) out.push([start, e.length - start]);
  return out
    .map(([s, l]) => {
      // eat leading whitespace and bullet markers so the offset lands on a word
      const raw = e.substr(s, l);
      const lead = raw.match(/^[\s\-–—•*]+/);
      const off = lead ? lead[0].length : 0;
      return [s + off, l - off];
    })
    .filter(([s, l]) => l > 0 && e.substr(s, l).trim().length > 0);
}

const MIN_FACT = 25, IDEAL_MAX = 220;

/**
 * Some explanations are one 400-character sentence listing every coin in
 * circulation. Cut it at the last clause boundary that fits — still a
 * substring, so still verbatim; the app marks the truncation with an ellipsis.
 */
function clipCut(e, s, l) {
  if (l <= IDEAL_MAX) return [s, l];
  const head = e.substr(s, IDEAL_MAX);
  let at = Math.max(head.lastIndexOf("; "), head.lastIndexOf(", "), head.lastIndexOf(": "));
  if (at < IDEAL_MAX * 0.5) at = head.lastIndexOf(" ");
  return at >= MIN_FACT + 15 ? [s, at] : null;
}

/**
 * The sentence that states the fact — the one carrying the correct answer, and
 * failing that the one with most of the question in it. Ties break towards the
 * front, because explanations lead with the point and then qualify it.
 *
 * A true/false question's answer is the word "True", which tells you nothing,
 * and its stem often shares no vocabulary with the explanation at all. When
 * nothing scores, the opening sentence is taken on the same reasoning: it is
 * where the explanation puts the point.
 */
function pickFact(q) {
  const e = q.e || "";
  if (e.trim().length < MIN_FACT) return null;
  const cands = segments(e).map(([s, l]) => clipCut(e, s, l))
    .filter((c) => c && e.substr(c[0], c[1]).trim().length >= MIN_FACT);
  if (!cands.length) return null;

  const answers = q.o.filter((o) => o[1]).map((o) => String(o[0]))
    .filter((a) => a.length > 3 && !/^(true|false)$/i.test(a));
  const stem = new Set(content(q.t));

  let best = null;
  cands.forEach((c, i) => {
    const text = e.substr(c[0], c[1]).trim(), low = text.toLowerCase();
    let score = 0;
    for (const a of answers) if (low.includes(a.toLowerCase())) score += 6;
    // a partial answer match still counts — "Sir Robert Walpole" vs "Walpole"
    for (const a of answers) for (const w of content(a)) if (low.includes(w)) score += 1.5;
    for (const w of stem) if (low.includes(w)) score += 2;
    if (text.length < 45) score -= 1.5;
    score -= i * 0.6;                       // the lead sentence, unless a later one earns it
    if (!best || score > best.score) best = { score, cut: c };
  });
  return best.score > 1 ? best.cut : cands[0];
}

/* ---------------- the chapter link ---------------- */

function loadIndex() {
  const f = R("search-index.js");
  if (!fs.existsSync(f)) return null;
  const window = {};
  new Function("window", fs.readFileSync(f, "utf8"))(window);
  return window.LITUK_INDEX || null;
}

const X = loadIndex();
if (!X) {
  console.error("search-index.js is missing — run tools/build-search-index.mjs first.");
  process.exit(1);
}

/* Blocks worth linking to: real prose, not a two-word heading, and from the
   reference chapters in preference to the story retellings — a mistake wants
   the passage that states the rule, not the one that dramatises it. */
const BLOCKS = X.blocks
  .map((b, i) => ({ i, file: b[0], anchor: b[1], text: b[3], head: !!b[4],
    kind: X.files[b[0]][1], chapter: X.files[b[0]][2] }))
  .filter((b) => b.text.length >= 40);

/* Inverted index, so each question scores a few dozen candidate blocks rather
   than all of them. */
const postings = new Map();
const dfB = new Map();
BLOCKS.forEach((b, bi) => {
  for (const w of new Set(content(b.text))) {
    if (!postings.has(w)) postings.set(w, []);
    postings.get(w).push(bi);
    dfB.set(w, (dfB.get(w) || 0) + 1);
  }
});
const idf = (w) => Math.log(BLOCKS.length / (1 + (dfB.get(w) || 0)));

/* ---- will app.js actually highlight this? ----
   highlight() in app.js walks text nodes and does one indexOf per node, so a
   term only marks up if it sits inside a single node. The search index's block
   text is stitched across tag boundaries, which is right for searching and
   wrong for highlighting: "the Battle of Hastings" is in the block and is
   never in one node, because the page sets the name in <b>.
   Same rule as the browser — decode entities, do not touch whitespace. */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", pound: "£", deg: "°" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

const nodeCache = new Map();
function pageNodes(fi) {
  if (nodeCache.has(fi)) return nodeCache.get(fi);
  const html = fs.readFileSync(R(X.files[fi][0]), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const nodes = html.split(/<[^>]*>/).map((s) => decode(s).toLowerCase()).filter((s) => s.trim());
  nodeCache.set(fi, nodes);
  return nodes;
}
const highlightable = (fi, term) => {
  const t = decode(term).toLowerCase();
  return t.length >= 2 && pageNodes(fi).some((n) => n.includes(t));
};

/* The five topics ARE the five chapters — q.p 0 is "A modern, thriving society",
   which is chapter 4. That is the strongest prior available and it is free:
   without it "you will be arrested" for drink-driving matched a sentence about
   arrests in the Civil War. Indexed by q.p, valued in chapter number. */
const TOPIC_CHAPTER = [4, 3, 5, 1, 2];

const LINK_MIN = 6;      // below this the "best" block is a coincidence, so ship no link

function pickLink(q) {
  const answers = q.o.filter((o) => o[1]).map((o) => String(o[0]))
    .filter((a) => !/^(true|false)$/i.test(a));
  const qTerms = new Set(content(q.t + " " + answers.join(" ")));
  if (!qTerms.size) return null;
  const aTerms = new Set(content(answers.join(" ")));

  const score = new Map();
  for (const w of qTerms) {
    const list = postings.get(w);
    if (!list || list.length > BLOCKS.length / 8) continue;     // too common to mean anything
    const weight = idf(w) * (aTerms.has(w) ? 2 : 1);            // the answer's words matter most
    for (const bi of list) score.set(bi, (score.get(bi) || 0) + weight);
  }
  const want = TOPIC_CHAPTER[q.p];
  let best = null;
  for (const [bi, s0] of score) {
    const b = BLOCKS[bi];
    let s = s0;
    s *= b.chapter === want ? 2.2 : 0.6;                        // the topic's own chapter, first
    if (b.kind === "ref") s *= 1.25;                            // the handbook notes, not the story
    if (b.head) s *= 0.7;                                       // a heading explains nothing
    if (!b.anchor) s *= 0.9;
    if (!best || s > best.s) best = { s, b };
  }
  if (!best || best.s < LINK_MIN) return null;

  /* The ?find= term: the rarest thing this question and that block share, so
     the highlight lands on the sentence that matters. A whole answer phrase
     wins outright — but only one that app.js can actually mark (see
     highlightable): "the Battle of Hastings" reads as one phrase and is three
     text nodes, because the page sets the name in <b>. */
  const low = best.b.text.toLowerCase();
  const cands = [];
  for (const a of answers) {
    const t = a.trim();
    if (t.length >= 4 && t.length <= 60 && low.includes(t.toLowerCase())) cands.push(t);
  }
  cands.sort((a, b) => b.length - a.length);
  const single = [];
  for (const w of qTerms) {
    if (!low.includes(w)) continue;
    single.push([w, idf(w) + Math.min(w.length, 12) / 3 + (aTerms.has(w) ? 2 : 0)]);
  }
  /* Longest wins over rarest among single words — "constituency" is a better
     thing to land on than "take", however rare "take" happens to be. */
  single.sort((a, b) => b[1] - a[1]);
  cands.push(...single.map((s) => s[0]));

  const term = cands.find((t) => highlightable(best.b.file, t));
  if (!term && !best.b.anchor) return null;      // no anchor and no highlight is not a link
  return [best.b.file, best.b.anchor || "", term || ""];
}

/* ---------------- emit ---------------- */

const cut = {}, link = {}, targets = [], targetIdx = new Map();
let noFact = 0, noLink = 0;

for (const q of POOL) {
  const c = pickFact(q);
  if (c) cut[q.g] = c; else noFact++;

  const t = pickLink(q);
  if (t) {
    const k = t.join(" ");
    if (!targetIdx.has(k)) { targetIdx.set(k, targets.length); targets.push(t); }
    link[q.g] = targetIdx.get(k);
  } else noLink++;
}

/* Nothing may claim to be verbatim without being checked. */
let badCut = 0;
for (const [g, c] of Object.entries(cut)) {
  const q = POOL.find((x) => x.g === +g);
  const slice = q.e.substr(c[0], c[1]);
  if (!q.e.includes(slice) || slice.trim().length < MIN_FACT) badCut++;
}
if (badCut) {
  console.error(`${badCut} fact slice(s) are not a clean substring of their explanation — refusing to write facts.js`);
  process.exit(1);
}

const payload = { v: 1, files: X.files, targets, cut, link };
const js = "/* Generated by tools/build-facts.mjs — do not edit by hand.\n" +
  "   `cut` is a [start,length] slice of the question's own explanation (INV-7:\n" +
  "   nothing here is written, only located). `link` indexes `targets`, each a\n" +
  "   [file, anchor, ?find= term] into the chapter pages. */\n" +
  "window.LITUK_FACTS=" + JSON.stringify(payload) + ";\n";
fs.writeFileSync(R("facts.js"), js);

const lens = Object.values(cut).map((c) => c[1]).sort((a, b) => a - b);
console.log(`${POOL.length} unique questions`);
console.log(`facts   ${POOL.length - noFact} (${noFact} without one) · median ${lens[lens.length >> 1]} chars, longest ${lens[lens.length - 1]}`);
console.log(`links   ${POOL.length - noLink} (${noLink} without one) · ${targets.length} distinct chapter targets`);
console.log(`\nfacts.js  ${(js.length / 1024).toFixed(0)} KB`);
