/* ============================================================
   Shared runtime for every page in the Life in the UK study hub.
   Owns: one theme across all pages, the back-to-hub pill,
   service-worker registration, and ?find= highlighting.
   ============================================================ */
(function () {
  "use strict";

  var THEME_KEY = "lituk_theme";
  var LEGACY_THEME_KEYS = ["liuk-story-theme"];

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

  function injectCSS() {
    var s = document.createElement("style");
    s.textContent = SAFE_CSS + HUB_CSS;
    document.head.appendChild(s);
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

  /* ---------------- service worker ---------------- */

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;   // no SW without http(s)
    addEventListener("load", function () {
      navigator.serviceWorker.register(new URL("sw.js", location.href)).catch(function () {});
    });
  }

  /* ---------------- boot ---------------- */

  injectCSS();
  injectHub();
  setTheme(current(), true);
  syncThemeColor();
  registerSW();

  var find = new URLSearchParams(location.search).get("find");
  if (find) highlight(find);

  window.LitUK = {
    THEME_KEY: THEME_KEY,
    getTheme: current,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    highlight: highlight
  };
})();
