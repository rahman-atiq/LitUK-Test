# Nation Themes — Four Nations, One Union, and the Swatch Cull

Replace the eleven-accent colour row with six swatches that mean something — Gold
(the default) plus England, Scotland, Wales, Northern Ireland and the Union — and
make each nation a real theme: the flag drawn in light behind the masthead, the
nation's flag in the seal, a ribbon under the status bar, and a picker row that
reads as flags.

> Drafted 2026-09-03 against a clean working tree at `172956d`. Written to be
> executed cold by an independent agent: every hex value below is computed, every
> code change is given verbatim, and nothing is left to taste. Presentation only —
> no storage-key changes, no question content, no grading path, no new axis.
>
> **Preview:** https://claude.ai/code/artifact/5fc2a30a-bb3f-413f-af4c-bea2c7d0585e
> renders all twelve phone frames with the exact CSS in §3–§5. Look at it before
> starting; it is the visual acceptance reference.

## Conventions the implementer must follow

- Target device is an **iPhone 15 running the app as a Home Screen PWA**. Safari's
  limits decide what is viable. Do not run headless Chrome or any screenshot loop;
  visual checks are Atiq's job (§9).
- Commit messages are one plain sentence in the house style (see `git log`), e.g.
  `Six swatches that mean something: the four nations and the Union`.
- `node tools/patch-pages.mjs` regenerates the shared head block on all 19 pages.
  Never hand-edit anything between `<!-- lituk:shared -->` and `<!-- /lituk:shared -->`.
