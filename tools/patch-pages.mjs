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

function sharedHead({ theme = true } = {}) {
  return [
    OPEN,
    `<link rel="manifest" href="manifest.webmanifest">`,
    `<link rel="icon" href="icons/icon-32.png" sizes="32x32" type="image/png">`,
    `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="Life in UK">`,
    theme ? THEME_SNIPPET : null,
    `<script src="app.js" defer></script>`,
    CLOSE,
  ].filter(Boolean).join("\n");
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

/* ---------- 3. per-page odds and ends ---------- */
function extras(src, file) {
  if (file === "lituk.html") {
    // Pinch-zoom is not ours to disable.
    src = src.replace(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />`,
      `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`
    );
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
    // Sticky header already owns the top-left corner.
    src = src.replace(`<html lang="en" data-theme="light">`, `<html lang="en" data-theme="light" data-lituk-nohub>`);
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
  const did = edit(file, (src) => extras(applyThemeEdits(injectHead(src, file), file), file));
  if (did) { touched++; note(file, "patched"); } else note(file, "already up to date");
}
console.log(changes.join("\n"));
console.log(`\n${touched}/${ALL.length} file(s) written.`);
