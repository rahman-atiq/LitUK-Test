#!/usr/bin/env node
/**
 * Applies the shared plumbing to every page: PWA head tags, the pre-paint theme
 * snippet, app.js, and a single theme storage key. Idempotent — safe to re-run.
 *
 *   node tools/patch-pages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (f) => path.join(ROOT, f);

const STORY = [1, 2, 3, 4, 5].map((n) => `life-in-uk-chapter${n}-story.html`);
const REF = [1, 2, 3, 4, 5].map((n) => `life-in-uk-chapter${n}.html`);
const ALL = ["index.html", ...STORY, ...REF, "life-in-uk-quiz.html", "life-in-uk-mock-tests.html", "lituk.html", "life-in-uk-day-before.html", "life-in-uk-day-before-ch4.html", "life-in-uk-day-before-ch5.html", "life-in-uk-cast.html", "life-in-uk-awards.html", "life-in-uk-plan.html"];

const OPEN = "<!-- lituk:shared -->";
const CLOSE = "<!-- /lituk:shared -->";

/* Mode and accent both land before the first paint. The accent especially: it
   repaints the paper as well as the trim, so leaving it to the deferred app.js
   would flash the default palette on every single navigation. The id list is
   the one in app.js — an unknown value is ignored and the page stays gold. */
const ACCENTS = ["gold", "england", "scotland", "wales", "ni", "union"];

