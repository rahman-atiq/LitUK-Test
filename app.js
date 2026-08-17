/* ============================================================
   Shared runtime for every page in the Life in the UK study hub.
   Owns: one theme across all pages, the back-to-hub pill, saved reading
   positions, service-worker registration, and ?find= highlighting.
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

  /* After highlight(), which rewrites text nodes and may open a <details> —
     both move headings, and the measurement has to see where they ended up. */
  startReading();

  window.LitUK = {
    THEME_KEY: THEME_KEY,
    getTheme: current,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    highlight: highlight,
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
