#!/usr/bin/env node
/**
 * Builds cast-data.js — the 195 named figures of the Day Before sheets, as a
 * bank the cast quiz can ask questions from.
 *
 *   node tools/build-cast-data.mjs
 *
 * Three rules shape this file.
 *
 * INV-C1, no generated content. Every string that reaches a question is a
 * verbatim slice of a card on a Day Before page — the name, the life line, the
 * note, or the text inside one of the note's own <b> spans. Nothing is
 * summarised, rewritten or inferred. The one derived value in the payload is
 * `k`, the *shape* of a <b> span (year / number / text), which is a
 * classification of the slice rather than a claim about the world.
 *
 * INV-C2, generated. The Day Before sheets stay the source of truth; this file
 * only re-expresses them. Edit a card there and rerun — never edit cast-data.js.
 *
 * INV-C3, fail loudly. A markup drift that silently halved the cast would give
 * a quiz that felt complete and tested half the syllabus. Every count is
 * asserted against a constant below and a mismatch exits non-zero.
 *
 * The interesting part is the collision pass at the end. Tanni Grey-Thompson
 * and David Weir are both welded to "six London Marathon wins"; Chichester,
 * Knox-Johnston and MacArthur are three near-identical solo circumnavigations.
 * A distractor drawn at random from the same group is therefore sometimes a
 * *better* answer than the key. So collisions are computed once, here, and the
 * payload carries them: the quiz refuses them as distractors (INV-C7) and the
 * Confusion Duel uses precisely the same list as its content.
 */
import fs from "node:fs";
import { R } from "./lib/banks.mjs";

/* ---------------- what must come out ---------------- */

const SOURCES = [
  { f: "life-in-uk-day-before.html", ch: 3, axis: "era", expect: 94, groups: 7 },
  { f: "life-in-uk-day-before-ch4.html", ch: 4, axis: "field", expect: 101, groups: 10 },
];
const EXPECT_TOTAL = 195;

/* ---------------- text helpers ---------------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", pound: "£", deg: "°" };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10));
  return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
});
const strip = (s) => decode(String(s).replace(/<[^>]*>/g, ""));

/* A stable, readable id. Cards of the same figure share it, which is how the
   twin pass below finds them (INV-C6). */
const slug = (s) => strip(s).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const STOP = new Set((
  "the a an of in on at to for and or is are was were be been being it its as by with from into during " +
  "over under between than then there here this that these those his her their our your which who whom " +
  "when where how why what not no all any some more most other others one first two three both such only " +
  "own same so too very just about after before above below out off again once each he she they them him " +
  "had has have but if new own also who's whose"
).split(" "));

/** Content words of a note: what two cards would have to share to be confusable. */
const tokens = (html) => {
  const seen = new Set();
  for (const w of strip(html).toLowerCase().split(/[^a-z0-9’'-]+/)) {
    const t = w.replace(/^[’'-]+|[’'-]+$/g, "");
    if (t.length > 3 && !STOP.has(t)) seen.add(t);
    else if (/^\d{3,4}$/.test(t)) seen.add(t);          // a bare year is distinctive despite being short
  }
  return seen;
};

/* ---------------- the shape of a <b> span ---------------- */

/* Which cloze blanks are worth preferring. The handbook asks "in which year did
   Bannister run the four-minute mile" — and 1954 is bolded inside the note, not
   sitting in the life line. So a date-bearing span is the *when* axis, tested
   where the sheet actually states it. */
const YEAR = /\b(1[0-9]{3}|20[0-9]{2}|[0-9]{1,3}\s?(BC|AD)|AD\s?[0-9]{1,3})\b/;
const NUMBER = /[0-9]/;
const spanKind = (t) => (YEAR.test(t) ? "y" : NUMBER.test(t) ? "n" : "t");

/* ---------------- extraction ---------------- */

const GROUP_RE = /<div class="dgroup" data-dom="([^"]*)"[^>]*style="--era:var\((--[a-z0-9-]+)\)"[^>]*>([\s\S]*?)(?=\n\s*<!-- -+|\n\s*<\/div>\s*\n\s*<\/section>)/g;
const HEAD_RE = /<div class="dom" id="([^"]+)">[\s\S]*?<b>([\s\S]*?)<\/b>/;
const PERSON_RE = /<span class="p-name">([\s\S]*?)<\/span><span class="p-life">([\s\S]*?)<\/span><span class="p-note">([\s\S]*?)<\/span>/g;

const groups = [];
const people = [];
let cardCount = 0;