const THEME_SNIPPET =
  `<script>/* theme + skin + accent before first paint — one key each, every page */try{var _t=localStorage.getItem("lituk_theme")||localStorage.getItem("liuk-story-theme");` +
  `if(_t!=="light"&&_t!=="dark")_t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
  `document.documentElement.setAttribute("data-theme",_t);localStorage.setItem("lituk_theme",_t);` +
  `var _s=localStorage.getItem("lituk_skin")==="news";` +
  `if(_s)document.documentElement.setAttribute("data-skin","news");` +
  `var _a=localStorage.getItem("lituk_accent");` +
  /* Ten accents named for plants and weather became the four nations and the
     Union. A stored one of those is walked over to its nearest nation and
     written back rather than ignored, which would have silently dropped a
     choice someone made. Idempotent — no value in the map is also a key — so
     this costs one read on every later visit and nothing else. The same map is
     in app.js, for the page an update serves from a stale cache. */
  `var _m={rose:"england",poppy:"england",blossom:"england",oak:"wales",ivy:"wales",mint:"wales",slate:"scotland",heather:"union",bluebell:"union",gorse:"gold"};` +
  `if(_m[_a]){_a=_m[_a];localStorage.setItem("lituk_accent",_a)}` +
  /* Newsprint has no accent, and the attribute is what the accent rules match
     on — so it is simply not written while the skin is on, here for the same
     reason app.js takes it off there: nothing to outrank, nothing to undo. */
  `if(!_s&&/^(${ACCENTS.join("|")})$/.test(_a))document.documentElement.setAttribute("data-accent",_a)` +
  `}catch(e){}</script>`;

/* The ambient wash the hub has always had, now every page's. Inline for the
   same reason as the accent — it paints the background, so it cannot wait for a
   deferred script. The two apps that name their colours differently opt out by
   simply never being given the attribute.

   z-index:-1 is what makes it safe on pages that never planned for it: body's
   background propagates to the canvas and paints first, the negative layer of
   the root stacking context paints next, and in-flow content paints over both.
   So the wash sits above the page colour and under every word without any page
   having to raise its own content. */
/* The flag colours, shared by both washes below. Fixed values — a flag is not
   a tint, so unlike the palettes these are not solved for anything. The charge
   (--fc) is the one that flips per mode, because a white line drawn on light
   paper is not a line. */
const FLAG_VARS =
  `:root[data-accent="england"]{--f1:#CE1124;--f2:#FFFFFF}` +
  `:root[data-accent="scotland"]{--f1:#005EB8;--fc:#FFFFFF}:root[data-theme="light"][data-accent="scotland"]{--fc:#005EB8}` +
  `:root[data-accent="wales"]{--f1:#00B140;--f2:#D30731;--fc:#FFFFFF}` +
  `:root[data-accent="ni"]{--f1:#7C8FDB;--fc:#FAF0E6}:root[data-theme="light"][data-accent="ni"]{--fc:#7C8FDB}` +
  `:root[data-accent="union"]{--f1:#012169;--f2:#C8102E;--fc:#FFFFFF}:root[data-theme="light"][data-accent="union"]{--fc:#012169}`;

const WASH_SNIPPET =
  `<style>:root{--aurora:.55}:root[data-theme="light"]{--aurora:.34}` +
  `html[data-lituk-tokens="hub"] body::before{content:"";position:fixed;inset:0;z-index:-1;` +
  `pointer-events:none;opacity:var(--aurora);background:` +
  `radial-gradient(58% 40% at 10% -8%,color-mix(in srgb,var(--era4) 26%,transparent),transparent 70%),` +
  `radial-gradient(50% 36% at 94% 2%,color-mix(in srgb,var(--era3) 20%,transparent),transparent 70%),` +
  `radial-gradient(72% 44% at 50% 106%,color-mix(in srgb,var(--gold,var(--era1)) 16%,transparent),transparent 74%)}` +

  /* The nations. Under a nation the wash stops being weather and becomes the
     flag — same layer, same opacity, same z-index, so nothing else on the page
     has to know. Two attributes on <html> outrank the default above without
     !important, which is why gold and every non-hub page stay pixel-identical.

     Every flag is drawn in the top 60% of the viewport so it crosses behind the
     masthead at (50%,30%) rather than behind the body text — the layers that
     have to meet there are sized to that box. */
  FLAG_VARS +
  /* England — the cross of St George: an upright, a crossbar, light where they meet */
  `html[data-lituk-tokens="hub"][data-accent="england"] body::before{background:` +
  `radial-gradient(42% 30% at 50% 30%,color-mix(in srgb,var(--f2) 26%,transparent),transparent 70%),` +
  `linear-gradient(90deg,transparent 40%,color-mix(in srgb,var(--f1) 24%,transparent) 47% 53%,transparent 60%),` +
  `linear-gradient(180deg,transparent 20%,color-mix(in srgb,var(--f1) 24%,transparent) 27% 33%,transparent 40%);` +
  `background-repeat:no-repeat}` +
  /* Scotland — the saltire on an azure field */
  `html[data-lituk-tokens="hub"][data-accent="scotland"] body::before{background:` +
  `linear-gradient(56deg,transparent 42%,color-mix(in srgb,var(--fc) 18%,transparent) 48.5% 51.5%,transparent 58%),` +
  `linear-gradient(-56deg,transparent 42%,color-mix(in srgb,var(--fc) 18%,transparent) 48.5% 51.5%,transparent 58%),` +
  `radial-gradient(70% 50% at 50% 30%,color-mix(in srgb,var(--f1) 30%,transparent),transparent 72%);` +
  `background-size:100% 60%,100% 60%,auto;background-repeat:no-repeat}` +
  /* Wales — white over green, and the dragon's heat left of centre */
  `html[data-lituk-tokens="hub"][data-accent="wales"] body::before{background:` +
  `radial-gradient(40% 30% at 32% 40%,color-mix(in srgb,var(--f2) 30%,transparent),transparent 70%),` +
  `linear-gradient(180deg,color-mix(in srgb,var(--fc) 16%,transparent),transparent 46%),` +
  `linear-gradient(0deg,color-mix(in srgb,var(--f1) 28%,transparent),transparent 54%);` +
  `background-repeat:no-repeat}` +
  /* Northern Ireland — a flax field in bloom on linen; the weave is a 5px crosshatch */
  `html[data-lituk-tokens="hub"][data-accent="ni"] body::before{background:` +
  `radial-gradient(56% 40% at 50% 26%,color-mix(in srgb,var(--f1) 32%,transparent),transparent 70%),` +
  `radial-gradient(72% 44% at 50% 108%,color-mix(in srgb,var(--f1) 16%,transparent),transparent 74%),` +
  `repeating-linear-gradient(0deg,color-mix(in srgb,var(--fc) 10%,transparent) 0 1px,transparent 1px 5px),` +
  `repeating-linear-gradient(90deg,color-mix(in srgb,var(--fc) 10%,transparent) 0 1px,transparent 1px 5px)}` +
  /* Union — red cross over white diagonals over a navy field, all crossing at (50%,30%) */
  `html[data-lituk-tokens="hub"][data-accent="union"] body::before{background:` +
  `linear-gradient(90deg,transparent 43%,color-mix(in srgb,var(--f2) 22%,transparent) 48% 52%,transparent 57%),` +
  `linear-gradient(180deg,transparent 23%,color-mix(in srgb,var(--f2) 22%,transparent) 28% 32%,transparent 37%),` +
  `linear-gradient(56deg,transparent 44%,color-mix(in srgb,var(--fc) 14%,transparent) 48.7% 51.3%,transparent 56%),` +
  `linear-gradient(-56deg,transparent 44%,color-mix(in srgb,var(--fc) 14%,transparent) 48.7% 51.3%,transparent 56%),` +
  `radial-gradient(80% 58% at 50% 30%,color-mix(in srgb,var(--f1) 36%,transparent),transparent 72%);` +
  `background-size:auto,auto,100% 60%,100% 60%,auto;background-repeat:no-repeat}` +
  `</style>`;

/* ---------- the practice-test wash ----------
   The same idea as above and a different drawing, because the page underneath
   is a different shape. The hub is open — text straight on the paper, a flag
   behind it reads as a flag. This app is wall-to-wall opaque cards, and on a
   phone they cover all but a 16px gutter either side, the 12px between them,
   the tail below the last one, and the header.

   So the device is not what carries a nation here; the field is. Every flag
   below leads with a large soft radial at the top and another at the tail,
   which is what actually reaches the eye through the lattice the cards leave.
   The device is still drawn, high and soft, for the one surface that shows it
   whole: the header is 88% --bg over a backdrop-filter, so it samples this
   layer and the flag arrives through the glass.

   Quieter than the hub on purpose — this is the page you sit in front of for
   an hour, not one you pass through. Nothing here touches a card, so every
   word on the page is still on solid --panel at the contrast §3.2 solved for.

   Gold sets no data-accent and newsprint takes it off, so both simply do not
   match — no wash, nothing to undo. */
const TESTS_WASH =
  `<style>` + FLAG_VARS +
  `:root[data-lituk-tokens="tests"]{--flagwash:.46}` +
  `:root[data-lituk-tokens="tests"][data-theme="light"]{--flagwash:.28}` +
  `html[data-lituk-tokens="tests"][data-accent] body::before{content:"";position:fixed;inset:0;` +
  `z-index:-1;pointer-events:none;opacity:var(--flagwash);background-repeat:no-repeat}` +
  /* England — the red does the work; a white field on near-white paper is not
     a thing anyone can see, so the bloom only lifts the crossing. */
  `html[data-lituk-tokens="tests"][data-accent="england"] body::before{background:` +
  `radial-gradient(60% 26% at 50% 0%,color-mix(in srgb,var(--f2) 34%,transparent),transparent 72%),` +
  `linear-gradient(90deg,transparent 42%,color-mix(in srgb,var(--f1) 20%,transparent) 47% 53%,transparent 58%),` +
  `linear-gradient(180deg,transparent 6%,color-mix(in srgb,var(--f1) 20%,transparent) 11% 17%,transparent 23%),` +
  `radial-gradient(70% 40% at 50% 100%,color-mix(in srgb,var(--f1) 12%,transparent),transparent 74%)}` +
  /* Scotland — azure under the glass and at the tail, the saltire in the top 46% */
  `html[data-lituk-tokens="tests"][data-accent="scotland"] body::before{background:` +
  `linear-gradient(56deg,transparent 44%,color-mix(in srgb,var(--fc) 16%,transparent) 48.5% 51.5%,transparent 56%),` +
  `linear-gradient(-56deg,transparent 44%,color-mix(in srgb,var(--fc) 16%,transparent) 48.5% 51.5%,transparent 56%),` +
  `radial-gradient(80% 34% at 50% 0%,color-mix(in srgb,var(--f1) 34%,transparent),transparent 74%),` +
  `radial-gradient(74% 40% at 50% 100%,color-mix(in srgb,var(--f1) 18%,transparent),transparent 74%);` +
  `background-size:100% 46%,100% 46%,auto,auto}` +
  /* Wales — green rising from the tail, white off the top, the dragon's heat left of centre */
  `html[data-lituk-tokens="tests"][data-accent="wales"] body::before{background:` +
  `radial-gradient(52% 26% at 34% 4%,color-mix(in srgb,var(--f2) 24%,transparent),transparent 70%),` +
  `linear-gradient(180deg,color-mix(in srgb,var(--fc) 14%,transparent),transparent 34%),` +
  `linear-gradient(0deg,color-mix(in srgb,var(--f1) 30%,transparent),transparent 46%)}` +
  /* Northern Ireland — flax at both ends, and the weave, which is the one
     device that survives a 16px gutter: it reads as texture, not as a sliced shape. */
  `html[data-lituk-tokens="tests"][data-accent="ni"] body::before{background:` +
  `radial-gradient(64% 32% at 50% 0%,color-mix(in srgb,var(--f1) 32%,transparent),transparent 72%),` +
  `radial-gradient(74% 40% at 50% 100%,color-mix(in srgb,var(--f1) 18%,transparent),transparent 74%),` +
  `repeating-linear-gradient(0deg,color-mix(in srgb,var(--fc) 9%,transparent) 0 1px,transparent 1px 5px),` +
  `repeating-linear-gradient(90deg,color-mix(in srgb,var(--fc) 9%,transparent) 0 1px,transparent 1px 5px)}` +
  /* Union — navy at both ends, the red cross high, the white diagonals in the top 44% */
  `html[data-lituk-tokens="tests"][data-accent="union"] body::before{background:` +
  `linear-gradient(90deg,transparent 44%,color-mix(in srgb,var(--f2) 18%,transparent) 48% 52%,transparent 56%),` +
  `linear-gradient(180deg,transparent 7%,color-mix(in srgb,var(--f2) 18%,transparent) 12% 17%,transparent 22%),` +
  `linear-gradient(56deg,transparent 45%,color-mix(in srgb,var(--fc) 11%,transparent) 48.7% 51.3%,transparent 55%),` +
  `linear-gradient(-56deg,transparent 45%,color-mix(in srgb,var(--fc) 11%,transparent) 48.7% 51.3%,transparent 55%),` +
  `radial-gradient(86% 40% at 50% 0%,color-mix(in srgb,var(--f1) 34%,transparent),transparent 74%),` +
  `radial-gradient(76% 40% at 50% 100%,color-mix(in srgb,var(--f1) 20%,transparent),transparent 74%);` +
  `background-size:auto,auto,100% 44%,100% 44%,auto,auto}` +
  /* The cram sheet is printed. The page already resets every token to white and
     black for it, and a flag on the paper would fight that and the toner. */
  `@media print{html[data-lituk-tokens="tests"] body::before{display:none}}` +
  `</style>`;

/* Which set of colour token names a page speaks. app.js keys the accent
   palettes off this, so a page whose vocabulary has not been mapped cannot be
   reached by them at all — the gate is the selector, not a runtime check.
   "hub"   -- --page/--card/--line/--gold plus the era colours (18 pages).
   "tests" -- the practice-test app's --bg/--panel/--brand.
   Study Quest is absent on purpose: its fixed pink is the design, not a theme. */
const TOKENS = { "life-in-uk-mock-tests.html": "tests", "lituk.html": null };
const tokensOf = (file) => (file in TOKENS ? TOKENS[file] : "hub");

/* The layout half of the safe-area handling, inline so it lands on the first
   paint rather than after app.js defers in. No page styles html/body padding of
   its own, so cascade order does not matter here; the rules that do have to beat
   page CSS (.themeToggle, .hud, …) live in app.js and are appended last. */
const SAFE_SNIPPET =
  `<style>:root{--lituk-sat:env(safe-area-inset-top,0px);--lituk-sar:env(safe-area-inset-right,0px);` +
  `--lituk-sab:env(safe-area-inset-bottom,0px);--lituk-sal:env(safe-area-inset-left,0px);--lituk-inset:12px}` +
  `html{-webkit-text-size-adjust:100%;text-size-adjust:100%;padding-bottom:var(--lituk-sab)}` +
  `body{padding-left:var(--lituk-sal);padding-right:var(--lituk-sar)}` +
  `html:not([data-lituk-topbar]) body{padding-top:var(--lituk-sat)}` +
  `html[data-lituk-topbar] header{padding-top:var(--lituk-sat)}</style>`;

/* Which wash a page gets is its colour vocabulary, not a yes/no: the two are
   different drawings of the same flags against different page shapes, and a
   page with no vocabulary gets neither. */
function sharedHead({ theme = true, wash = null } = {}) {
  return [
    OPEN,
    `<link rel="manifest" href="manifest.webmanifest">`,
    `<link rel="icon" href="icons/icon-32.png" sizes="32x32" type="image/png">`,
    `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="Life in UK">`,
    /* Keeps the study hub out of search results. Deliberately a meta tag and
       not a robots.txt disallow: a disallow stops crawlers reading the page at
       all, so they never see this, and anything already indexed lingers. */
    `<meta name="robots" content="noindex">`,
    theme ? THEME_SNIPPET : null,
    SAFE_SNIPPET,
    wash === "hub" ? WASH_SNIPPET : wash === "tests" ? TESTS_WASH : null,
    `<script src="app.js" defer></script>`,
    CLOSE,
  ].filter(Boolean).join("\n");
}

/* ---------- viewport ----------
   Installed on iOS the web view runs edge to edge behind the status bar, and
   env(safe-area-inset-*) stays 0 unless the page asks for viewport-fit=cover.
   Without it the insets above are all no-ops and fixed controls sit under the
   status bar, where taps are swallowed. */
const VIEWPORT = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`;

function normalizeViewport(src, file) {
  const meta = /<meta\s+name="viewport"[^>]*\/?>/i;
  if (!meta.test(src)) throw new Error(`no viewport meta in ${file}`);
  return src.replace(meta, VIEWPORT);
}

const changes = [];
function note(file, what) { changes.push(`  ${file.padEnd(34)} ${what}`); }

function edit(file, fn) {
  const p = R(file);
  const before = fs.readFileSync(p, "utf8");
  const after = fn(before, file);
  if (after !== before) fs.writeFileSync(p, after);
  return after !== before;
}

/* ---------- 1. shared head block ---------- */
function injectHead(src, file) {
  const block = sharedHead({ theme: file !== "lituk.html", wash: tokensOf(file) });
  const existing = new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}\\n?`);
  if (existing.test(src)) return src.replace(existing, block + "\n");
  const m = src.match(/<\/title>/i);
  if (!m) throw new Error(`no </title> in ${file}`);
  const at = m.index + m[0].length;
  return src.slice(0, at) + "\n" + block + src.slice(at);
}

