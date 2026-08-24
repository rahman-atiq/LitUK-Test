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
    s.textContent = SAFE_CSS + HUB_CSS + EGG_CSS;
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