for (const src of SOURCES) {
  const html = fs.readFileSync(R(src.f), "utf8");
  const cast = html.slice(html.indexOf('<div class="cast" id="cast-list">'));
  let found = 0;

  for (const gm of cast.matchAll(GROUP_RE)) {
    const [, key, token, body] = gm;
    const head = body.match(HEAD_RE);
    if (!head) fail(`group "${key}" in ${src.f} has no .dom header`);

    const gi = groups.length;
    const cards = [...body.matchAll(PERSON_RE)];
    if (!cards.length) fail(`group "${key}" in ${src.f} yielded no person cards`);

    groups.push({
      i: gi, ch: src.ch, axis: src.axis, key,
      label: decode(head[2]).replace(/\s+/g, " ").trim(),
      tok: token,
      anchor: head[1],
      file: src.f,
      n: cards.length,
    });
    found++;

    for (const [, name, life, note] of cards) {
      cardCount++;
      const id = slug(name);
      const sameSlug = people.filter((p) => p.id === id).length;

      const bolds = [...note.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => strip(m[1]).trim());
      /* A blank needs something left to read around it, or the prompt is the
         whole answer removed — and a blank long enough to be a sentence makes
         four unreadable options, so prose spans have to be short. Dates and
         numbers are never too long to be worth asking. */
      const bare = strip(note).trim();
      const cz = [];
      bolds.forEach((t, n) => {
        if (!t) return;
        const k = spanKind(t);
        if (k === "t" && t.length > 40) return;
        const rest = bare.replace(t, "").replace(/[^a-z0-9]/gi, "");
        if (rest.length >= 12) cz.push([n, k]);
      });

      people.push({
        i: people.length, id, g: gi,
        k: sameSlug ? `${id}~${sameSlug + 1}` : id,      // stable spaced-repetition key
        same: [],
        n: decode(name).replace(/\s+/g, " ").trim(),
        l: decode(life).replace(/\s+/g, " ").trim(),
        w: note.replace(/\s+/g, " ").trim(),            // HTML kept: the <b> spans are the blanks
        cz,
      });
    }
  }

  if (found !== src.groups) fail(`${src.f}: expected ${src.groups} groups, found ${found}`);
  const got = cast.match(/class="person"/g).length;
  if (got !== src.expect) fail(`${src.f}: expected ${src.expect} person cards, found ${got}`);
}

if (cardCount !== EXPECT_TOTAL) fail(`expected ${EXPECT_TOTAL} cards across both sheets, found ${cardCount}`);
if (people.length !== EXPECT_TOTAL) fail(`expected ${EXPECT_TOTAL} entries, built ${people.length}`);

/* ---------------- one figure, several cards (INV-C6) ---------------- */

/* Six figures are carded twice — Wren, William the Conqueror and the
   Beatles/Stones across the two sheets, Agatha Christie twice within ch4,
   and Chaucer, who is "Geoffrey Chaucer" on one sheet and plain "Chaucer" on
   the other. All are deliberate: the second card is a *different weld* (Wren
   rebuilt St Paul's in ch3; he is an architect in ch4), so dropping it would
   put a fact the sheet teaches beyond the quiz's reach.

   Both cards are kept, with their own boxes, and made invisible to each other:
   "whose fact is this?" must never offer one name twice, and a duel between a
   figure and himself is not a question. Matching on the slug alone would miss
   Chaucer, so a name wholly contained in another name counts too. */
