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
const ALL = ["index.html", ...STORY, ...REF, "life-in-uk-quiz.html", "life-in-uk-mock-tests.html", "lituk.html"];

const OPEN = "<!-- lituk:shared -->";
const CLOSE = "<!-- /lituk:shared -->";

const THEME_SNIPPET =
  `<script>/* theme before first paint — one key for every page */try{var _t=localStorage.getItem("lituk_theme")||localStorage.getItem("liuk-story-theme");` +
  `if(_t!=="light"&&_t!=="dark")_t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
  `document.documentElement.setAttribute("data-theme",_t);localStorage.setItem("lituk_theme",_t)}catch(e){}</script>`;

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

function sharedHead({ theme = true } = {}) {
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
  const block = sharedHead({ theme: file !== "lituk.html" });
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

  "life-in-uk-mock-tests.html": [
    [`function toggleTheme(){const d=document.documentElement;const dark=d.getAttribute('data-theme')==='dark';d.setAttribute('data-theme',dark?'light':'dark');localStorage.setItem('lituk_theme',dark?'light':'dark');document.getElementById('themeBtn').textContent=dark?'🌙':'☀️'}
(function(){const s=localStorage.getItem('lituk_theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',s);document.getElementById('themeBtn').textContent=s==='dark'?'☀️':'🌙'})();`,
      `function themeBtnLabel(){document.getElementById('themeBtn').textContent=document.documentElement.getAttribute('data-theme')==='dark'?'☀️':'🌙'}
function toggleTheme(){LitUK.toggleTheme();themeBtnLabel()}
document.addEventListener('lituk:theme',themeBtnLabel);
themeBtnLabel();`],
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

/* ---------- 4. per-page odds and ends ---------- */
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
    return extras(src, file);
  });
  if (did) { touched++; note(file, "patched"); } else note(file, "already up to date");
}
console.log(changes.join("\n"));
console.log(`\n${touched}/${ALL.length} file(s) written.`);