- Bump `VERSION` in [sw.js:7](sw.js#L7) or the installed PWA keeps the old row.
- Never repaint `--ink`, `--era1..6`, `--good/--bad/--warn`, `--t0..t4`, `--trap-*`
  from an accent. They carry meaning or carry the contrast.

---

## 1. Verified architecture facts

| # | Fact | Evidence |
|---|---|---|
| A-1 | Three axes: mode (`lituk_theme`), accent (`lituk_accent`, `data-accent`), skin (`lituk_skin`). Gold is the default and declares no CSS — no rule matches, each page's own palette stands. | [app.js:9-44](app.js#L9-L44) |
| A-2 | The accent id list lives in **two places** that must agree: `ACCENTS` in [app.js:32-44](app.js#L32-L44) and `ACCENTS` in [patch-pages.mjs:26](tools/patch-pages.mjs#L26), which bakes a regex into every page's pre-paint script. | [patch-pages.mjs:28-40](tools/patch-pages.mjs#L28-L40) |
| A-3 | Two token vocabularies: `hub` (18 pages: `--page/--card/--card-2/--line/--chip/--gold/--gold-dim`) and `tests` (mock-tests app: `--bg/--panel/--panel-2/--line/--chip/--brand/--accent/--ring`). Study Quest (`lituk.html`) has neither and is untouched. | [app.js:429-480](app.js#L429-L480), [patch-pages.mjs:68](tools/patch-pages.mjs#L68) |
| A-4 | The palette method, measured off every existing accent: neutral tokens keep the default's OKLCH **L and C to ±0.002** and turn only hue; `--gold` is solved to **4.6:1 on light / 7.9:1 on dark** against its own `--card`; `--gold-dim` is a plain hue-turn; tests `--brand` solves to 5.06 light (on `#FFFFFF`) / 7.07 dark (on `--panel`), `--accent` to 4.62 / 8.30; `--ring` is `--brand` + `33` light / `44` dark. | [app.js:410-428](app.js#L410-L428), verified by recomputation |
| A-5 | The swatch grid is fixed six-wide; six swatches is one row. The current `.lituk-sw i` rules paint a solid dot from `--sw-light`/`--sw-dark`. | [app.js:227-237](app.js#L227-L237) |
| A-6 | Every hub page has an aurora wash on `body::before` (three radials reading `--era4`, `--era3`, `--gold`), written inline by `WASH_SNIPPET` so it lands before first paint. `body::after` is claimed by nothing on any page. | [patch-pages.mjs:52-59](tools/patch-pages.mjs#L52-L59) |
| A-7 | Newsprint removes `data-accent` while on, so every accent rule stops matching. The skin also owns its own `body::before` halftone. Nothing here touches it. | [app.js:90-94](app.js#L90-L94), [app.js:556-558](app.js#L556-L558) |
| A-8 | The hub masthead seal is `<div class="flag" id="flagSeal"><img src="icons/flag-gb.svg"></div>`, styled with `font-size:36px` (it was built for a glyph). The egg code only toggles classes on the div — its children can be replaced freely. | [index.html:419](index.html#L419), [index.html:79-103](index.html#L79-L103), [app.js:1461-1466](app.js#L1461-L1466), [app.js:1797-1800](app.js#L1797-L1800) |
| A-9 | `monoEmoji()` wraps emoji in spans for the newsprint grayscale filter, via a regex that matches `Regional_Indicator` pairs and `Extended_Pictographic` runs — **but not the tag characters U+E0020–E007F** that spell the England/Scotland/Wales flags. Its MutationObserver stays on for the life of the page once newsprint has been used. | [app.js:675-678](app.js#L675-L678), [app.js:731-744](app.js#L731-L744) |
| A-10 | Boot order: `injectCSS(); injectHub(); setTheme; setSkin; setAccent; buildPicker(); syncThemeColor(); registerSW();` | [app.js:1962-1969](app.js#L1962-L1969) |

---

## 2. The six swatches

| id | Name | Field (paper) | Charge (text accent) | Origin |
|---|---|---|---|---|
| `gold` | Gold | as today | as today | unchanged, declares nothing |
| `england` | England | cool white, 250° at 0.6× chroma — St George's field is white, not pink | St George red, 22° | fresh (poppy's hue, cool paper) |
| `scotland` | Scotland | azure, 250° | saltire azure, 245° | slate re-solved |
| `wales` | Wales | green, 147° | flag green, 147° | ivy re-solved at the flag's hue |
| `ni` | Northern Ireland | **linen, 68°** (warm) | **flax, 266°** (soft, low chroma) | fresh — the one nation whose paper and accent differ in hue |
| `union` | Union | navy, 264° at **1.6× chroma** so it is a navy, not the default grey | royal indigo, 264°, vivid | fresh |

Deleted: rose, oak, slate, heather, poppy, bluebell, ivy, mint, gorse, blossom.

**The three blues.** Scotland (245°), NI (266°) and Union (264°) are separated on
purpose by *pairing and chroma*, not hue: Scotland is saturated azure on azure
paper; Union is vivid indigo on navy paper; NI is a quiet flax on warm linen. On
the picker they are further apart still — split discs of azure|white, indigo|red
and linen|flax. If the on-device check (§9) still muddles them, the pre-agreed
fallback is NI → shamrock-and-linen (paper unchanged, charge re-solved at 150° C
0.08). Do not improvise a different fix.

---

## 3. Palettes — verbatim

Solved by the A-4 method. Contrast column is what the values actually measure.

### 3.1 `ACCENT_CSS` (hub vocabulary) — replaces [app.js:429-449](app.js#L429-L449)

```js
  var ACCENT_CSS =
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"dark\"][data-accent=\"england\"]{--page:#0D0F12;--card:#181B20;--card-2:#1D232A;--line:#2A3139;--chip:#242A30;--gold:#FF908D;--gold-dim:#A0615F;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"light\"][data-accent=\"england\"]{--page:#EEF1F5;--card:#F9FBFE;--card-2:#E9EEF3;--line:#D8DDE4;--chip:#E6EAEF;--gold:#DD243B;--gold-dim:#D9A4A1;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"dark\"][data-accent=\"scotland\"]{--page:#0C1014;--card:#151C23;--card-2:#18242F;--line:#25323F;--chip:#212A34;--gold:#69B7F6;--gold-dim:#497AA3;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"light\"][data-accent=\"scotland\"]{--page:#ECF2F7;--card:#F8FBFF;--card-2:#E6EEF7;--line:#D4DEE8;--chip:#E3EBF3;--gold:#3277AD;--gold-dim:#92B8DA;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"dark\"][data-accent=\"wales\"]{--page:#0C100C;--card:#161D16;--card-2:#1A261B;--line:#263528;--chip:#222C23;--gold:#42C85D;--gold-dim:#538258;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"light\"][data-accent=\"wales\"]{--page:#EDF3ED;--card:#F8FCF8;--card-2:#E7F0E7;--line:#D6E0D6;--chip:#E4ECE5;--gold:#29833C;--gold-dim:#99BF9C;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"dark\"][data-accent=\"ni\"]{--page:#120E0A;--card:#201A13;--card-2:#2B2014;--line:#3B2E20;--chip:#31271D;--gold:#96B0EA;--gold-dim:#5E74A6;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"light\"][data-accent=\"ni\"]{--page:#F5F0EA;--card:#FEFAF6;--card-2:#F4EBE3;--line:#E5DBD1;--chip:#F0E8E0;--gold:#5871AE;--gold-dim:#A1B3DD;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"dark\"][data-accent=\"union\"]{--page:#0B0F17;--card:#151B28;--card-2:#172238;--line:#243049;--chip:#20293C;--gold:#89AFFF;--gold-dim:#5C75A6;}" +
    ":root[data-lituk-tokens=\"hub\"][data-theme=\"light\"][data-accent=\"union\"]{--page:#ECF1FC;--card:#F9FBFF;--card-2:#E5EDFE;--line:#D3DDF0;--chip:#E2EAF9;--gold:#366AE9;--gold-dim:#9FB4DD;}";
```

| accent | `--gold` dark on card | `--gold` light on card | body ink on card (default 14.71 / 14.79) |
|---|---|---|---|
| england | 7.91 | 4.61 | 14.72 / 14.78 |
| scotland | 7.94 | 4.62 | 14.65 / 14.76 |
| wales | 7.90 | 4.60 | 14.66 / 14.79 |
| ni | 7.96 | 4.61 | 14.69 / 14.75 |
| union | 7.91 | 4.61 | 14.68 / 14.79 |

### 3.2 `TESTS_ACCENT_CSS` (practice-test vocabulary) — replaces [app.js:460-480](app.js#L460-L480)

```js
  var TESTS_ACCENT_CSS =
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"dark\"][data-accent=\"england\"]{--bg:#0F141A;--panel:#161D25;--panel-2:#1D252D;--line:#26303B;--chip:#1F2933;--brand:#F68885;--accent:#FF9A97;--ring:#F6888544;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"light\"][data-accent=\"england\"]{--bg:#F7F9FB;--panel:#FFFFFF;--panel-2:#F2F5F8;--line:#DEE4EB;--chip:#E9EDF2;--brand:#D81C37;--accent:#DB3140;--ring:#D81C3733;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"dark\"][data-accent=\"scotland\"]{--bg:#0B141E;--panel:#111E2B;--panel-2:#172533;--line:#1F3042;--chip:#18293A;--brand:#61AFED;--accent:#73BDF9;--ring:#61AFED44;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"light\"][data-accent=\"scotland\"]{--bg:#F6F9FC;--panel:#FFFFFF;--panel-2:#F1F5FB;--line:#DAE5F0;--chip:#E6EEF6;--brand:#2D73A9;--accent:#3979AD;--ring:#2D73A933;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"dark\"][data-accent=\"wales\"]{--bg:#0C170D;--panel:#122114;--panel-2:#19281B;--line:#213423;--chip:#1A2D1C;--brand:#39C156;--accent:#54CE69;--ring:#39C15644;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"light\"][data-accent=\"wales\"]{--bg:#F6FAF6;--panel:#FFFFFF;--panel-2:#F1F7F2;--line:#DCE7DC;--chip:#E7F0E8;--brand:#247E37;--accent:#328441;--ring:#247E3733;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"dark\"][data-accent=\"ni\"]{--bg:#1B1107;--panel:#261A0C;--panel-2:#2E2112;--line:#3C2B18;--chip:#342411;--brand:#8DA7E1;--accent:#9CB5EE;--ring:#8DA7E144;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"light\"][data-accent=\"ni\"]{--bg:#FBF8F4;--panel:#FFFFFF;--panel-2:#F9F4EF;--line:#ECE1D6;--chip:#F3ECE4;--brand:#546DAA;--accent:#5B73AE;--ring:#546DAA33;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"dark\"][data-accent=\"union\"]{--bg:#0A1325;--panel:#101C34;--panel-2:#17233D;--line:#1E2E4F;--chip:#172646;--brand:#7CA6FF;--accent:#92B5FF;--ring:#7CA6FF44;}" +
    ":root[data-lituk-tokens=\"tests\"][data-theme=\"light\"][data-accent=\"union\"]{--bg:#F5F9FF;--panel:#FFFFFF;--panel-2:#F0F5FE;--line:#D9E4F8;--chip:#E6EDFC;--brand:#3265E4;--accent:#3B6DE5;--ring:#3265E433;}";
```

| accent | brand/panel dark | on-solid on brand dark | brand/white light | accent/panel dark · light |
|---|---|---|---|---|
| england | 7.10 | 7.44 | 5.07 | 8.35 · 4.64 |
| scotland | 7.12 | 7.52 | 5.08 | 8.34 · 4.65 |
| wales | 7.13 | 7.58 | 5.10 | 8.31 · 4.65 |
| ni | 7.08 | 7.42 | 5.07 | 8.30 · 4.66 |
| union | 7.07 | 7.43 | 5.10 | 8.30 · 4.66 |

---

## 4. The wash becomes the flag — `WASH_SNIPPET` in patch-pages.mjs

Inline for the same reason the default wash is: it paints the background, so it
cannot wait for a deferred script. Append the following **inside the same
`<style>`** in [patch-pages.mjs:52-59](tools/patch-pages.mjs#L52-L59), after the
existing `body::before` rule (i.e. insert before the closing `</style>`). The
selectors carry two attributes on `html`, so they outrank the default wash without
`!important`. Gold and every non-hub page are pixel-identical to today.

```js
  /* The nations. Flag colours are fixed; the charge (--fc) flips per mode where a
     white line would vanish on light paper. Every flag is drawn in the top 60% of
     the viewport so it crosses behind the masthead at (50%,30%), not behind the
     body text; the layers that must meet there are sized to that box. */
  `:root[data-accent="england"]{--f1:#CE1124;--f2:#FFFFFF}` +
  `:root[data-accent="scotland"]{--f1:#005EB8;--fc:#FFFFFF}:root[data-theme="light"][data-accent="scotland"]{--fc:#005EB8}` +
  `:root[data-accent="wales"]{--f1:#00B140;--f2:#D30731;--fc:#FFFFFF}` +
  `:root[data-accent="ni"]{--f1:#7C8FDB;--fc:#FAF0E6}:root[data-theme="light"][data-accent="ni"]{--fc:#7C8FDB}` +
  `:root[data-accent="union"]{--f1:#012169;--f2:#C8102E;--fc:#FFFFFF}:root[data-theme="light"][data-accent="union"]{--fc:#012169}` +
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
```

The tests page has no wash layer and gets none — its nation character is the
palette alone. Newsprint is unaffected (A-7).

---

## 5. Chrome — picker discs, ribbon, seal (app.js)

### 5.1 `ACCENTS` — replaces [app.js:32-44](app.js#L32-L44)

`disc` is the picker disc as `[field, charge]` in flag colours, the same in both
modes. Gold has no disc entry: its button paints the live `--gold`, exactly as
today, so the default's dot is still literally the colour in force.

```js
  var ACCENTS = [
    { id: "gold",     name: "Gold" },
    { id: "england",  name: "England",          disc: ["#FFFFFF", "#CE1124"] },
    { id: "scotland", name: "Scotland",         disc: ["#005EB8", "#FFFFFF"] },
    { id: "wales",    name: "Wales",            disc: ["#00B140", "#D30731"] },
    { id: "ni",       name: "Northern Ireland", disc: ["#FAF0E6", "#7C8FDB"] },
    { id: "union",    name: "Union",            disc: ["#012169", "#C8102E"] }
  ];
```

Rewrite the comment above it ([app.js:14-31](app.js#L14-L31)) to say: mode and
accent are separate axes; gold declares nothing; each nation is a *field* (paper,
hue-turned by the method in §3) and a *charge* (text accent, contrast-solved); NI
is the one whose field and charge differ in hue, deliberately; the disc on the
picker is the flag, the dot on the pill is the live colour.

### 5.2 Picker — in `buildPicker()` and `PICKER_CSS`

In `buildPicker()`, replace the two `--sw-light`/`--sw-dark` lines
([app.js:308-309](app.js#L308-L309)) with:

```js
        var live = "var(--gold,var(--brand,currentColor))";
        b.style.setProperty("--sw-a", a.disc ? a.disc[0] : live);
        b.style.setProperty("--sw-b", a.disc ? a.disc[1] : live);
```

In `PICKER_CSS`, replace the four rules at [app.js:234-237](app.js#L234-L237) with
two (the pressed ring is the live accent, as the mode buttons already do, so it is
always visible — a white charge could not be):

```js
    ".lituk-sw i{width:16px;height:16px;border-radius:50%;background:linear-gradient(135deg,var(--sw-a) 50%,var(--sw-b) 50%)}" +
    ".lituk-sw button[aria-pressed=\"true\"]{border-width:2px;border-color:var(--gold,var(--brand,currentColor))}" +
```

Update the grid comment at [app.js:227-231](app.js#L227-L231): six discs fill the
six-wide grid exactly; keep the grid.

### 5.3 Ribbon — new `RIBBON_CSS`, appended in `injectCSS()`

A 3px bar under the status bar on every tokened page. Gated on `data-lituk-tokens`
so Study Quest never gets one; gated on `data-accent` so newsprint and gold never
do. `body::after` is unclaimed everywhere (A-6).

```js
  var RIBBON_CSS =
    "html[data-lituk-tokens][data-accent] body::after{content:\"\";position:fixed;left:0;right:0;top:var(--lituk-sat);height:3px;z-index:65;pointer-events:none;opacity:.9}" +
    "html[data-accent=\"england\"] body::after{background:#CE1124}" +
    "html[data-accent=\"scotland\"] body::after{background:#005EB8}" +
    "html[data-accent=\"wales\"] body::after{background:linear-gradient(90deg,#00B140 0 50%,#D30731 50%)}" +
    "html[data-accent=\"ni\"] body::after{background:#7C8FDB}" +
    "html[data-accent=\"union\"] body::after{background:linear-gradient(90deg,#012169 0 34%,#FFFFFF 34% 42%,#C8102E 42% 58%,#FFFFFF 58% 66%,#012169 66%)}" +
    "@media print{html[data-accent] body::after{display:none}}";
```

In `injectCSS()` ([app.js:642](app.js#L642)) add `+ RIBBON_CSS` after `EGG_CSS`.

### 5.4 Seal — the masthead flag follows the nation

New file `icons/flag-ni.svg` (flax on linen, drawn — NI has no emoji flag and the
flax is the emblem every side of the room accepts):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="60" height="30">
  <rect width="60" height="30" fill="#FAF0E6"/>
  <g transform="translate(30 15)" fill="#7C8FDB" stroke="#5F6FC2" stroke-width=".5">
    <ellipse cx="0" cy="-6" rx="3.1" ry="5.4"/>
    <ellipse cx="0" cy="-6" rx="3.1" ry="5.4" transform="rotate(72)"/>
    <ellipse cx="0" cy="-6" rx="3.1" ry="5.4" transform="rotate(144)"/>
    <ellipse cx="0" cy="-6" rx="3.1" ry="5.4" transform="rotate(216)"/>
    <ellipse cx="0" cy="-6" rx="3.1" ry="5.4" transform="rotate(288)"/>
  </g>
  <circle cx="30" cy="15" r="2.4" fill="#F2C94C"/>
</svg>
```

Add it to the core cache list in `sw.js` next to `icons/flag-gb.svg`.

New function in app.js, placed after `setSkin`/`toggleSkin`. England, Scotland and
Wales are the emoji subdivision flags (iOS draws the dragon; Windows shows a plain
black flag and is not a target — the escapes are used so the invisible tag
characters survive copy-paste):

```js
  /* ---------------- the seal ----------------
     The hub's masthead flag follows the nation. Three of them are the emoji
     subdivision flags, which iOS draws properly (the dragon included); Northern
     Ireland has no emoji flag and gets the flax, drawn. Gold, the Union and
     newsprint all show the Union flag the page shipped with. */
  var SEALS = {
    england:  "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F",
    scotland: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F",
    wales:    "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F",
    ni:       "icons/flag-ni.svg"
  };

  function seal() {
    var s = document.getElementById("flagSeal");
    if (!s) return;
    var a = currentSkin() === "news" ? "gold" : currentAccent();
    var want = SEALS[a] || "icons/flag-gb.svg";
    if (s.getAttribute("data-seal") === want) return;
    s.setAttribute("data-seal", want);
    s.textContent = "";
    if (/\.svg$/.test(want)) {
      var img = document.createElement("img");
      img.src = want; img.alt = ""; img.width = 60; img.height = 30;
      s.appendChild(img);
    } else {
      s.appendChild(document.createTextNode(want));
    }
  }
  document.addEventListener("lituk:accent", seal);
  document.addEventListener("lituk:skin", seal);
```

In the boot block ([app.js:1962-1969](app.js#L1962-L1969)) call `seal();`
immediately after `setAccent(currentAccent(), true);`.

**Required regex fix (A-9).** Without it, one newsprint session leaves an observer
that later wraps only the `🏴` of a nation flag and orphans its tag characters, and
the seal shows a black flag from then on. In [app.js:678](app.js#L678) change

```js
      "|\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)+", "gu");
```
to
```js
      "|\\p{Extended_Pictographic}\\uFE0F?[\\u{E0020}-\\u{E007F}]*(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)+", "gu");
```

---

## 6. Migration of stored accents

Ten ids die. Nearest-nation map, applied in **both** places that read the key, both
idempotent (a mapped value passes through untouched on every later visit):

```
rose → england    poppy → england    blossom → england
oak  → wales      ivy   → wales      mint    → wales
slate → scotland
heather → union   bluebell → union
gorse → gold
```

**patch-pages.mjs** — [line 26](tools/patch-pages.mjs#L26) becomes
`const ACCENTS = ["gold", "england", "scotland", "wales", "ni", "union"];` and in
`THEME_SNIPPET`, directly after the line `` `var _a=localStorage.getItem("lituk_accent");` + ``, insert:

```js
  `var _m={rose:"england",poppy:"england",blossom:"england",oak:"wales",ivy:"wales",mint:"wales",slate:"scotland",heather:"union",bluebell:"union",gorse:"gold"};` +
  `if(_m[_a]){_a=_m[_a];localStorage.setItem("lituk_accent",_a)}` +
```

**app.js** — add after `ACCENTS`, and use it in `currentAccent()`
([app.js:78-83](app.js#L78-L83)); the belt for the pre-paint's braces, because an
installed PWA can serve one stale cached page after the update:

```js
  var LEGACY_ACCENTS = { rose: "england", poppy: "england", blossom: "england", oak: "wales", ivy: "wales", mint: "wales", slate: "scotland", heather: "union", bluebell: "union", gorse: "gold" };

  function currentAccent() {
    var a = document.documentElement.getAttribute("data-accent");
    if (isAccent(a)) return a;
    try { a = localStorage.getItem(ACCENT_KEY); } catch (e) { a = null; }
    if (LEGACY_ACCENTS[a]) { a = LEGACY_ACCENTS[a]; try { localStorage.setItem(ACCENT_KEY, a); } catch (e) {} }
    return isAccent(a) ? a : "gold";
  }
```

---

## 7. Execution order — four commits

1. **Palettes and the row.** §3.1, §3.2, §5.1, §5.2, §6 (both files), the comment
   rewrites at [app.js:14-31](app.js#L14-L31), [227-231](app.js#L227-L231),
   [410-428](app.js#L410-L428), [451-459](app.js#L451-L459) and
   [patch-pages.mjs:22-26](tools/patch-pages.mjs#L22-L26). Run
   `node tools/patch-pages.mjs`. Commit.
2. **The flag wash.** §4. Run `node tools/patch-pages.mjs`. Commit.
3. **Seal and ribbon.** §5.3, §5.4 including the regex fix and `icons/flag-ni.svg`.
   Commit.
4. **Ship.** Bump `VERSION` in [sw.js:7](sw.js#L7) to `2026-09-03a` (or the
   current date) and add `icons/flag-ni.svg` to the core cache list. Commit.

Do not reorder: 1 is useful alone, 2 and 3 each stand on 1, and 4 must be last or
the PWA serves a half-shipped mix.

---

## 8. Self-check before handing over (one script, not committed)

Paste into `node` from the repo root after commit 1. It reads the two accent
blocks straight out of app.js and recomputes every contrast. Expected: every
`hub light` ≥ 4.60, `hub dark` ≥ 7.90, `tests light` ≥ 5.06, `tests dark` ≥ 7.07.

```js
const src=require("fs").readFileSync("app.js","utf8");
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const cr=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return ((x+.05)/(y+.05)).toFixed(2)};
for(const m of src.matchAll(/\[data-lituk-tokens=\\"(hub|tests)\\"\]\[data-theme=\\"(\w+)\\"\]\[data-accent=\\"(\w+)\\"\]\{([^}]+)\}/g)){
  const t=Object.fromEntries(m[4].split(";").filter(Boolean).map(s=>s.split(":")));
  const fg=t["--gold"]||t["--brand"], bg=t["--card"]||t["--panel"];
  console.log(m[1].padEnd(5),m[2].padEnd(5),m[3].padEnd(8),fg,"on",bg,cr(fg,bg));
}
```

Also confirm: `grep -c 'data-accent' index.html` shows the pre-paint regex now
lists exactly the six ids; `git diff --stat` after `patch-pages` touches 19 pages.

---

## 9. On-device acceptance (Atiq, iPhone 15 PWA, ~5 minutes)

- Picker open: **six discs, one row**; the three blues read apart. If not →
  §2 fallback for NI, nothing else.
- Each nation on the hub, dark then light: the flag is *there* behind the
  masthead without shouting; body text everywhere still comfortable. England's
  upright should read as light through a window, not a stripe — if it fights the
  text column, drop both England `24%` mixes to `18%` and stop there.
- Wales and Union: the red is a presence, not a stain.
- Seal shows the nation's flag; the dragon is a dragon. Newsprint on → seal
  returns to the Union flag in grey; off → nation flag returns intact (this is
  the A-9 regex test).
- Practice Tests under each nation, one glance per mode. No ribbon on Study Quest.
- Migration: Safari devtools, set `lituk_accent` to `bluebell`, reload → page
  paints Union, storage reads `union`.

## What deliberately does not change

Era chapter colours, `--good/--bad`, topic colours; the newsprint skin; Study
Quest's pink; the `lituk_accent` key; gold as the default and the app's identity;
the dot on the pill. No fourth axis, no per-nation fonts, no flag images beyond
one drawn flax. The country arrives as light, a seal and a ribbon — not bunting.