const nameKey = (s) => strip(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function sameFigure(a, b) {
  if (a.id === b.id) return true;
  const x = nameKey(a.n), y = nameKey(b.n);
  const [shortR, longR] = x.length <= y.length ? [x, y] : [y, x];
  return new RegExp(`(^| )${shortR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(longR);
}
for (let a = 0; a < people.length; a++) {
  for (let b = a + 1; b < people.length; b++) {
    if (!sameFigure(people[a], people[b])) continue;
    people[a].same.push(b);
    people[b].same.push(a);
  }
}

/* ---------------- figures the sheet gives no fact for ---------------- */

/* Seven cards carry a note they do not own alone. Keats, Shelley and Tennyson
   share "In the chapter's 19th-century roll call; no work or line attached"
   word for word, and the four modern poets share another — because the
   handbook names them and attaches nothing. That is the sheet being honest,
   and it has to be carried through rather than papered over: "whose fact is
   this?" has no answer when three people own the same sentence, and neither
   does "what is Keats known for?".
   So these are marked, the quiz asks them only what it can (which group, and
   any blank inside the note), and they are refused as each other's distractors
   rather than listed as collisions — a duel between two identical notes is a
   coin flip, not a trap. */
const byNote = new Map();
for (const p of people) {
  const k = strip(p.w).toLowerCase().replace(/\s+/g, " ").trim();
  if (!byNote.has(k)) byNote.set(k, []);
  byNote.get(k).push(p);
}
for (const share of byNote.values()) {
  if (share.length < 2) continue;
  for (const a of share) {
    a.nd = 1;
    for (const b of share) if (a !== b && !a.same.includes(b.i)) a.same.push(b.i);
  }
}

/* ---------------- collisions (INV-C7) ---------------- */

/* How rare a word is across all 195 notes. Sharing "british" means nothing;
   sharing "marathon" means the two cards are answering the same question. */
const df = new Map();
const toks = people.map((p) => {
  const t = tokens(p.w);
  for (const w of t) df.set(w, (df.get(w) || 0) + 1);
  return t;
});
const RARE = 4;          // appears in at most this many notes

function collide(a, b) {
  let shared = 0, rare = 0;
  for (const w of toks[a]) {
    if (!toks[b].has(w)) continue;
    shared++;
    if (df.get(w) <= RARE) rare++;
  }
  return rare >= 2 || (rare >= 1 && shared >= 3);
}

for (const p of people) p.col = [];
for (let a = 0; a < people.length; a++) {
  for (let b = a + 1; b < people.length; b++) {
    if (people[a].same.includes(b) || !collide(a, b)) continue;
    people[a].col.push(b);
    people[b].col.push(a);
  }
}

/* ---------------- every person must be answerable (INV-C3) ---------------- */

const axesOf = (p) => {
  const g = groups[p.g];
  const pool = people.filter((o) => o.i !== p.i && !p.col.includes(o.i) && !p.same.includes(o.i));
  const a = [];
  if (!p.nd && pool.length >= 3) { a.push("fact", "name"); }
  if (groups.filter((x) => x.axis === g.axis).length >= 4) a.push("group");
  if (p.cz.length) a.push("cloze");
  return a;
};
const mute = people.filter((p) => axesOf(p).length === 0);
if (mute.length) fail(`${mute.length} person(s) yield no answerable axis: ${mute.map((p) => p.n).join(", ")}`);

/* ---------------- write ---------------- */

const payload = {
  v: 1,
  groups: groups.map((g) => ({ i: g.i, ch: g.ch, ax: g.axis, k: g.key, l: g.label, t: g.tok, f: g.file, a: g.anchor, n: g.n })),
  people: people.map((p) => {
    const o = { i: p.i, k: p.k, g: p.g, n: p.n, l: p.l, w: p.w, cz: p.cz, col: p.col, sm: p.same };
    if (p.nd) o.nd = 1;
    return o;
  }),
};
const js = "/* Generated by tools/build-cast-data.mjs — do not edit by hand.\n" +
  "   The 195 named figures of the Day Before sheets. Every string here is a\n" +
  "   verbatim slice of a card on those pages (INV-C1); `cz` indexes the note's\n" +
  "   own <b> spans as cloze blanks, `col` lists the people whose fact would also\n" +
  "   answer this one's question — refused as distractors, used as duels — and\n" +
  "   `sm` lists cards refused as distractors but never duelled — another card of\n" +
  "   the same figure, or one sharing its note verbatim. `nd` marks a figure the\n" +
  "   sheet attaches no fact to, which can only be asked which group it is in. */\n" +
  "window.LITUK_CAST=" + JSON.stringify(payload) + ";\n";
fs.writeFileSync(R("cast-data.js"), js);

/* ---------------- census ---------------- */

const census = { fact: 0, name: 0, group: 0, cloze: 0 };
for (const p of people) for (const a of axesOf(p)) census[a]++;
const dated = people.filter((p) => p.cz.some((c) => c[1] === "y")).length;
const nd = people.filter((p) => p.nd).length;
const pairs = people.reduce((n, p) => n + p.col.length, 0) / 2;

const twinned = people.filter((p) => p.same.length).length;
console.log(`${cardCount} cards → ${people.length} welds across ${groups.length} groups (${twinned} cards belong to a twice-carded figure)`);
console.log(`axes    fact ${census.fact} · name ${census.name} · group ${census.group} · cloze ${census.cloze}`);
console.log(`cloze   ${people.reduce((n, p) => n + p.cz.length, 0)} blanks · ${dated} people carry a dated blank`);
console.log(`duels   ${pairs} colliding pairs`);
console.log(`no-fact ${nd} figures the sheet names without a fact — group axis only`);
console.log(`\ncast-data.js  ${(js.length / 1024).toFixed(0)} KB`);

function fail(msg) {
  console.error(`build-cast-data: ${msg} — refusing to write cast-data.js`);
  process.exit(1);
}