/* ---------- 2. one theme key ---------- */
const themeEdits = {
  // index.html: its own pre-paint snippet is now redundant; the toggle delegates.
  "index.html": [
    [/<script>\n  \/\* set theme before first paint so there's no flash \*\/\n  try \{\n    var t = localStorage\.getItem\("liuk-story-theme"\);\n    if \(t\) document\.documentElement\.dataset\.theme = t;\n  \} catch \(e\) \{\}\n<\/script>\n/, ""],
    [`btn.addEventListener("click", function () {
      root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem("liuk-story-theme", root.dataset.theme); } catch (e) {}
      label();
    });`,
      `btn.addEventListener("click", function () {
      LitUK.toggleTheme();
      label();
    });
    document.addEventListener("lituk:theme", label);`],
  ],

  story: [
    [`  /* theme */
  try {
    var saved = localStorage.getItem("liuk-story-theme");
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  } catch(e){}
  document.getElementById("themeToggle").addEventListener("click", function(){
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("liuk-story-theme", root.dataset.theme); } catch(e){}
  });`,
      `  /* theme — set pre-paint in <head>, shared across every page by app.js */
  document.getElementById("themeToggle").addEventListener("click", function(){
    LitUK.toggleTheme();
  });`],
  ],

  ref: [
    [`document.getElementById('themeToggle').onclick = function(){
  var cur = document.documentElement.getAttribute('data-theme');
  var dark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
};`,
      `/* Shared across every page, and now actually remembered. */
document.getElementById('themeToggle').onclick = function(){ LitUK.toggleTheme(); };`],
  ],

  "life-in-uk-quiz.html": [
    [`$('themeToggle').onclick = ()=>{
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur==='dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'light':'dark');
};`,
      `$('themeToggle').onclick = ()=>{ LitUK.toggleTheme(); };`],
  ],

  /* Two starting points, newest first: each edit's "already done" check is the
     presence of the target, so the state this repo is actually in has to be
     rewritten before the original one is looked for. */
  "life-in-uk-mock-tests.html": [
    [`function themeBtnLabel(){document.getElementById('themeBtn').textContent=document.documentElement.getAttribute('data-theme')==='dark'?'☀️':'🌙'}
function toggleTheme(){LitUK.toggleTheme();themeBtnLabel()}
document.addEventListener('lituk:theme',themeBtnLabel);
themeBtnLabel();`,
      `/* app.js replaces this button with the shared theme-and-colour picker and
   owns its label from there — relabelling it here would wipe the swatch. */
function toggleTheme(){LitUK.toggleTheme()}`],
    [`function toggleTheme(){const d=document.documentElement;const dark=d.getAttribute('data-theme')==='dark';d.setAttribute('data-theme',dark?'light':'dark');localStorage.setItem('lituk_theme',dark?'light':'dark');document.getElementById('themeBtn').textContent=dark?'🌙':'☀️'}
(function(){const s=localStorage.getItem('lituk_theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',s);document.getElementById('themeBtn').textContent=s==='dark'?'☀️':'🌙'})();`,
      `/* app.js replaces this button with the shared theme-and-colour picker and
   owns its label from there — relabelling it here would wipe the swatch. */
function toggleTheme(){LitUK.toggleTheme()}`],
  ],
};

function applyThemeEdits(src, file) {
  const sets = [];
  if (themeEdits[file]) sets.push(...themeEdits[file]);
  if (STORY.includes(file)) sets.push(...themeEdits.story);
  if (REF.includes(file)) sets.push(...themeEdits.ref);

  for (const [from, to] of sets) {
    if (from instanceof RegExp) { src = src.replace(from, to); continue; }
    if (src.includes(from)) src = src.split(from).join(to);
    else if (!src.includes(to)) throw new Error(`theme patch did not match in ${file}:\n${from.slice(0, 90)}…`);
  }
  return src;
}

/* ---------- 3. gutters ----------
   .wrap owns the page gutter, but a couple of modifier classes set the padding
   shorthand again for their vertical rhythm and silently reset it — so the
   prologue and every scene ran edge to edge. Longhand keeps both.

   Restoring the gutter moves the scene content in by 22px, but the act timeline
   rail is absolutely positioned against .scenes, whose padding box does not
   move — so the rail has to be offset by the gutter to stay under the dots.
   Hence --gutter rather than a second hard-coded 22. */
const gutterFixes = [
  // [what to rewrite, what it becomes, how to tell it has already been done]
  [/\.wrap \{ max-width:760px; margin:0 auto; padding:0 22px; \}/,
    ".wrap { --gutter:22px; max-width:760px; margin:0 auto; padding:0 var(--gutter); }",
    "padding:0 var(--gutter);"],
  [/(\.pro-inner \{[^}]*?)padding:70px 0 120px;/,
    "$1padding-top:70px; padding-bottom:120px;", "padding-top:70px; padding-bottom:120px;"],
  [/(\.scenes \{[^}]*?)padding:10px 0 30px;/,
    "$1padding-top:10px; padding-bottom:30px;", "padding-top:10px; padding-bottom:30px;"],
  [/(\.scenes::before \{[^}]*?)left:29px;/,
    "$1left:calc(var(--gutter, 0px) + 29px);", "calc(var(--gutter, 0px) + 29px)"],
  [/\.scenes::before \{ left:19px; \}/,
    ".scenes::before { left:calc(var(--gutter, 0px) + 19px); }", "calc(var(--gutter, 0px) + 19px)"],
];

function fixGutters(src, file) {
  if (!STORY.includes(file)) return src;
  for (const [from, to, done] of gutterFixes) {
    if (from.test(src)) src = src.replace(from, to);
    else if (!src.includes(done)) throw new Error(`gutter patch did not match in ${file}: ${from}`);
  }
  return src;
}

/* ---------- 4. saved reading positions ----------
   The ten chapter pages are the long ones, so they are the ones that remember
   how far you got. app.js does the work; this only flips the switch. The hub,
   the quiz and the tests apps are opted out — they are not read top to bottom,
   and a resume prompt over a test in progress would be nonsense. */
function markReadable(src, file) {
  if (!STORY.includes(file) && !REF.includes(file)) return src;
  if (/<html[^>]*\sdata-lituk-read\b/.test(src)) return src;
  const m = src.match(/<html\b[^>]*/);
  if (!m) throw new Error(`no <html> in ${file}`);
  return src.slice(0, m.index + m[0].length) + " data-lituk-read" + src.slice(m.index + m[0].length);
}

/* ---------- 4b. colour vocabulary ----------
   Static on <html> rather than set by app.js, so the accent and wash rules match
   on the very first paint instead of a frame later. */
function markTokens(src, file) {
  const vocab = tokensOf(file);
  src = src.replace(/ data-lituk-(?:aurora|tokens)(?:="[^"]*")?/g, "");
  if (!vocab) return src;
  const m = src.match(/<html\b[^>]*/);
  if (!m) throw new Error(`no <html> in ${file}`);
  return src.slice(0, m.index + m[0].length) + ` data-lituk-tokens="${vocab}"` + src.slice(m.index + m[0].length);
}

/* ---------- 5. per-page odds and ends ---------- */
function extras(src, file) {
  if (file === "lituk.html") {
    // Its own top bar already occupies the corner — put the hub link inside it.
    if (!src.includes('class="questHub"')) {
      src = src.replace(
        `  <div class="topbar">\n    <div class="avatar" id="avatarEmoji">🦊</div>`,
        `  <div class="topbar">\n    <a class="questHub" href="index.html" title="Back to the study hub" aria-label="Back to the study hub">←</a>\n    <div class="avatar" id="avatarEmoji">🦊</div>`
      );
      src = src.replace(
        `.topinfo{flex:1; min-width:0;}`,
        `.questHub{
  width:34px; height:34px; flex:0 0 auto; border-radius:50%;
  display:grid; place-items:center; text-decoration:none;
  color:var(--text); background:rgba(255,255,255,.10);
  border:1px solid var(--stroke); font-size:17px; font-weight:700;
}
.questHub:active{transform:scale(.94);}
.topinfo{flex:1; min-width:0;}`
      );
    }
    src = src.replace(`<html lang="en">`, `<html lang="en" data-lituk-nohub>`);
  }

  if (file === "life-in-uk-mock-tests.html") {
    // Sticky header already owns the top-left corner, and it — not <body> —
    // absorbs the status-bar inset so it stays flush while the page scrolls.
    src = src.replace(
      `<html lang="en" data-theme="light">`,
      `<html lang="en" data-theme="light" data-lituk-nohub data-lituk-topbar>`
    );
    src = src.replace(
      `<html lang="en" data-theme="light" data-lituk-nohub>`,
      `<html lang="en" data-theme="light" data-lituk-nohub data-lituk-topbar>`
    );
    if (!src.includes('class="hubLink"')) {
      src = src.replace(
        `<header>\n  <div class="hd">`,
        `<header>\n  <div class="hd">\n    <a class="hubLink" href="index.html" title="Back to the study hub" aria-label="Back to the study hub">←</a>`
      );
      src = src.replace(
        `.spacer{flex:1}`,
        `.hubLink{flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;` +
        `border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:16px;font-weight:700;text-decoration:none}\n` +
        `.hubLink:hover{border-color:var(--brand);color:var(--brand)}\n` +
        `.spacer{flex:1}`
      );
    }
  }

  return src;
}

/* ---------- run ---------- */
let touched = 0;
for (const file of ALL) {
  const did = edit(file, (src) => {
    src = injectHead(src, file);
    src = normalizeViewport(src, file);
    src = applyThemeEdits(src, file);
    src = fixGutters(src, file);
    src = markReadable(src, file);
    src = markTokens(src, file);
    return extras(src, file);
  });
  if (did) { touched++; note(file, "patched"); } else note(file, "already up to date");
}
console.log(changes.join("\n"));
console.log(`\n${touched}/${ALL.length} file(s) written.`);
