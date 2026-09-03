/* ============================================================
   Shared runtime for every page in the Life in the UK study hub.
   Owns: one theme across all pages, the back-to-hub pill, saved reading
   positions, service-worker registration, and ?find= highlighting.
   ============================================================ */
(function () {
  "use strict";

  var THEME_KEY = "lituk_theme";
  var LEGACY_THEME_KEYS = ["liuk-story-theme"];
  var ACCENT_KEY = "lituk_accent";
  var SKIN_KEY = "lituk_skin";

  /* The colour half of the theme. Mode (light/dark) and accent are separate
     axes: every accent ships both modes, so the two never have to agree.
     "gold" is what the pages already paint, so it declares nothing at all —
     picking it means no rule matches and each page's own palette stands.

     The other five are the four nations and the Union, and each is two things:
     a *field* — the paper, hue-turned from the default by the method the
     palettes below describe, so it reads as a tint rather than a colour — and
     a *charge*, the accent that carries text, solved per hue for contrast
     against its own card. Northern Ireland is the one whose field and charge
     differ in hue on purpose: flax blue on linen, because a flax field is what
     it has instead of a flag everyone agrees on.

     "disc" is the flag on the picker button, in flag colours and the same in
     both modes — a split disc of field and charge. Gold has none: its button
     paints the live --gold, so the default's dot is still literally the colour
     in force. */
  var ACCENTS = [
    { id: "gold",     name: "Gold" },
    { id: "england",  name: "England",          disc: ["#FFFFFF", "#CE1124"] },
    { id: "scotland", name: "Scotland",         disc: ["#005EB8", "#FFFFFF"] },
    { id: "wales",    name: "Wales",            disc: ["#00B140", "#D30731"] },
    { id: "ni",       name: "Northern Ireland", disc: ["#FAF0E6", "#7C8FDB"] },
    { id: "union",    name: "Union",            disc: ["#012169", "#C8102E"] }
  ];

  /* Ten accents were named for plants and weather before they were named for
     the nations. A stored one of those is mapped to its nearest nation on the
     way out of localStorage and written back, so the walk happens once. The
     same map is in the pre-paint snippet in tools/patch-pages.mjs; this is the
     belt for its braces, because an installed PWA can serve one stale cached
     page after an update. */
  var LEGACY_ACCENTS = { rose: "england", poppy: "england", blossom: "england", oak: "wales", ivy: "wales", mint: "wales", slate: "scotland", heather: "union", bluebell: "union", gorse: "gold" };

  /* ---------------- theme ---------------- */

  function stored() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      for (var i = 0; !t && i < LEGACY_THEME_KEYS.length; i++) t = localStorage.getItem(LEGACY_THEME_KEYS[i]);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) { return null; }
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") || stored() ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function setTheme(t, quiet) {
    if (t !== "light" && t !== "dark") return;
    document.documentElement.setAttribute("data-theme", t);
    if (!quiet) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
    syncThemeColor();
    document.dispatchEvent(new CustomEvent("lituk:theme", { detail: t }));
  }

  function toggleTheme() { setTheme(current() === "dark" ? "light" : "dark"); return current(); }

  /* ---------------- accent ---------------- */

  function isAccent(a) {
    for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i].id === a) return true;
    return false;
  }

  function currentAccent() {
    var a = document.documentElement.getAttribute("data-accent");
    if (isAccent(a)) return a;
    try { a = localStorage.getItem(ACCENT_KEY); } catch (e) { a = null; }
    if (LEGACY_ACCENTS[a]) { a = LEGACY_ACCENTS[a]; try { localStorage.setItem(ACCENT_KEY, a); } catch (e) {} }
    return isAccent(a) ? a : "gold";
  }

  /* Newsprint has no accent to show, so it does not merely outrank the accent
     rules — it takes the attribute they gate on off the page entirely. That is
     the whole of the interaction between the two axes: no specificity race, no
     block that has to be written twice, and the choice itself survives in
     localStorage ready for the moment the paper goes back to normal. */
  function applyAccent(a) {
    var root = document.documentElement;
    if (currentSkin() === "news") root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", isAccent(a) ? a : currentAccent());
  }

  function setAccent(a, quiet) {
    if (!isAccent(a)) return;
    if (!quiet) { try { localStorage.setItem(ACCENT_KEY, a); } catch (e) {} }
    applyAccent(a);
    syncThemeColor();
    document.dispatchEvent(new CustomEvent("lituk:accent", { detail: a }));
  }

  /* ---------------- skin ----------------
     The third axis. Mode and accent describe a colour scheme; this one decides
     whether the app is in colour at all. "news" is the newsprint skin: every
     token collapses to a neutral grey, the type turns serif and the lift comes
     off everything, so the page reads as something printed rather than lit.

     It is independent of mode on purpose, because the two editions are both
     worth having — night is true #000, which on an OLED phone is pixels that
     are actually off, and day is grey stock with black ink. */
  function currentSkin() {
    if (document.documentElement.getAttribute("data-skin") === "news") return "news";
    var s = null;
    try { s = localStorage.getItem(SKIN_KEY); } catch (e) {}
    return s === "news" ? "news" : "normal";
  }

  function setSkin(s, quiet) {
    if (s !== "news" && s !== "normal") return;
    /* Study Quest declares no colour vocabulary, and the newsprint palettes gate
       on that attribute exactly as the accents do. Its pink is the design rather
       than a theme, so the skin does not follow the reader onto it — and does
       not half-apply either, which is what leaving the attribute on would do:
       the serif, the halftone and the grey emoji with none of the palette. */
    if (!vocabulary()) return;
    if (s === "news") document.documentElement.setAttribute("data-skin", "news");
    else document.documentElement.removeAttribute("data-skin");
    if (!quiet) { try { localStorage.setItem(SKIN_KEY, s); } catch (e) {} }
    applyAccent();
    if (s === "news") monoEmoji();
    syncThemeColor();
    document.dispatchEvent(new CustomEvent("lituk:skin", { detail: s }));
  }

  function toggleSkin() { setSkin(currentSkin() === "news" ? "normal" : "news"); return currentSkin(); }

  /* ---------------- the seal ----------------
     The masthead flag follows the nation. Three of them are the emoji
     subdivision flags, which iOS draws properly (the dragon included); Northern
     Ireland has no emoji flag and gets the flax, drawn. Gold, the Union and
     newsprint all show the Union flag the page shipped with.

     Two pages carry one: the hub's 82px seal, and the practice-test app's 24px
     header mark, which is the same idea at the size a toolbar allows. Both are
     a container with an <img> in it and nothing else, so both are refilled the
     same way. .brand exists on the tests page alone, which is what keeps this
     off the half-dozen other pages that happen to have a .flag.

     Written as escapes rather than as the characters themselves because the
     tag characters that spell "gbeng" are invisible — pasted through anything
     that trims them, the flag silently becomes a black rectangle. */
  var SEALS = {
    england:  "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F",
    scotland: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F",
    wales:    "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F",
    ni:       "icons/flag-ni.svg"
  };

  function seal() {
    var s = document.getElementById("flagSeal") || document.querySelector(".brand .flag");
    if (!s) return;
    var a = currentSkin() === "news" ? "gold" : currentAccent();
    var want = SEALS[a] || "icons/flag-gb.svg";
    /* The egg code only ever toggles classes on this div, so replacing its
       children is safe — but only if it happens once per change, or a tap
       animation would be cut off by a rebuild that changed nothing. */
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

  /* Keep the browser/status-bar chrome matching whatever the page actually paints. */
  function syncThemeColor() {
    if (!document.body) return;
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === "transparent" || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) return;
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.setAttribute("content", bg);
  }

  /* Another tab changed the theme — follow it. */
  addEventListener("storage", function (e) {
    if (e.key === THEME_KEY && e.newValue) setTheme(e.newValue, true);
    if (e.key === ACCENT_KEY && e.newValue) setAccent(e.newValue, true);
    if (e.key === SKIN_KEY) setSkin(e.newValue === "news" ? "news" : "normal", true);
  });

  /* ---------------- shared shell ---------------- */

  /* Injected last, so single-class rules here beat the page's own copy of the
     same selector without needing !important. */

  /* Installed on iOS the app runs behind the status bar and the home indicator,
     so every page has to inset itself. env() only reports real numbers once the
     page opts into viewport-fit=cover — which patch-pages.mjs now guarantees —
     and reports 0 in a plain browser tab, where these rules go quiet. */
  var SAFE_CSS =
    ":root{--lituk-sat:env(safe-area-inset-top,0px);--lituk-sar:env(safe-area-inset-right,0px);" +
    "--lituk-sab:env(safe-area-inset-bottom,0px);--lituk-sal:env(safe-area-inset-left,0px);" +
    "--lituk-inset:12px}" +
    /* 100% stops iOS inflating body text on its own once a page goes full-bleed. */
    "html{-webkit-text-size-adjust:100%;text-size-adjust:100%;padding-bottom:var(--lituk-sab)}" +
    "body{padding-left:var(--lituk-sal);padding-right:var(--lituk-sar)}" +
    "html:not([data-lituk-topbar]) body{padding-top:var(--lituk-sat)}" +
    /* A page with its own sticky bar keeps the bar flush and pads it instead —
       otherwise it detaches from the top edge on scroll. */
    "html[data-lituk-topbar] header{padding-top:var(--lituk-sat)}" +
    /* The two fixed corner pills. Under the status bar they render but never
       receive taps, so they clear it by the same inset as everything else. */
    ".themeToggle{top:calc(var(--lituk-sat) + var(--lituk-inset));" +
    "right:calc(var(--lituk-sar) + var(--lituk-inset));" +
    "min-height:34px;display:inline-flex;align-items:center;justify-content:center}" +
    /* Fixed furniture along the bottom edge clears the home indicator. */
    ".hud{bottom:calc(var(--lituk-sab) + 14px);" +
    "width:min(560px,calc(100vw - var(--lituk-sal) - var(--lituk-sar) - 24px))}" +
    "#mascot{bottom:calc(var(--lituk-sab) + 18px)}" +
    ".bubble{bottom:calc(var(--lituk-sab) + 150px)}";

  /* ---------------- the picker ----------------
     The button itself keeps the .themeToggle class each page already styles, so
     it stays where that page put it and looks like it belongs there. Only the
     panel below is ours, and it is positioned off the same insets as the button
     rather than measured — one less thing to get wrong on a page that has
     restyled the button. */
  /* --gold on the hub pages, --brand in the practice-test app: the picker paints
     itself in whatever the current page calls its accent, so the swatch on the
     button always shows the colour actually in force. */
  var PICKER_CSS =
    ".themeToggle{z-index:70}" +
    ".lituk-pal,.lituk-pal *{box-sizing:border-box}" +
    ".lituk-dot{width:9px;height:9px;border-radius:50%;background:var(--gold,var(--brand,currentColor));" +
    "box-shadow:0 0 0 2px color-mix(in srgb,var(--gold,var(--brand,currentColor)) 26%,transparent);" +
    "display:inline-block;flex:none;margin-right:2px}" +
    ".lituk-pal{position:fixed;z-index:71;" +
    /* replaced by place() the moment it opens; this is only the first frame */
    "top:calc(var(--lituk-sat) + var(--lituk-inset) + 42px);" +
    "right:calc(var(--lituk-sar) + var(--lituk-inset));" +
    "min-width:184px;padding:12px;border-radius:12px;" +
    "font:600 .72rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid var(--line,var(--stroke,rgba(128,128,128,.35)));" +
    "box-shadow:0 1px 2px rgba(0,0,0,.18),0 12px 34px rgba(0,0,0,.24);" +
    "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);" +
    "transform-origin:top right;animation:lituk-pop .13s ease-out}" +
    "@keyframes lituk-pop{from{opacity:0;transform:scale(.94) translateY(-4px)}}" +
    "@media (prefers-reduced-motion:reduce){.lituk-pal{animation:none}}" +
    ".lituk-pal[hidden],.lituk-pal [hidden]{display:none}" +
    ".lituk-pal h4{margin:0 0 7px;font:inherit;font-size:.62rem;letter-spacing:.14em;" +
    "text-transform:uppercase;color:var(--ink-3,var(--muted,#888))}" +
    ".lituk-pal h4+*{margin-bottom:13px}" +
    ".lituk-row{display:flex;gap:6px}" +
    ".lituk-pal button{font:inherit;cursor:pointer;color:inherit;border-radius:8px;" +
    "border:1px solid var(--line,rgba(128,128,128,.35));background:transparent;" +
    "transition:border-color .12s ease,transform .12s ease}" +
    ".lituk-pal button:active{transform:scale(.95)}" +
    ".lituk-mode button{flex:1;padding:7px 4px}" +
    ".lituk-mode button[aria-pressed=\"true\"]{border-color:var(--gold,var(--brand,currentColor));" +
    "background:color-mix(in srgb,var(--gold,var(--brand,currentColor)) 13%,transparent)}" +
    /* Six discs fill the fixed six-wide grid exactly, one row. The grid stays
       anyway: it was put here because dots in a flex line grew wider than the
       phone the panel opens on, and it is what keeps a seventh swatch costing
       a row rather than width. min-width is a floor, not a cap, so the panel
       sizes itself to the grid.

       The disc is the flag — field and charge split on the diagonal, the same
       in both modes, so the row reads as flags rather than as paint. The
       pressed ring is the live accent instead, as the mode buttons already do:
       a white charge could not have drawn a ring anyone would see. */
    ".lituk-sw{display:grid;grid-template-columns:repeat(6,28px)}" +
    ".lituk-sw button{width:28px;height:28px;padding:0;display:grid;place-items:center;border-radius:50%}" +
    ".lituk-sw i{width:16px;height:16px;border-radius:50%;background:linear-gradient(135deg,var(--sw-a) 50%,var(--sw-b) 50%)}" +
    ".lituk-sw button[aria-pressed=\"true\"]{border-width:2px;border-color:var(--gold,var(--brand,currentColor))}" +
    ".lituk-pal button:focus-visible,.themeToggle:focus-visible{outline:2px solid var(--gold,var(--brand,currentColor));outline-offset:2px}" +
    "@media print{.lituk-pal,.themeToggle{display:none}}";

  /* Every page carries its own copy of the toggle and its own two-line script to
     drive it — and two different labels between them. Replacing the node drops
     that listener along with it (the page's inline script has already run by the
     time a deferred script does), so the control below is the only one live. */
  function buildPicker() {
    /* The corner pill on eighteen pages, the header icon on the practice-test
       app. Either way the replacement keeps the id and class it found, so the
       page's own styling and layout still apply to it. */
    var old = document.getElementById("themeToggle") || document.getElementById("themeBtn");
    if (!old || document.querySelector(".lituk-pal")) return;
    /* An emoji-only button is an icon in someone's toolbar — it gets the swatch
       alone, because the word would burst a square. */
    var iconOnly = old.textContent.trim().length <= 2;

    var btn = document.createElement("button");
    btn.className = old.className || "themeToggle";
    btn.id = old.id;
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Theme and colour");
    btn.style.gap = "7px";
    btn.appendChild(Object.assign(document.createElement("span"), { className: "lituk-dot" }));
    if (!iconOnly) btn.appendChild(document.createTextNode("Theme"));
    old.parentNode.replaceChild(btn, old);

    var pal = document.createElement("div");
    pal.className = "lituk-pal";
    pal.hidden = true;

    var modeRow = document.createElement("div");
    modeRow.className = "lituk-row lituk-mode";
    [["light", "☀︎ Light"], ["dark", "☾ Dark"]].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = m[1];
      b.setAttribute("data-mode", m[0]);
      b.addEventListener("click", function () { setTheme(m[0]); });
      modeRow.appendChild(b);
    });

    /* The skin. Above the colour row because it is the switch that turns the
       colour row off — a control that disables another should be read first. */
    var paperRow = document.createElement("div");
    paperRow.className = "lituk-row lituk-mode lituk-paper";
    [["normal", "Standard"], ["news", "Newsprint"]].forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = k[1];
      b.setAttribute("data-paper", k[0]);
      b.addEventListener("click", function () { setSkin(k[0]); });
      paperRow.appendChild(b);
    });

    var swRow = document.createElement("div");
    swRow.className = "lituk-row lituk-sw";
    /* A page that names its colours differently is not repainted by the accent
       block, so offering the swatches there would be a control that does
       nothing. Mode still works everywhere. */
    var tinted = !!vocabulary();
    if (tinted) {
      ACCENTS.forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-accent", a.id);
        b.setAttribute("aria-label", a.name);
        b.title = a.name;
        var live = "var(--gold,var(--brand,currentColor))";
        b.style.setProperty("--sw-a", a.disc ? a.disc[0] : live);
        b.style.setProperty("--sw-b", a.disc ? a.disc[1] : live);
        b.appendChild(document.createElement("i"));
        b.addEventListener("click", function () { setAccent(a.id); });
        swRow.appendChild(b);
      });
    }

    function head(text, row) {
      var h = document.createElement("h4");
      h.textContent = text;
      pal.appendChild(h);
      pal.appendChild(row);
      return h;
    }
    head("Mode", modeRow);
    /* Offered on the same terms as the swatches: a page the palettes cannot
       reach would get a control that does nothing. */
    if (tinted) head("Paper", paperRow);
    var swHead = tinted ? head("Colour", swRow) : null;
    document.body.appendChild(pal);

    function sync() {
      var t = current(), a = currentAccent(), news = currentSkin() === "news";
      modeRow.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === t));
      });
      paperRow.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String((b.getAttribute("data-paper") === "news") === news));
      });
      swRow.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-accent") === a));
      });
      /* Newsprint has nothing for the swatches to tint, so they go rather than
         sit there inert. */
      if (swHead) { swHead.hidden = news; swRow.hidden = news; }
      /* Whichever row is last on show owns no trailing gap — which row that is
         changes with the line above, so it cannot be settled once at build. */
      var rows = [modeRow, paperRow, swRow], last = null;
      rows.forEach(function (r) { r.style.marginBottom = ""; if (!r.hidden && r.parentNode) last = r; });
      if (last) last.style.marginBottom = "0";
    }

    /* Measured off the button rather than off the viewport insets: the two
       buttons sit in different places, and only the button knows where. */
    function place() {
      var r = btn.getBoundingClientRect();
      pal.style.top = (r.bottom + 8) + "px";
      pal.style.right = Math.max(8, innerWidth - r.right) + "px";
    }

    function setOpen(yes) {
      pal.hidden = !yes;
      btn.setAttribute("aria-expanded", String(yes));
      if (yes) { sync(); place(); }
    }
    addEventListener("resize", function () { if (!pal.hidden) place(); });

    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(pal.hidden); });
    pal.addEventListener("click", function (e) { e.stopPropagation(); });
    addEventListener("click", function () { if (!pal.hidden) setOpen(false); });
    addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pal.hidden) { setOpen(false); btn.focus(); }
    });
    document.addEventListener("lituk:theme", sync);
    document.addEventListener("lituk:accent", sync);
    document.addEventListener("lituk:skin", sync);
    sync();
  }

  var HUB_CSS =
    ".lituk-hub{position:fixed;z-index:60;top:calc(var(--lituk-sat) + var(--lituk-inset));" +
    "left:calc(var(--lituk-sal) + var(--lituk-inset));display:inline-flex;align-items:center;gap:6px;" +
    "font:600 .78rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "min-height:34px;padding:8px 12px;border-radius:9px;text-decoration:none;cursor:pointer;" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid var(--line,var(--stroke,rgba(128,128,128,.35)));" +
    "box-shadow:0 1px 2px rgba(0,0,0,.18),0 6px 18px rgba(0,0,0,.14);" +
    "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:transform .12s ease}" +
    ".lituk-hub:hover{transform:translateY(-1px)}" +
    ".lituk-hub:active{transform:scale(.97)}" +
    "@media print{.lituk-hub{display:none}}" +
    "mark.lituk-find{background:#FFD34D;color:#20242C;border-radius:3px;padding:0 2px}" +
    "mark.lituk-find.on{outline:2px solid #E07E44;outline-offset:1px}";

  function isHub() {
    var p = location.pathname;
    return p === "/" || /(^|\/)index\.html?$/i.test(p) || /\/$/.test(p);
  }

  function injectHub() {
    if (isHub()) return;
    if (document.documentElement.hasAttribute("data-lituk-nohub")) return;
    if (document.querySelector(".lituk-hub")) return;
    var a = document.createElement("a");
    a.className = "lituk-hub";
    a.href = "index.html";
    a.innerHTML = "← <span>Hub</span>";
    a.setAttribute("aria-label", "Back to the study hub");
    document.body.appendChild(a);
  }

  /* ---------------- accent palettes ----------------
     Two palettes are in play across the app. The hub pages declare dark on a
     bare :root and light on [data-theme="light"]; the reference and quiz pages
     do the reverse. Naming both the mode and the accent here outranks either
     arrangement, so one block covers both without touching a single page.

     Values are not hand-picked. Each token keeps the OKLCH lightness and chroma
     of the default it replaces and only turns its hue, which is why the paper
     reads as a tint rather than a colour and why body-contrast lands within
     0.1:1 of the default everywhere. The two accents that carry text — --gold
     and --gold-dim — are instead solved per hue for a fixed contrast against
     their own --card, because contrast at a fixed lightness varies with hue.
     That lands every accent at 4.6:1 on light, where the default gold reaches
     only 4.14:1, and 7.9:1 on dark.

     Two rows depart from a plain hue-turn, and both on purpose. The Union's
     field takes 1.6× the default's chroma, or the navy would have come out as
     the grey it started as. Northern Ireland turns its field warm (linen) and
     its charge cool (flax), the only accent whose two halves disagree — it is
     a flax field, not a flag.

     --ink, --era1..6, --good/--bad and --trap-* are deliberately absent: they
     carry meaning (chapter colours, right and wrong) or carry the contrast,
     and an accent has no business repainting either. */
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

  /* The practice-test app names its colours differently — --bg/--panel/--brand
     rather than --page/--card/--gold — so it needs its own block against the
     same five nations. Same method: each token keeps its own OKLCH lightness
     and chroma and only turns its hue, except --brand, which is both a fill
     with --on-solid on it and a link colour on --panel, so it is solved per hue
     against the tighter of the two. --ink, --muted, --good/--bad/--warn and the
     five topic colours stay put: they carry contrast or meaning.

     No flag wash reaches this page — it has no wash layer to take one. Its
     nation character is the palette and the ribbon, and that is enough. */
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

  /* ---------------- newsprint ----------------
     The skin, as opposed to the accents above. Two differences of kind, and
     both are why it could not simply be a sixth swatch:

     It repaints the tokens an accent is forbidden to touch. --ink, the era
     colours, --good/--bad/--warn and the five topic colours are left alone by
     every accent on purpose, because they carry the contrast or they carry a
     meaning. A monochrome skin has to take exactly those, so it takes them and
     then puts the meaning back by other means — see the block after the
     palettes, which is the real work here.

     And it is not in a race with the accents at all: setSkin removes
     data-accent while newsprint is on, so those rules stop matching rather than
     losing on specificity. What is left below only has to beat the pages, and
     four attributes on :root clears every page palette in the repo.

     Wrapped in @media screen because the practice-test app already prints a
     clean white sheet from a dark screen, and a printer handed #000 makes a
     black rectangle. Print keeps whatever the page had planned.

     Values: neutral greys throughout — no hue anywhere, which is the ask — but
     not #000/#FFF at both ends. 21:1 at reading size glares and this is an app
     people sit with for an hour, so night pairs true black paper with #EDEDED
     ink at 17.4:1, and day is grey stock rather than white. The paper is the
     part that stays absolute: #000 on an OLED phone is pixels that are off. */
  var NEWS_FACE = "\"Baskerville\",\"Iowan Old Style\",\"Palatino Linotype\",\"Palatino\",Georgia,\"Times New Roman\",serif";

  var NEWS_CSS = "@media screen{" +

    /* ---- the hub vocabulary: night, then day ---- */
    ":root[data-lituk-tokens=\"hub\"][data-skin=\"news\"][data-theme=\"dark\"]{" +
    "--page:#000000;--card:#0B0B0B;--card-2:#151515;--chip:#1A1A1A;--line:#333333;" +
    "--ink:#EDEDED;--ink-2:#ABABAB;--ink-3:#7E7E7E;--gold:#EDEDED;--gold-dim:#8F8F8F;" +
    /* Six greys rather than six hues, spaced far enough apart to still read as
       six different chapters at a glance. The darkest still clears 4.5:1 on the
       card it sits on, which is what caps the range at the bottom. */
    "--era1:#F2F2F2;--era2:#D9D9D9;--era3:#BFBFBF;--era4:#A6A6A6;--era5:#8F8F8F;--era6:#7A7A7A;" +
    "--pink:#EDEDED;--sheen:rgba(255,255,255,.05);--shadow:none;--lift:none}" +

    ":root[data-lituk-tokens=\"hub\"][data-skin=\"news\"][data-theme=\"light\"]{" +
    "--page:#E9E9E9;--card:#FAFAFA;--card-2:#DCDCDC;--chip:#E3E3E3;--line:#B4B4B4;" +
    "--ink:#111111;--ink-2:#4A4A4A;--ink-3:#6B6B6B;--gold:#111111;--gold-dim:#6E6E6E;" +
    "--era1:#0F0F0F;--era2:#2E2E2E;--era3:#454545;--era4:#575757;--era5:#666666;--era6:#757575;" +
    "--pink:#111111;--sheen:rgba(255,255,255,.9);--shadow:none;--lift:none}" +

    /* ---- the practice-test vocabulary ---- */
    ":root[data-lituk-tokens=\"tests\"][data-skin=\"news\"][data-theme=\"dark\"]{" +
    "--bg:#000000;--panel:#0B0B0B;--panel-2:#151515;--chip:#1A1A1A;--line:#333333;" +
    "--ink:#EDEDED;--muted:#ABABAB;--brand:#EDEDED;--brand-ink:#000000;--on-solid:#000000;--accent:#BFBFBF;" +
    /* --bad sits a clear step below --muted rather than beside it: the two meet
       on the same review badge, and two greys one percent apart is no signal. */
    "--good:#EDEDED;--good-bg:#1F1F1F;--bad:#8C8C8C;--bad-bg:#131313;--warn:#D0D0D0;" +
    "--t0:#F2F2F2;--t1:#D2D2D2;--t2:#B2B2B2;--t3:#949494;--t4:#7C7C7C;" +
    "--ring:#EDEDED55;--radius:2px;--shadow:none}" +

    ":root[data-lituk-tokens=\"tests\"][data-skin=\"news\"][data-theme=\"light\"]{" +
    "--bg:#E9E9E9;--panel:#FAFAFA;--panel-2:#DCDCDC;--chip:#E3E3E3;--line:#B4B4B4;" +
    "--ink:#111111;--muted:#4A4A4A;--brand:#111111;--brand-ink:#FFFFFF;--on-solid:#FFFFFF;--accent:#454545;" +
    "--good:#111111;--good-bg:#D4D4D4;--bad:#5F5F5F;--bad-bg:#E4E4E4;--warn:#3A3A3A;" +
    "--t0:#111111;--t1:#333333;--t2:#4C4C4C;--t3:#5E5E5E;--t4:#6E6E6E;" +
    "--ring:#11111133;--radius:2px;--shadow:none}" +

    /* ---- the character ----
       Monochrome on its own is a dark mode with the colour drained out. What
       makes it read as newsprint is the type and the flatness: one serif for
       everything the way a paper sets everything, hairline rules instead of
       soft edges, and nothing anywhere that glows or floats. */
    "html[data-skin=\"news\"]{--sans:" + NEWS_FACE + "}" +

    /* The ambient wash every hub page carries becomes the paper it is printed
       on: a halftone dot screen at the size a newspaper actually screens at.
       Reusing that layer is why this costs nothing — it is already fixed,
       already behind the text, already on the page. The practice-test app has
       no such layer, so it gets one here; nothing else claims its ::before. */
    "html[data-skin=\"news\"] body::before{content:\"\";position:fixed;inset:0;z-index:-1;" +
    "pointer-events:none;opacity:.07;" +
    "background:radial-gradient(currentColor .6px,transparent .7px) 0 0/3px 3px}" +

    /* Printed, not lit. Frosted glass and drop shadows are the two things that
       give away a screen, and both survive the palette because they are set in
       rgba() and blur() rather than in tokens. */
    "html[data-skin=\"news\"] header,html[data-skin=\"news\"] .lituk-hub," +
    "html[data-skin=\"news\"] .lituk-pal{-webkit-backdrop-filter:none;backdrop-filter:none}" +
    "html[data-skin=\"news\"] header{background:var(--bg,var(--page))}" +
    "html[data-skin=\"news\"] .lituk-hub,html[data-skin=\"news\"] .lituk-pal," +
    "html[data-skin=\"news\"] .card,html[data-skin=\"news\"] .tile,html[data-skin=\"news\"] .ch{box-shadow:none}" +
    "html[data-skin=\"news\"] .tcard:hover,html[data-skin=\"news\"] .tcard.pass:hover," +
    "html[data-skin=\"news\"] .tcard.retry:hover,html[data-skin=\"news\"] .bankhd:hover{box-shadow:none}" +
    /* The bank headers tint themselves from a hex handed to them inline. A
       declaration here lands on the element that reads it, which shadows the
       inherited value without having to out-shout an inline style. */
    /* The section identity ramp: five hues, handed to the markup as raw hex and
       read back through --acc and --tone. A hex cannot be re-pointed at a token,
       so the properties that carry it are redeclared on the elements that read
       them — which shadows the value inherited from the section above without
       having to outrank it. .nextup is the exception that needs !important: it
       is the one place the hex lands inline on the element itself. */
    "html[data-skin=\"news\"] .bankhd{--acc:var(--ink-3,var(--muted))}" +
    "html[data-skin=\"news\"] .tcard{--tone:var(--muted)}" +
    "html[data-skin=\"news\"] .nextup{--tone:var(--ink)!important}" +
    /* The scrim behind a dialog is mixed a shade of purple. */
    "html[data-skin=\"news\"] .modal-bg{background:rgba(0,0,0,.62)}" +

    /* ---- putting the meaning back ----
       Everything below replaces a hue that was carrying information with a
       shape that carries the same information: filled against hollow, solid
       against hatched, a rule against a dashed rule. Where the markup already
       ships a glyph — the tick and cross on a reviewed option, "✓ Correct" and
       "✕ Not quite" on the verdict — the meaning was never in the colour to
       begin with and nothing here needs to add it back. */
    "html[data-skin=\"news\"] .opt.correct{border-color:var(--ink);border-width:2px}" +
    "html[data-skin=\"news\"] .opt.wrong{border-style:dashed;border-color:var(--bad)}" +
    "html[data-skin=\"news\"] .opt.wrong .mark{background:transparent;color:var(--bad);border-color:var(--bad)}" +

    "html[data-skin=\"news\"] .qstrip > i.no{" +
    "background:repeating-linear-gradient(45deg,var(--bad) 0 1.5px,transparent 1.5px 3px)}" +
    "html[data-skin=\"news\"] .dot.ok{background:var(--ink);border-color:var(--ink);color:var(--bg)}" +
    "html[data-skin=\"news\"] .dot.no{background:transparent;border-color:var(--ink);" +
    "border-style:dashed;color:var(--ink)}" +
    "html[data-skin=\"news\"] .dot.flag{border-style:dotted;border-width:2px}" +

    "html[data-skin=\"news\"] .tcard.retry{border-style:dashed}" +
    "html[data-skin=\"news\"] .tcard.retry::before," +
    "html[data-skin=\"news\"] .bar.bad > i{" +
    "background:repeating-linear-gradient(45deg,var(--bad) 0 3px,transparent 3px 6px)}" +
    "html[data-skin=\"news\"] .rev .ic.no{background:transparent!important;color:var(--ink);" +
    "border:1.5px dashed var(--ink)}" +

    /* Six eras become six greys, and six greys a third of a stop apart is the
       weakest thing in this skin — everywhere else in the app an era arrives on
       its own, next to its own heading, and grey is plenty. The hub's chapter
       list is the one place all five are read side by side, and there the rule
       down the left edge can carry the difference instead: weight and style,
       which is how a paper has always separated one section from the next.
       Ordered markup, so nth-child addresses them; each still keeps its grey. */
    "html[data-skin=\"news\"] .chapters .ch:nth-child(1){border-left-width:3px}" +
    "html[data-skin=\"news\"] .chapters .ch:nth-child(2){border-left-width:4px;border-left-style:double}" +
    "html[data-skin=\"news\"] .chapters .ch:nth-child(3){border-left-width:4px;border-left-style:dotted}" +
    "html[data-skin=\"news\"] .chapters .ch:nth-child(4){border-left-width:4px;border-left-style:dashed}" +
    "html[data-skin=\"news\"] .chapters .ch:nth-child(5){border-left-width:7px}" +

    /* The hub's two head-to-head stats are an era colour apart, and two
       neighbouring greys is not a difference. */
    /* The results headline is set in --bad when you have not passed, which in
       colour is emphasis and in grey is the opposite — a 24px heading quieter
       than the sentence under it. The words already say which it is. */
    "html[data-skin=\"news\"] .verdict-big.good,html[data-skin=\"news\"] .verdict-big.bad{color:var(--ink)}" +
    "html[data-skin=\"news\"] .st b.good{color:var(--ink)}" +
    "html[data-skin=\"news\"] .st b.bad{color:var(--ink-2);text-decoration:underline dotted;" +
    "text-underline-offset:3px}" +

    /* Anything that arrives already coloured — every emoji on these pages, the
       flag, the icons. .lituk-emo is put around the characters by monoEmoji(),
       because a filter cannot be aimed at a character any other way. */
    "html[data-skin=\"news\"] img,html[data-skin=\"news\"] svg,html[data-skin=\"news\"] video," +
    "html[data-skin=\"news\"] .lituk-emo{filter:grayscale(1)}" +
    "}";

  /* ---------------- the ribbon ----------------
     A 3px bar of the nation's flag under the status bar, on every page the
     palettes reach. It is the one piece of the theme that is the same on the
     hub and in the practice-test app, which is the point: the tests page has no
     wash layer to take a flag, so this is where its nation shows.

     Gated twice over. On [data-lituk-tokens] so Study Quest, which declares no
     vocabulary, never gets one; and on [data-accent], which gold does not set
     and newsprint takes off — so both are simply not matched rather than having
     to undo it. body::after is unclaimed on every page in the repo. */
  var RIBBON_CSS =
    "html[data-lituk-tokens][data-accent] body::after{content:\"\";position:fixed;left:0;right:0;top:var(--lituk-sat);height:3px;z-index:65;pointer-events:none;opacity:.9}" +
    "html[data-accent=\"england\"] body::after{background:#CE1124}" +
    "html[data-accent=\"scotland\"] body::after{background:#005EB8}" +
    "html[data-accent=\"wales\"] body::after{background:linear-gradient(90deg,#00B140 0 50%,#D30731 50%)}" +
    "html[data-accent=\"ni\"] body::after{background:#7C8FDB}" +
    "html[data-accent=\"union\"] body::after{background:linear-gradient(90deg,#012169 0 34%,#FFFFFF 34% 42%,#C8102E 42% 58%,#FFFFFF 58% 66%,#012169 66%)}" +
    "@media print{html[data-accent] body::after{display:none}}";

  /* The tests page sets line-height:0 on its header mark, which is right for the
     <img> it was built around and wrong for a glyph — an emoji in a zero-height
     box hangs out of it. seal() writes data-seal whenever it fills either host,
     so that attribute is the one place to put this back. */
  var SEAL_CSS = ".brand .flag[data-seal]{line-height:1}";

  function injectCSS() {
    var s = document.createElement("style");
    s.textContent = SAFE_CSS + ACCENT_CSS + TESTS_ACCENT_CSS + NEWS_CSS + PICKER_CSS + HUB_CSS + EGG_CSS + RIBBON_CSS + SEAL_CSS;
    document.head.appendChild(s);
  }

  /* Which colour vocabulary this page speaks, written into <html> by
     tools/patch-pages.mjs. Null means no accent block covers it — Study Quest,
     whose fixed pink is the design rather than a theme. The accent rules gate
     on the same attribute, so this only decides whether to offer the swatches;
     it is never what keeps a palette off a page. */
  function vocabulary() {
    return document.documentElement.getAttribute("data-lituk-tokens");
  }

  /* ---------------- monochrome emoji ----------------
     An emoji is a character in a text node, and a filter has to go on an
     element. The obvious move — filter the body — is the one thing that cannot
     be done here: a filtered element becomes the containing block for every
     fixed descendant inside it, and these pages hang the theme pill, the hub
     pill and the HUD off the viewport. Filtering their ancestor would tear all
     three off the corner and scroll them away with the page.

     So the characters are wrapped one span each and the filter goes there.
     Same TreeWalker shape as highlight() below, for the same reason it uses one.

     Started the first time newsprint is switched on and never stopped: an empty
     span is inert the moment the CSS stops matching it, so there is nothing to
     unwind when the reader switches back. */
  var EMOJI = null;
  try {
    /* Built rather than written as a literal: a browser without Unicode
       property escapes throws on the pattern at parse time, and a parse error
       in this file is the whole shared runtime gone rather than one page of
       colourful emoji. */
    EMOJI = new RegExp(
      "(?:\\p{Regional_Indicator}{2}" +          /* 🇬🇧 — a flag is two of these */
      "|[0-9#*]\\uFE0F?\\u20E3" +               /* 1️⃣ — a keycap starts on a digit */
      /* The tag characters are what spell out a subdivision flag — 🏴 plus
         "gbeng" written invisibly. They are not Extended_Pictographic, so
         without them the match ends at the black flag and the tags are left
         behind in a sibling text node, which renders as a black rectangle from
         then on. The seal is a subdivision flag under three of the accents. */
      "|\\p{Extended_Pictographic}\\uFE0F?[\\u{E0020}-\\u{E007F}]*(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)+", "gu");
  } catch (e) {}

  var emoOn = false, emoBusy = false, emoQueue = [], emoTick = 0;
  var EMO_SKIP = /^(script|style|noscript|textarea|option|title|svg|canvas)$/i;

  function wrapEmojiIn(root) {
    if (!EMOJI || !root) return;
    var texts = [], walker;
    if (root.nodeType === 3) texts.push(root);
    else if (root.nodeType === 1) {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!n.nodeValue || !p || EMO_SKIP.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains("lituk-emo")) return NodeFilter.FILTER_REJECT;
          EMOJI.lastIndex = 0;
          return EMOJI.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var n;
      while ((n = walker.nextNode())) texts.push(n);
    }
    if (!texts.length) return;

    emoBusy = true;
    texts.forEach(function (node) {
      var text = node.nodeValue, frag = document.createDocumentFragment(), i = 0, m;
      EMOJI.lastIndex = 0;
      while ((m = EMOJI.exec(text))) {
        if (m.index > i) frag.appendChild(document.createTextNode(text.slice(i, m.index)));
        var span = document.createElement("span");
        span.className = "lituk-emo";
        span.textContent = m[0];
        frag.appendChild(span);
        i = m.index + m[0].length;
      }
      if (!i) return;
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
    emoBusy = false;
  }

  function monoEmoji() {
    if (emoOn || !EMOJI || !document.body) return;
    emoOn = true;
    wrapEmojiIn(document.body);
    if (!window.MutationObserver) return;
    /* Both apps render their screens from JS, so the walk above only covers
       what is on the page this second. Drained on a frame rather than per
       record: a re-render arrives as hundreds of mutations describing one
       screen, and wrapping is cheap only if it happens once for the lot. */
    new MutationObserver(function (recs) {
      if (emoBusy) return;
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes;
        for (var j = 0; j < added.length; j++) emoQueue.push(added[j]);
      }
      if (!emoQueue.length || emoTick) return;
      emoTick = requestAnimationFrame(function () {
        emoTick = 0;
        var batch = emoQueue;
        emoQueue = [];
        batch.forEach(wrapEmojiIn);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- ?find= highlighting ---------------- */

  function highlight(term) {
    if (!term || term.length < 2) return;
    var needle = term.toLowerCase();
    var skip = /^(script|style|noscript|textarea|mark|svg|canvas)$/i;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
        if (skip.test(n.parentNode.nodeName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.toLowerCase().indexOf(needle) >= 0
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var hits = [], n;
    while ((n = walker.nextNode()) && hits.length < 60) hits.push(n);
    if (!hits.length) return;

    var first = null;
    hits.forEach(function (node) {
      var text = node.nodeValue, low = text.toLowerCase(), frag = document.createDocumentFragment();
      var i = 0, at;
      while ((at = low.indexOf(needle, i)) >= 0) {
        if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)));
        var mk = document.createElement("mark");
        mk.className = "lituk-find";
        mk.textContent = text.slice(at, at + needle.length);
        frag.appendChild(mk);
        if (!first) { first = mk; mk.classList.add("on"); }
        i = at + needle.length;
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });

    if (first) {
      // <details> collapse would hide the hit — open every ancestor first.
      for (var p = first.parentNode; p && p !== document.body; p = p.parentNode) {
        if (p.nodeName === "DETAILS") p.open = true;
      }
      requestAnimationFrame(function () {
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  /* ---------------- reading position ---------------- */

  /* Chapter pages are long — chapter 3 runs to eleven thousand words — so every
     one of them remembers how far you got and offers to put you back there.

     The position is anchored to a heading, never to a pixel offset. A saved
     scrollY is wrong the moment the text reflows: rotate the phone, bump the
     text size, open the same chapter on a laptop instead, or edit a paragraph,
     and the number points somewhere else entirely. "35% of the way past 'The
     rules tighten'" survives all four.

     Pages opt in with data-lituk-read on <html>; patch-pages.mjs sets it on the
     five story pages and the five reference notes. */

  var READ_KEY = "lituk_reading_v1";
  var READ_ANCHORS = "h1, h2, h3";
  /* Where "you are here" is measured, in px below the viewport top. Not the top
     edge itself: the two fixed corner pills sit there, and a heading level with
     them reads as already passed. */
  var READ_LINE = 96;
  var READ_KEEP = 40;

  function readsOn() {
    return document.documentElement.hasAttribute("data-lituk-read");
  }

  function pageId() {
    return location.pathname.split("/").pop() || "index.html";
  }

  function readAll() {
    try {
      var o = JSON.parse(localStorage.getItem(READ_KEY) || "null");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }

  function readWrite(store) {
    try { localStorage.setItem(READ_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  /* Story headings carry an eyebrow — <h3><span class="yr">Oct 2013</span>The
     rules tighten</h3> — which runs straight into the title in textContent.
     Split it back out: the title alone is the label worth showing. */
  function anchorText(h) {
    var yr = h.querySelector(".yr");
    var title = "";
    for (var n = h.firstChild; n; n = n.nextSibling) {
      if (n !== yr) title += n.textContent;
    }
    title = title.replace(/\s+/g, " ").trim();
    return {
      title: title || h.textContent.replace(/\s+/g, " ").trim(),
      eyebrow: yr ? yr.textContent.replace(/\s+/g, " ").trim() : ""
    };
  }

  /* The act or era the heading sits in, for the "Act II · The paperwork" line. */
  function crumbFor(h) {
    var box = h.closest && h.closest("section.act, section.era, .epilogue, .prologue");
    if (!box) return "";
    var kicker = box.querySelector(".act-kicker, .era-span");
    if (kicker) return kicker.textContent.replace(/\s+/g, " ").trim();
    var h2 = box.querySelector("h2");
    return h2 && h2 !== h ? anchorText(h2).title : "";
  }

  /* Heading offsets, measured once and reused. Anything that reflows the page
     changes its height too, so that is the cache key — cheaper and more
     reliable than listening for every event that could move a heading. */
  var readEls = null, readTops = null, readDocH = 0;

  function measure() {
    if (!readEls) readEls = [].slice.call(document.querySelectorAll(READ_ANCHORS));
    var h = document.documentElement.scrollHeight;
    if (readTops && h === readDocH) return;
    readDocH = h;
    readTops = readEls.map(function (el) { return el.getBoundingClientRect().top + scrollY; });
  }

  function scrollPct() {
    var max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  }

  /* Distance from one heading to the next — the span the offset is a fraction
     of. Headings inside a collapsed <details> share a top, hence the guard. */
  function spanAt(i) {
    var next = i + 1 < readTops.length ? readTops[i + 1] : readDocH;
    return Math.max(1, next - readTops[i]);
  }

  function snapshot() {
    measure();
    var pct = scrollPct();
    if (!readEls.length) return { i: -1, pct: pct };
    var line = scrollY + READ_LINE, i = -1;
    for (var j = 0; j < readTops.length; j++) {
      if (readTops[j] <= line) i = j; else break;
    }
    if (i < 0) return { i: -1, pct: pct };
    var t = anchorText(readEls[i]);
    return {
      k: slug(t.title),
      i: i,
      o: +Math.min(1, Math.max(0, (line - readTops[i]) / spanAt(i))).toFixed(4),
      label: t.title,
      crumb: crumbFor(readEls[i]) || t.eyebrow,
      pct: pct
    };
  }

  function saveNow() {
    var s = snapshot();
    if (!s) return;
    var store = readAll(), id = pageId(), prev = store[id] || {};
    /* Two different numbers on purpose. The resume point is always the latest
       spot, because that is where you actually stopped. Furthest-read only ever
       climbs, so flicking back to re-read a scene does not undo the progress
       bar on the hub. */
    var rec = {
      k: s.k, i: s.i, o: s.o, label: s.label, crumb: s.crumb,
      pct: Math.max(+prev.pct || 0, s.pct),
      at: Date.now()
    };
    if (rec.pct >= 0.985) rec.done = true;
    store[id] = rec;

    var ids = Object.keys(store);
    if (ids.length > READ_KEEP) {
      ids.sort(function (a, b) { return (store[b].at || 0) - (store[a].at || 0); })
        .slice(READ_KEEP).forEach(function (k) { delete store[k]; });
    }
    readWrite(store);
  }

  var saveTimer = 0;
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = 0; saveNow(); }, 700);
  }
  function saveFlush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    saveNow();
  }

  /* Where a saved record points now. The slug is the real key — it still finds
     the spot after headings are added or removed above it — with the recorded
     index as a tie-breaker for repeated titles, and the raw percentage as a
     last resort if the heading is gone altogether. */
  function targetFor(rec) {
    if (!rec) return null;
    measure();
    var i = -1;
    if (typeof rec.i === "number" && rec.i >= 0 && rec.i < readEls.length &&
        (!rec.k || slug(anchorText(readEls[rec.i]).title) === rec.k)) {
      i = rec.i;
    } else if (rec.k) {
      for (var j = 0; j < readEls.length; j++) {
        if (slug(anchorText(readEls[j]).title) === rec.k) { i = j; break; }
      }
    }
    if (i < 0) {
      var max = document.documentElement.scrollHeight - innerHeight;
      return rec.pct > 0 && max > 0 ? Math.round(rec.pct * max) : null;
    }
    return Math.max(0, Math.round(readTops[i] + (rec.o || 0) * spanAt(i) - READ_LINE));
  }

  var RESUME_CSS =
    ".lituk-resume{position:fixed;z-index:70;left:50%;" +
    "top:calc(var(--lituk-sat) + var(--lituk-inset) + 46px);" +
    "transform:translate(-50%,-10px);opacity:0;pointer-events:none;" +
    "display:flex;align-items:stretch;gap:2px;max-width:min(430px,calc(100vw - 24px));" +
    "padding:4px;border-radius:13px;" +
    "font:500 .78rem/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid var(--line,var(--stroke,rgba(128,128,128,.35)));" +
    "box-shadow:0 1px 2px rgba(0,0,0,.18),0 10px 30px rgba(0,0,0,.22);" +
    "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);" +
    "transition:opacity .22s ease,transform .22s ease}" +
    ".lituk-resume.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}" +
    ".lituk-resume button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;" +
    "border-radius:10px;padding:7px 10px}" +
    ".lituk-resume-go{flex:1;min-width:0;text-align:left}" +
    ".lituk-resume-go:hover{background:var(--card-2,rgba(128,128,128,.12))}" +
    ".lituk-resume-cap{display:block;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;" +
    "font-weight:700;color:var(--ink-2,#777)}" +
    ".lituk-resume-at{display:block;margin-top:1px;font-weight:650;" +
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".lituk-resume-x{flex:0 0 auto;color:var(--ink-3,#999);font-size:.9rem;line-height:1}" +
    ".lituk-resume-x:hover{color:var(--ink,#222);background:var(--card-2,rgba(128,128,128,.12))}" +
    "@media (prefers-reduced-motion:reduce){.lituk-resume{transition:none}}" +
    "@media print{.lituk-resume{display:none}}";

  function offerResume(rec, target) {
    var bar = document.createElement("div");
    bar.className = "lituk-resume";
    bar.setAttribute("role", "status");

    var go = document.createElement("button");
    go.type = "button";
    go.className = "lituk-resume-go";
    var cap = document.createElement("span");
    cap.className = "lituk-resume-cap";
    cap.textContent = "Pick up where you left off";
    var at = document.createElement("span");
    at.className = "lituk-resume-at";
    /* textContent, not innerHTML — the label is chapter prose and can hold an
       ampersand or a stray angle bracket. */
    at.textContent = [rec.crumb, rec.label].filter(Boolean).join(" · ") ||
      Math.round((rec.pct || 0) * 100) + "% in";
    go.appendChild(cap);
    go.appendChild(at);

    var x = document.createElement("button");
    x.type = "button";
    x.className = "lituk-resume-x";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Dismiss");

    bar.appendChild(go);
    bar.appendChild(x);
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("on"); });

    var timer = setTimeout(hide, 12000);
    function hide() {
      clearTimeout(timer);
      bar.classList.remove("on");
      setTimeout(function () { bar.remove(); }, 260);
      removeEventListener("scroll", onScroll);
    }
    /* Reading on from the top is an answer too — stop hovering once they have
       clearly chosen to. */
    var from = scrollY;
    function onScroll() { if (Math.abs(scrollY - from) > innerHeight) hide(); }
    addEventListener("scroll", onScroll, { passive: true });

    go.addEventListener("click", function () {
      /* Re-resolved rather than reusing the offer-time number: the page may
         have reflowed since, and this is the click that has to land. */
      var y = targetFor(rec);
      jumpTo(y == null ? target : y, true);
      hide();
    });
    x.addEventListener("click", hide);
  }

  function jumpTo(y, animate) {
    if (y == null) return;
    /* Every chapter page sets scroll-behavior:smooth in CSS, and gliding the
       length of a chapter to get back to your spot is both slow and completely
       disorienting — so only short hops animate. */
    var near = Math.abs(y - scrollY) < innerHeight * 2;
    if (animate && near && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try { scrollTo({ top: y, behavior: "smooth" }); return; } catch (e) {}
    }
    /* behavior:"auto" means "whatever the CSS says", which here is smooth — an
       instant jump has to ask for it by name, and the inline style covers
       anything that does not know the keyword. */
    var root = document.documentElement, prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    try { scrollTo({ top: y, behavior: "instant" }); } catch (e) { scrollTo(0, y); }
    root.style.scrollBehavior = prev;
  }

  function startReading() {
    if (!readsOn()) return;

    var s = document.createElement("style");
    s.textContent = RESUME_CSS;
    document.head.appendChild(s);

    addEventListener("scroll", saveSoon, { passive: true });
    addEventListener("pagehide", saveFlush);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) saveFlush();
    });

    var q = new URLSearchParams(location.search);
    var rec = readAll()[pageId()];
    if (!rec) return;
    /* A hash or a search hit is an explicit destination — never fight it. */
    if (location.hash || q.get("find")) return;

    var target = targetFor(rec);
    if (target == null) return;

    /* Arriving from "Continue reading" on the hub is already the decision, so
       that one goes straight there rather than asking again. */
    if (q.get("resume")) {
      /* This load belongs to the bookmark, not to the history entry — several
         browsers restore the old scroll position asynchronously, after deferred
         scripts have run, and would otherwise quietly undo the jump. Only this
         entry is claimed; ordinary Back navigation still restores as usual. */
      try { history.scrollRestoration = "manual"; } catch (e) {}
      jumpTo(target, false);

      /* Belt and braces for the browsers that restore anyway — but never at the
         cost of overriding the reader, so a scroll of their own calls it off. */
      var taken = false;
      ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
        addEventListener(ev, function () { taken = true; }, { passive: true, once: true });
      });
      addEventListener("load", function () {
        requestAnimationFrame(function () {
          if (taken) return;
          var again = targetFor(rec);
          if (again != null && Math.abs(scrollY - again) > 4) jumpTo(again, false);
        });
      });
      return;
    }
    /* Otherwise only offer when there is something worth offering: far enough
       in to matter, not already finished, and the browser has not restored the
       spot by itself. */
    if (rec.done || rec.pct >= 0.97) return;
    if (target < innerHeight * 1.2) return;
    if (scrollY > 200 || Math.abs(scrollY - target) < innerHeight * 0.5) return;
    offerResume(rec, target);
  }

  /* ---------------- hidden surprises ----------------
     Seven of them, scattered across the app. None of this touches the study
     material or the scoring — it is all decoration, it all stays out of the
     way until somebody goes looking, and once one is found the hub grows a
     small cabinet listing the rest by hint. Typed triggers are ignored while
     the caret is in a field, so the hub's search box stays a search box. */

  var EGG_KEY = "lituk_eggs_v1";

  var EGGS = [
    { id: "assent", icon: "👑", name: "Royal Assent",
      hint: "A very old cheat code. Arrows first, two letters after.",
      touchHint: "Say what a bill needs from the monarch before it becomes an Act.",
      say: ["assent", "leroyleveult", "leroy"],
      line: "Le Roy le veult. Royal Assent granted — the bill is now an Act." },
    { id: "brew", icon: "☕", name: "Put the kettle on", word: "tea",
      hint: "Type the three letters this country actually runs on.",
      touchHint: "Say the three letters this country actually runs on.",
      line: "Priorities. Milk in after, and never let anyone tell you otherwise." },
    { id: "rain", icon: "🌧", name: "Typical", word: "rain",
      hint: "Type the national conversation topic. Four letters.",
      touchHint: "Say the national conversation topic. Four letters.",
      line: "Typical. Take a coat — you will want it by four." },
    { id: "queue", icon: "🧍", name: "The Queue", word: "queue",
      hint: "Type the one thing nobody here ever jumps.",
      touchHint: "Say the one thing nobody here ever jumps.",
      line: "Not a single person pushed in. A beautiful, orderly line." },
    { id: "hastings", icon: "🏹", name: "Hastings", word: "1066",
      hint: "Type the one date the test will never let you forget.",
      touchHint: "Say the one date the test will never let you forget.",
      line: "1066. William, Harold, and an arrow. You will not forget it now." },
    { id: "sorry", icon: "🙇", name: "No, after you", word: "sorry",
      hint: "Type what you say when somebody else steps on your foot.",
      touchHint: "Say what you say when somebody else steps on your foot.",
      line: "No — I'm sorry. Honestly. Entirely my fault." },
    { id: "flag", icon: "🇬🇧", name: "Flutter",
      hint: "The flag at the top of the hub would like some attention. Five taps.",
      touchHint: "The flag at the top of the hub would like some attention. Five taps.",
      line: "Three crosses, one flag, and a very respectable flutter." }
  ];

  /* The Union Flag has to be drawn, not typed. The emoji is a pair of regional
     indicators (U+1F1EC U+1F1E7) that a font is meant to ligate into a flag;
     Windows ships the letter glyphs but not the ligature, so it came out as
     "GB". So anywhere an icon might be the flag, append a node instead of
     setting text — every other egg icon is an emoji that renders fine. */
  var FLAG = "\uD83C\uDDEC\uD83C\uDDE7";

  function flagImg() {
    var img = document.createElement("img");
    img.src = "icons/flag-gb.svg";
    img.alt = "";
    img.className = "uj";
    return img;
  }

  function iconNode(icon) {
    return icon === FLAG ? flagImg() : document.createTextNode(icon);
  }

  var EGG_CSS =
    ".egg-stage{position:fixed;inset:0;z-index:9998;pointer-events:none;overflow:hidden;" +
    "transition:opacity .8s ease}" +
    ".egg-stage.out{opacity:0}" +

    /* the flag, an image wherever it appears, sized to the text beside it */
    ".uj{display:inline-block;width:1.3em;height:auto;vertical-align:-.15em}" +

    /* confetti */
    ".egg-bit{position:absolute;top:-16px;width:9px;height:14px;display:block;opacity:.95;" +
    "animation:eggFall linear forwards}" +
    "@keyframes eggFall{to{transform:translate(var(--drift,0),108vh) rotate(var(--spin,180deg));opacity:.1}}" +

    /* crown */
    ".egg-crown{position:absolute;left:50%;top:36%;font-size:clamp(64px,16vw,108px);opacity:0;" +
    "filter:drop-shadow(0 16px 30px rgba(0,0,0,.45));animation:eggCrown 2.8s cubic-bezier(.2,.9,.3,1.25) forwards}" +
    "@keyframes eggCrown{0%{opacity:0;transform:translate(-50%,-190%) scale(.4) rotate(-20deg)}" +
    "32%{opacity:1;transform:translate(-50%,-50%) scale(1.14) rotate(5deg)}" +
    "46%{transform:translate(-50%,-50%) scale(1) rotate(0)}" +
    "78%{opacity:1;transform:translate(-50%,-50%) scale(1)}" +
    "100%{opacity:0;transform:translate(-50%,-70%) scale(1.06)}}" +

    /* the brew */
    ".egg-cup{position:absolute;left:50%;bottom:-150px;width:140px;height:130px;margin-left:-70px;" +
    "animation:eggRise 3.6s cubic-bezier(.2,.75,.3,1) forwards}" +
    ".egg-cup .c{position:absolute;left:0;right:0;bottom:0;text-align:center;line-height:1;" +
    "font-size:clamp(56px,14vw,76px);filter:drop-shadow(0 14px 24px rgba(0,0,0,.35))}" +
    ".egg-cup .s{position:absolute;bottom:76px;left:50%;width:10px;height:10px;border-radius:50%;" +
    "background:radial-gradient(circle,rgba(255,255,255,.72),rgba(255,255,255,0) 70%);" +
    "animation:eggSteam 2.2s ease-out infinite}" +
    "@keyframes eggRise{0%{bottom:-150px;opacity:0}22%{opacity:1}34%{bottom:25vh}74%{bottom:28vh;opacity:1}" +
    "100%{bottom:38vh;opacity:0}}" +
    "@keyframes eggSteam{0%{opacity:0;transform:translate(-50%,0) scale(.5)}28%{opacity:.7}" +
    "100%{opacity:0;transform:translate(-50%,-62px) scale(1.9)}}" +

    /* weather */
    ".egg-drop{position:absolute;top:-16vh;width:1.5px;height:14vh;border-radius:2px;" +
    "background:linear-gradient(180deg,rgba(150,190,235,0),rgba(150,190,235,.6));" +
    "animation:eggRain linear infinite}" +
    "@keyframes eggRain{to{transform:translateY(130vh)}}" +

    /* the queue */
    ".egg-walk{position:absolute;bottom:9vh;left:-100px;font-size:clamp(26px,7vw,36px);" +
    "animation:eggWalk 6.6s linear forwards}" +
    ".egg-walk i{display:inline-block;font-style:normal;animation:eggBob .62s ease-in-out infinite}" +
    "@keyframes eggWalk{to{transform:translateX(calc(100vw + 160px))}}" +
    "@keyframes eggBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}" +

    /* the arrow at Hastings */
    ".egg-arrow{position:absolute;top:62vh;left:-90px;font-size:clamp(30px,8vw,44px);opacity:0;" +
    "animation:eggFly 1.6s cubic-bezier(.32,.08,.6,1) forwards}" +
    "@keyframes eggFly{0%{opacity:0;transform:translate(0,0) rotate(-30deg)}12%{opacity:1}" +
    "90%{opacity:1}100%{opacity:0;transform:translate(calc(100vw + 180px),-36vh) rotate(-4deg)}}" +

    /* the flutter */
    ".egg-mini{position:absolute;bottom:-46px;font-size:clamp(18px,5vw,24px);opacity:0;" +
    "animation:eggFloat 3.8s ease-in forwards}" +
    "@keyframes eggFloat{0%{opacity:0;transform:translateY(0) rotate(0)}16%{opacity:1}" +
    "100%{opacity:0;transform:translateY(-96vh) rotate(var(--spin,180deg))}}" +
    ".egg-flutter{animation:eggFlutter 1.25s ease-in-out}" +
    "@keyframes eggFlutter{0%,100%{transform:none}18%{transform:rotate(-9deg) skewX(7deg)}" +
    "44%{transform:rotate(8deg) skewX(-7deg)}70%{transform:rotate(-4deg) skewX(3deg)}}" +
    /* The seal already carries a drift animation from a two-class selector, so
       a bare .egg-tap never won the shorthand and the tap pulse never showed.
       The id gets it back. */
    ".egg-tap,#flagSeal.egg-tap{animation:eggTap .28s ease}" +
    "@keyframes eggTap{50%{transform:scale(1.12)}}" +

    /* the note that says what you just found */
    ".egg-toast{position:fixed;left:0;right:0;margin:0 auto;z-index:9999;width:max-content;" +
    "max-width:min(92vw,430px);bottom:calc(var(--lituk-sab,0px) + 22px);cursor:pointer;" +
    "padding:13px 17px;border-radius:14px;text-align:left;opacity:0;transform:translateY(16px);" +
    "transition:opacity .3s ease,transform .3s cubic-bezier(.2,.8,.3,1);" +
    "font:400 .85rem/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid color-mix(in srgb,var(--gold,#D4A94E) 42%,var(--line,rgba(128,128,128,.35)));" +
    "box-shadow:0 2px 6px rgba(0,0,0,.22),0 18px 44px rgba(0,0,0,.3);" +
    "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}" +
    ".egg-toast.on{opacity:1;transform:none}" +
    ".egg-toast b{display:block;font-weight:700;font-size:.92rem;letter-spacing:-.005em}" +
    ".egg-toast span{display:block;margin-top:2px;color:var(--ink-2,var(--muted,#777))}" +
    ".egg-toast i{display:block;margin-top:7px;font-style:normal;font-size:.7rem;font-weight:700;" +
    "letter-spacing:.09em;text-transform:uppercase;color:var(--gold,#D4A94E)}" +
    ".egg-toast.bow.on{animation:eggBow 1.3s ease .2s 2}" +
    "@keyframes eggBow{0%,100%{transform:none}38%{transform:translateY(9px) rotate(-1.3deg)}}" +

    /* the cabinet, hub only, and only once something is in it */
    ".curio{max-width:540px;margin:20px auto 2px;text-align:left}" +
    ".curio>summary{list-style:none;cursor:pointer;text-align:center;padding:8px;" +
    "font-size:.72rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;" +
    "color:var(--ink-3,#8B8F98);transition:color .15s ease}" +
    ".curio>summary::-webkit-details-marker{display:none}" +
    ".curio>summary:hover{color:var(--gold,#D4A94E)}" +
    ".curio-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:8px;margin-top:8px}" +
    ".curio-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:11px;" +
    "border:1px solid var(--line,rgba(128,128,128,.3));font-size:.78rem;line-height:1.45;text-align:left}" +
    ".curio-item .cx{flex:0 0 auto;font-size:1.05rem;line-height:1.3}" +
    ".curio-item:not(.got) .cx{font:700 1rem/1.35 var(--serif,Georgia,serif);color:var(--ink-3,#8B8F98);opacity:.7}" +
    ".curio-item b{display:block;font-weight:650;color:var(--ink,inherit)}" +
    ".curio-item span{display:block;color:var(--ink-3,#8B8F98)}" +
    ".curio-item.got{border-color:color-mix(in srgb,var(--gold,#D4A94E) 45%,transparent);" +
    "background:color-mix(in srgb,var(--gold,#D4A94E) 9%,transparent)}" +
    ".curio-item.got b{color:var(--gold,#D4A94E)}" +
    ".curio-note{margin:11px 2px 2px;font-size:.74rem;line-height:1.55;text-align:left;" +
    "color:var(--ink-3,#8B8F98)}" +
    ".curio-note b{font-weight:700;color:var(--gold,#D4A94E)}" +

    /* Both hold targets. iOS otherwise answers a long press with the selection
       callout (or a link preview on the pill), and five fast taps with a zoom. */
    "#flagSeal,.lituk-hub{touch-action:manipulation;-webkit-touch-callout:none;" +
    "-webkit-user-select:none;user-select:none}" +
    "#flagSeal.egg-hold{animation-play-state:paused;filter:brightness(1.14) saturate(1.12)}" +
    ".lituk-hub.egg-hold{transform:scale(.94)}" +
    /* Three taps in and the gold starts answering back — five taps on a seal
       nobody knows is a button is not a hunt, it is a coincidence. */
    "#flagSeal.egg-warm{box-shadow:inset 0 1px 0 var(--sheen,transparent)," +
    "0 0 0 2px color-mix(in srgb,var(--gold,#D4A94E) 60%,transparent),0 10px 30px rgba(0,0,0,.22)}" +

    /* the plaque — the phone's stand-in for a keyboard */
    ".egg-plaque-back{position:fixed;inset:0;z-index:10000;display:flex;" +
    "align-items:flex-end;justify-content:center;" +
    "padding:0 calc(var(--lituk-sal,0px) + 14px) calc(var(--lituk-sab,0px) + 18px)" +
    " calc(var(--lituk-sar,0px) + 14px);" +
    "background:rgba(8,10,14,.46);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);" +
    "opacity:0;transition:opacity .22s ease}" +
    ".egg-plaque-back.on{opacity:1}" +
    ".egg-plaque{position:relative;width:min(420px,100%);box-sizing:border-box;" +
    "padding:15px 16px 16px;border-radius:16px;transform:translateY(20px);" +
    "transition:transform .26s cubic-bezier(.2,.8,.3,1);" +
    "font:400 .85rem/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid color-mix(in srgb,var(--gold,#D4A94E) 48%,var(--line,rgba(128,128,128,.35)));" +
    "box-shadow:0 2px 6px rgba(0,0,0,.25),0 26px 60px rgba(0,0,0,.42)}" +
    ".egg-plaque-back.on .egg-plaque{transform:none}" +
    ".egg-plaque b{display:block;font-size:.72rem;font-weight:700;letter-spacing:.13em;" +
    "text-transform:uppercase;color:var(--gold,#D4A94E)}" +
    ".egg-plaque span{display:block;margin-top:5px;font-size:.78rem;color:var(--ink-3,#8B8F98)}" +
    ".egg-plaque .x{position:absolute;top:6px;right:6px;width:34px;height:34px;padding:0;" +
    "font:400 19px/1 system-ui,sans-serif;color:var(--ink-3,#8B8F98);background:none;border:0;" +
    "cursor:pointer;-webkit-appearance:none;appearance:none}" +
    ".egg-plaque-row{display:flex;gap:8px;margin-top:12px}" +
    /* 1rem, not smaller: anything under 16px and iOS zooms the page on focus. */
    ".egg-plaque input{flex:1 1 auto;min-width:0;box-sizing:border-box;padding:11px 12px;" +
    "font:400 1rem/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "border-radius:11px;color:var(--ink,inherit);background:var(--page,var(--bg,transparent));" +
    "border:1px solid var(--line,rgba(128,128,128,.35));-webkit-appearance:none;appearance:none}" +
    ".egg-plaque input:focus{outline:none;border-color:var(--gold,#D4A94E)}" +
    ".egg-plaque .go{flex:0 0 auto;min-height:44px;padding:0 16px;border:0;border-radius:11px;" +
    "font:700 .82rem/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:#20242C;background:var(--gold,#D4A94E);cursor:pointer;" +
    "-webkit-appearance:none;appearance:none}" +
    ".egg-plaque.no{animation:eggNo .42s ease}" +
    "@keyframes eggNo{10%,90%{transform:translateX(-3px)}30%,70%{transform:translateX(5px)}" +
    "50%{transform:translateX(-6px)}}" +

    "@media (prefers-reduced-motion:reduce){" +
    ".egg-toast,.egg-toast.on{transition:none}.egg-toast.bow.on{animation:none}" +
    ".egg-plaque-back,.egg-plaque{transition:none}.egg-plaque.no{animation:none}" +
    "#flagSeal.egg-hold{filter:none}}" +
    "@media print{.egg-stage,.egg-toast,.egg-plaque-back{display:none}}";

  function eggsFound() {
    try { return JSON.parse(localStorage.getItem(EGG_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function eggsSave(f) { try { localStorage.setItem(EGG_KEY, JSON.stringify(f)); } catch (e) {} }
  function eggById(id) {
    for (var i = 0; i < EGGS.length; i++) if (EGGS[i].id === id) return EGGS[i];
    return null;
  }
  /* Every particle effect is skipped outright for anyone who has asked their
     system for less motion — the note still appears, so the find still counts. */
  function calm() {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }
  /* Installed on a phone there is no keyboard unless a field has the caret, and
     the typed triggers deliberately ignore fields — so six of the seven were
     unreachable on the one device this app is actually used on. Anything
     touch-primary gets told to hold the seal instead. */
  function coarse() {
    try { return matchMedia("(hover:none),(pointer:coarse)").matches; }
    catch (e) { return "ontouchstart" in window; }
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* A short-lived full-viewport canvas. Fades itself out, then removes itself. */
  function stage(ms) {
    var d = document.createElement("div");
    d.className = "egg-stage";
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add("out"); }, Math.max(0, ms - 800));
    setTimeout(function () { d.remove(); }, ms);
    return d;
  }

  var FLAG_INK = ["#C8102E", "#F4F2EA", "#012169", "#D4A94E"];

  function confetti(n, host) {
    if (calm()) return;
    var d = host || stage(5200);
    for (var i = 0; i < n; i++) {
      var b = document.createElement("i");
      b.className = "egg-bit";
      b.style.left = rand(0, 100).toFixed(2) + "vw";
      b.style.background = FLAG_INK[i % FLAG_INK.length];
      b.style.animationDelay = rand(0, .9).toFixed(2) + "s";
      b.style.animationDuration = rand(2.3, 4).toFixed(2) + "s";
      b.style.setProperty("--spin", rand(-540, 540).toFixed(0) + "deg");
      b.style.setProperty("--drift", rand(-70, 70).toFixed(0) + "px");
      if (i % 3 === 0) b.style.borderRadius = "50%";
      d.appendChild(b);
    }
    return d;
  }

  var EFFECTS = {
    assent: function () {
      if (calm()) return;
      var d = stage(5200);
      confetti(80, d);
      var c = document.createElement("div");
      c.className = "egg-crown";
      c.textContent = "👑";
      d.appendChild(c);
    },
    brew: function () {
      if (calm()) return;
      var d = stage(3900);
      var w = document.createElement("div");
      w.className = "egg-cup";
      var c = document.createElement("div");
      c.className = "c";
      c.textContent = "☕";
      w.appendChild(c);
      [-16, 0, 16].forEach(function (dx, i) {
        var s = document.createElement("div");
        s.className = "s";
        s.style.marginLeft = dx + "px";
        s.style.animationDelay = (i * .45).toFixed(2) + "s";
        w.appendChild(s);
      });
      d.appendChild(w);
    },
    rain: function () {
      if (calm()) return;
      var d = stage(5400);
      for (var i = 0; i < 70; i++) {
        var r = document.createElement("i");
        r.className = "egg-drop";
        r.style.left = rand(-4, 102).toFixed(2) + "vw";
        r.style.animationDuration = rand(.6, 1.2).toFixed(2) + "s";
        r.style.animationDelay = "-" + rand(0, 1.2).toFixed(2) + "s";
        r.style.opacity = rand(.35, 1).toFixed(2);
        d.appendChild(r);
      }
    },
    queue: function () {
      if (calm()) return;
      var d = stage(7200);
      var folk = ["🧍", "🧍‍♀️", "🧓", "🧍‍♂️", "👩", "☂️"];
      folk.forEach(function (who, i) {
        var p = document.createElement("div");
        p.className = "egg-walk";
        var g = document.createElement("i");
        g.textContent = who;
        g.style.animationDelay = (i * .11).toFixed(2) + "s";
        p.appendChild(g);
        p.style.animationDelay = (i * .48).toFixed(2) + "s";
        d.appendChild(p);
      });
    },
    hastings: function () {
      if (calm()) return;
      var d = stage(2000);
      var a = document.createElement("div");
      a.className = "egg-arrow";
      a.textContent = "🏹";
      d.appendChild(a);
    },
    sorry: function () {},
    flag: function () {
      var seal = document.getElementById("flagSeal");
      if (seal && !calm()) {
        seal.classList.remove("egg-flutter");
        void seal.offsetWidth;                      // restart the animation
        seal.classList.add("egg-flutter");
      }
      if (calm()) return;
      var d = stage(4200);
      for (var i = 0; i < 14; i++) {
        var f = document.createElement("i");
        f.className = "egg-mini";
        f.appendChild(flagImg());
        f.style.left = rand(4, 94).toFixed(2) + "vw";
        f.style.animationDelay = rand(0, 1.4).toFixed(2) + "s";
        f.style.animationDuration = rand(3, 4.4).toFixed(2) + "s";
        f.style.setProperty("--spin", rand(-90, 90).toFixed(0) + "deg");
        d.appendChild(f);
      }
    }
  };

  var eggToastTimer = 0;

  function eggNote(icon, name, line, tail) {
    var old = document.querySelector(".egg-toast");
    if (old) old.remove();

    var t = document.createElement("div");
    t.className = "egg-toast";
    t.setAttribute("role", "status");

    var h = document.createElement("b");
    h.appendChild(iconNode(icon));
    h.appendChild(document.createTextNode("  " + name));
    var p = document.createElement("span");
    p.textContent = line;
    t.appendChild(h);
    t.appendChild(p);
    if (tail) {
      var f = document.createElement("i");
      f.textContent = tail;
      t.appendChild(f);
    }

    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("on"); });

    function close() {
      clearTimeout(eggToastTimer);
      t.classList.remove("on");
      setTimeout(function () { t.remove(); }, 400);
    }
    t.addEventListener("click", close);
    clearTimeout(eggToastTimer);
    eggToastTimer = setTimeout(close, 4600);
    return t;
  }

  function fireEgg(id) {
    var egg = eggById(id);
    if (!egg) return;

    var found = eggsFound();
    var isNew = !found[egg.id];
    if (isNew) { found[egg.id] = Date.now(); eggsSave(found); }
    var n = Object.keys(found).length;

    (EFFECTS[egg.id] || function () {})();
    var note = eggNote(egg.icon, egg.name, egg.line,
      isNew ? "✦ Curiosity " + n + " of " + EGGS.length + " found" : "");
    if (egg.id === "sorry") note.classList.add("bow");

    if (!isNew) return;
    renderCurio();
    if (n >= EGGS.length) {
      document.documentElement.setAttribute("data-eggs", "complete");
      setTimeout(function () {
        confetti(110);
        eggNote("🎖️", "The cabinet is complete",
          "All seven found. Now go and pass the actual test.",
          "✦ " + EGGS.length + " of " + EGGS.length);
      }, 1100);
    }
  }

  /* ---- triggers ---- */

  var KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  var typed = "", arrows = [];

  function typing(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return /^(input|textarea|select)$/i.test(el.tagName || "");
  }

  function onEggKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target)) return;
    var k = String(e.key || "").toLowerCase();

    /* the arrow sequence */
    arrows.push(k);
    if (arrows.length > KONAMI.length) arrows.shift();
    if (arrows.length === KONAMI.length && arrows.join(",") === KONAMI.join(",")) {
      arrows = [];
      fireEgg("assent");
      return;
    }

    /* the typed words */
    if (!/^[a-z0-9]$/.test(k)) return;
    typed = (typed + k).slice(-12);
    for (var i = 0; i < EGGS.length; i++) {
      var w = EGGS[i].word;
      if (w && typed.slice(-w.length) === w) { typed = ""; fireEgg(EGGS[i].id); return; }
    }
  }

  /* ---- the plaque: a keyboard for a device that has none ----

     Six of the seven are words you type at the page, and a page never gets a
     keystroke on a phone unless the caret is in a field — which the typed
     triggers ignore on purpose, so the hub's search box stays a search box.
     Press and hold the seal (or the Hub pill on every other page) and this
     opens instead: one field, no label worth reading, and the same trailing
     match the keyboard uses, so a word fires the moment it is finished. */

  var plaque = null, swallowClick = false;

  function normSay(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function sayMatch(v) {
    var t = normSay(v);
    if (!t) return null;
    for (var i = 0; i < EGGS.length; i++) {
      var words = (EGGS[i].say || []).concat(EGGS[i].word ? [EGGS[i].word] : []);
      for (var j = 0; j < words.length; j++) {
        var w = normSay(words[j]);
        /* Trailing, not exact: iOS autocorrect likes to prepend a capital or
           leave a stray letter behind, and none of that should cost a find. */
        if (w && t.slice(-w.length) === w) return EGGS[i].id;
      }
    }
    return null;
  }

  function onPlaqueKey(e) {
    if (e.key === "Escape") closePlaque();
  }

  /* The keyboard shrinks the visual viewport but not the layout viewport a
     fixed element is pinned to, so a bottom sheet gets buried under it. Lift it
     by the difference and it sits on top of the keys, where you can see what
     you are typing. */
  function fitPlaque() {
    if (!plaque) return;
    var vv = window.visualViewport;
    var lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    plaque.back.style.paddingBottom = "calc(var(--lituk-sab,0px) + 18px + " + Math.round(lift) + "px)";
  }

  function closePlaque() {
    if (!plaque) return;
    var p = plaque;
    plaque = null;
    document.removeEventListener("keydown", onPlaqueKey);
    if (window.visualViewport) {
      visualViewport.removeEventListener("resize", fitPlaque);
      visualViewport.removeEventListener("scroll", fitPlaque);
    }
    try { p.input.blur(); } catch (e) {}
    p.back.classList.remove("on");
    setTimeout(function () { p.back.remove(); }, 300);
  }

  function tryWord(v) {
    var id = sayMatch(v);
    if (!id) return false;
    closePlaque();
    /* Let the keyboard drop first, or the confetti lands behind it. */
    setTimeout(function () { fireEgg(id); }, 120);
    return true;
  }

  function openPlaque() {
    if (plaque) return;

    var left = EGGS.length - Object.keys(eggsFound()).length;

    var back = document.createElement("div");
    back.className = "egg-plaque-back";

    var box = document.createElement("form");
    box.className = "egg-plaque";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Say the word");
    box.action = "#";

    var title = document.createElement("b");
    title.textContent = "Say the word";
    var sub = document.createElement("span");
    sub.textContent = left > 0
      ? left + (left === 1 ? " thing is" : " things are") + " still hidden in here."
      : "Nothing left to find. Say one again if you like.";

    var x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "×";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", closePlaque);

    var row = document.createElement("div");
    row.className = "egg-plaque-row";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("enterkeyhint", "go");
    input.setAttribute("aria-label", "The word");

    var go = document.createElement("button");
    go.type = "submit";
    go.className = "go";
    go.textContent = "Say it";

    input.addEventListener("input", function () { tryWord(input.value); });
    box.addEventListener("submit", function (e) {
      e.preventDefault();
      if (tryWord(input.value)) return;
      sub.textContent = "Nothing happens. Try another word.";
      if (calm()) return;
      box.classList.remove("no");
      void box.offsetWidth;
      box.classList.add("no");
    });
    back.addEventListener("click", function (e) { if (e.target === back) closePlaque(); });
    document.addEventListener("keydown", onPlaqueKey);

    row.appendChild(input);
    row.appendChild(go);
    box.appendChild(x);
    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add("on"); });

    plaque = { back: back, input: input };
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", fitPlaque);
      visualViewport.addEventListener("scroll", fitPlaque);
    }
  }

  /* iOS only raises the keyboard for a focus() that happens inside a real
     gesture handler, and a hold timer has long since left one — so the panel
     opens on the timer and the caret goes in on the release. */
  function focusPlaque() {
    if (!plaque) return;
    try { plaque.input.focus(); } catch (e) {}
    /* The keyboard animates in; visualViewport reports the new height a beat
       later, and one nudge afterwards covers the case where it never fires. */
    setTimeout(fitPlaque, 320);
  }

  /* ---- press and hold ---- */

  function hookHold(el, tap) {
    var timer = 0, live = false, opened = false, sx = 0, sy = 0;

    function stop() {
      clearTimeout(timer);
      live = false;
      el.classList.remove("egg-hold");
    }

    el.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      /* Cleared per press, not per click: iOS does not always send a click
         after a long press, and a stranded flag would eat the next real tap —
         which on the pill is the way home. */
      swallowClick = false;
      live = true;
      opened = false;
      sx = e.clientX;
      sy = e.clientY;
      el.classList.add("egg-hold");
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!live) return;
        opened = true;
        el.classList.remove("egg-hold");
        openPlaque();
      }, 620);
    });

    /* A hold that turns into a scroll is a scroll. */
    el.addEventListener("pointermove", function (e) {
      if (live && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) stop();
    });

    el.addEventListener("pointerup", function (e) {
      var held = opened;
      stop();
      opened = false;
      if (held) {
        e.preventDefault();
        swallowClick = true;      // the pill is a link; it must not navigate
        focusPlaque();
      } else if (tap) {
        tap();
      }
    });

    ["pointercancel", "pointerleave"].forEach(function (ev) {
      el.addEventListener(ev, function () { stop(); opened = false; });
    });

    el.addEventListener("click", function (e) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function hookFlag() {
    var seal = document.getElementById("flagSeal");
    if (!seal) return;
    var taps = 0, clear = 0;

    function cool() { taps = 0; seal.classList.remove("egg-warm"); }

    hookHold(seal, function () {
      taps++;
      clearTimeout(clear);
      clear = setTimeout(cool, 3200);
      if (!calm()) {
        seal.classList.remove("egg-tap");
        void seal.offsetWidth;
        seal.classList.add("egg-tap");
      }
      if (taps >= 3) seal.classList.add("egg-warm");
      if (taps >= 5) { clearTimeout(clear); cool(); fireEgg("flag"); }
    });
  }

  /* Every page but the hub gets the back-to-hub pill instead of a seal, so the
     pill carries the plaque there. lituk.html opts out of the pill entirely and
     has its own mascot to poke. */
  function hookPill() {
    var pill = document.querySelector(".lituk-hub");
    if (pill) hookHold(pill, null);
  }

  /* The cabinet is a closed disclosure in the hub footer, and it lists what is
     left by hint only. It used to stay invisible until the first find, which
     worked on a desktop where the console says how many are hidden — on a
     phone there is no console, so it was seven secrets and no door. It now
     opens from zero, and says nothing but how many. */
  function renderCurio() {
    var host = document.getElementById("curio");
    if (!host) return;
    var found = eggsFound();
    var n = Object.keys(found).length;
    var touch = coarse();

    var open = host.querySelector("details");
    open = open ? open.open : false;

    var d = document.createElement("details");
    d.className = "curio";
    d.open = open;
    var s = document.createElement("summary");
    s.textContent = n >= EGGS.length
      ? "🎖️ Cabinet of curiosities — all " + EGGS.length + " found"
      : n === 0
        ? "🎖️ Cabinet of curiosities — " + EGGS.length + " still hidden"
        : "🎖️ Cabinet of curiosities — " + n + " of " + EGGS.length + " found";
    d.appendChild(s);

    var g = document.createElement("div");
    g.className = "curio-grid";
    EGGS.forEach(function (egg) {
      var got = !!found[egg.id];
      var item = document.createElement("div");
      item.className = "curio-item" + (got ? " got" : "");
      var x = document.createElement("span");
      x.className = "cx";
      if (got) x.appendChild(iconNode(egg.icon));
      else x.textContent = "?";
      var body = document.createElement("div");
      var b = document.createElement("b");
      b.textContent = got ? egg.name : "Still hidden";
      var sub = document.createElement("span");
      sub.textContent = got ? egg.line : (touch && egg.touchHint ? egg.touchHint : egg.hint);
      body.appendChild(b);
      body.appendChild(sub);
      item.appendChild(x);
      item.appendChild(body);
      g.appendChild(item);
    });
    d.appendChild(g);

    /* Six of the hints say "say" rather than "type" on a phone, and this is the
       one line that explains where the saying happens. */
    if (touch && n < EGGS.length) {
      var note = document.createElement("p");
      note.className = "curio-note";
      note.appendChild(document.createTextNode("No keyboard on a phone — so press and hold the "));
      var b1 = document.createElement("b");
      b1.textContent = "seal at the top of this page";
      note.appendChild(b1);
      note.appendChild(document.createTextNode(" (or the "));
      var b2 = document.createElement("b");
      b2.textContent = "\u2190 Hub";
      note.appendChild(b2);
      note.appendChild(document.createTextNode(" pill on any other page), and say the word."));
      d.appendChild(note);
    }

    host.innerHTML = "";
    host.appendChild(d);
  }

  function startEggs() {
    if (Object.keys(eggsFound()).length >= EGGS.length) {
      document.documentElement.setAttribute("data-eggs", "complete");
    }
    renderCurio();
    hookFlag();
    hookPill();
    document.addEventListener("keydown", onEggKey);

    /* One line for anyone who opens the console. It is a hint, not a spoiler. */
    if (isHub()) {
      var left = EGGS.length - Object.keys(eggsFound()).length;
      if (left > 0 && window.console && console.log) {
        console.log("%cLife in the UK%c  " + left + " thing" + (left === 1 ? " is" : "s are") +
          " hidden in here. LitUK.eggs.hints() if you get stuck.",
          "font:700 12px system-ui;color:#D4A94E", "font:12px system-ui;color:#8B8F98");
      }
    }
  }

  var eggsAPI = {
    KEY: EGG_KEY,
    all: function () { return EGGS.map(function (e) { return { id: e.id, name: e.name, hint: e.hint }; }); },
    found: function () { return Object.keys(eggsFound()); },
    hints: function () {
      var f = eggsFound();
      return EGGS.filter(function (e) { return !f[e.id]; }).map(function (e) { return e.hint; });
    },
    fire: fireEgg,
    plaque: openPlaque,
    forget: function () { eggsSave({}); document.documentElement.removeAttribute("data-eggs"); renderCurio(); }
  };

  /* ---------------- service worker ---------------- */

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;   // no SW without http(s)

    /* A page that already has a controller is a returning reader, so a worker
       taking over underneath it means a new build just landed. A first install
       has no controller and nothing worth announcing. */
    var returning = !!navigator.serviceWorker.controller;
    var told = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (told || !returning || !document.body) return;
      told = true;
      /* Offered, not forced — they could be halfway through a question. */
      var t = eggNote("\u2728", "New version ready", "Tap to load the latest build.");
      if (t) t.addEventListener("click", function () { location.reload(); });
    });

    addEventListener("load", function () {
      navigator.serviceWorker.register(new URL("sw.js", location.href)).then(function (reg) {
        /* A new build only reaches a returning reader when the browser re-checks
           the worker, and it throttles that check hard — so a shipped change can
           sit behind the old cached shell for a day. Asking outright lands it on
           this visit instead. The worker already calls skipWaiting/clients.claim,
           so the next page they open runs the new code. */
        if (reg && reg.update) reg.update().catch(function () {});
      }).catch(function () {});
    });
  }

  /* ---------------- boot ---------------- */

  injectCSS();
  injectHub();
  setTheme(current(), true);
  setSkin(currentSkin(), true);
  setAccent(currentAccent(), true);
  seal();
  buildPicker();
  syncThemeColor();
  registerSW();

  var find = new URLSearchParams(location.search).get("find");
  if (find) highlight(find);

  /* After highlight(), which rewrites text nodes and may open a <details> —
     both move headings, and the measurement has to see where they ended up. */
  startReading();
  startEggs();

  window.LitUK = {
    THEME_KEY: THEME_KEY,
    getTheme: current,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    ACCENT_KEY: ACCENT_KEY,
    accents: ACCENTS.map(function (a) { return a.id; }),
    getAccent: currentAccent,
    setAccent: setAccent,
    SKIN_KEY: SKIN_KEY,
    getSkin: currentSkin,
    setSkin: setSkin,
    toggleSkin: toggleSkin,
    highlight: highlight,
    eggs: eggsAPI,
    reading: {
      KEY: READ_KEY,
      all: readAll,
      get: function (id) { return readAll()[id || pageId()] || null; },
      save: saveFlush,
      forget: function (id) {
        var store = readAll();
        if (id) delete store[id]; else store = {};
        readWrite(store);
      }
    }
  };
})();
