/* ============================================================
   cheer.js — the warm layer.

   The last week before the test is the week the app stops being
   a drill sergeant. Nothing in here touches the question banks,
   the scoring, the spaced-repetition schedule or the progress
   store: it reads `lituk_v1` and never writes to it. Its own two
   keys are `lituk_cheer_v1` (the shelf) and `lituk_who_v1` (who
   is holding the phone).

   Three rules, learned the hard way from the curiosities in
   app.js — seven hidden things nobody ever found, because a
   person revising four days out does not go hunting for secrets:

     1. Nothing here is hidden. It is on screen, on the way to
        the work, whether or not you went looking.
     2. It is earned by studying, never by knowing a password.
     3. It is about the person doing it, by name.

   Loaded on the hub and on the Practice Tests page, after both
   have booted. Everything degrades to silence if the page it
   lands on is not one of those.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- who this is for ----------------
     Edit these two and the whole layer re-addresses itself. The
     nicknames rotate by day, which is the entire trick behind it
     sounding like a person rather than a mail merge. */

  var PEOPLE = {
    her: { id: "her", name: "Gulfeshan", nicks: ["Gulfeshan", "Gullu", "Bunty"], them: "Atiq" },
    him: { id: "him", name: "Atiq",      nicks: ["Atiq"],                        them: "Gullu" }
  };

  var EXAM_DATE = "2026-09-05";   /* both of them, same day */
  var TOTAL_TESTS = 170;
  var UNIQUE_QUESTIONS = 1600;    /* refined below from the live store if it knows better */

  var WHO_KEY = "lituk_who_v1";
  var SHELF_KEY = "lituk_cheer_v1";
  var STORE_KEY = "lituk_v1";

  /* ---------------- storage ---------------- */

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* The progress store is read fresh every time rather than cached: the
     Practice Tests page saves it and then renders, so a stale copy would
     always describe the session before the one just finished. */
  function store() { return read(STORE_KEY, {}) || {}; }

  function who() {
    var id = null;
    try { id = localStorage.getItem(WHO_KEY); } catch (e) {}
    return PEOPLE[id] || null;
  }
  function setWho(id) {
    try { localStorage.setItem(WHO_KEY, id); } catch (e) {}
  }

  function shelf() { return read(SHELF_KEY, {}) || {}; }
  function shelfSave(s) { write(SHELF_KEY, s); }

  /* ---------------- dates ---------------- */

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /* Whole days, counted from midnight to midnight, so "tomorrow" stays
     "tomorrow" at 11pm instead of rounding itself away to nothing. */
  function daysToExam() {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exam());
    if (!parts) return null;
    var target = new Date(+parts[1], +parts[2] - 1, +parts[3]);
    return Math.round((target - startOfDay(new Date())) / 864e5);
  }

  /* The store owns the exam date — it is what every review interval is
     squeezed to fit inside. Ours is only the fallback. */
  function exam() {
    var s = store();
    return typeof s.examDate === "string" && s.examDate ? s.examDate : EXAM_DATE;
  }

  function dayIndex() {
    var d = new Date();
    return Math.floor(startOfDay(d) / 864e5);
  }

  function partOfDay() {
    var h = new Date().getHours();
    if (h < 5) return "night";
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    return "evening";
  }

  function calm() {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function pluralise(n, one, many) { return n === 1 ? one : (many || one + "s"); }

  /* ---------------- what the store knows ---------------- */

  function stats() {
    var S = store();
    var sr = S.sr || {};
    var mistakes = S.mistakes || {};
    var tests = S.tests || {};
    var drill = S.drill || {};
    var recent = S.recent || [];

    var seen = Object.keys(sr).length;
    var openMistakes = Object.keys(mistakes).filter(function (g) { return !mistakes[g].done; }).length;

    var perfect = 0, bestScore = 0, sat = 0;
    Object.keys(tests).forEach(function (n) {
      var t = tests[n] || {};
      sat += t.attempts || 0;
      if (typeof t.best === "number") {
        if (t.best > bestScore) bestScore = t.best;
        if (t.best >= 24) perfect++;
      }
    });

    var recentPct = recent.length
      ? Math.round(recent.reduce(function (a, b) { return a + b; }, 0) / recent.length * 100)
      : null;

    var R = S.readiness && typeof S.readiness.p === "number" ? S.readiness.p : null;

    return {
      answered: S.answered || 0,
      correct: S.correct || 0,
      attempts: S.attempts || 0,
      passes: S.passes || 0,
      accuracy: S.answered ? Math.round((S.correct || 0) / S.answered * 100) : null,
      recentPct: recentPct,
      recentN: recent.length,
      seen: seen,
      coverage: Math.min(100, Math.round(seen / UNIQUE_QUESTIONS * 100)),
      openMistakes: openMistakes,
      streak: drill.streak || 0,
      bestStreak: drill.best || 0,
      drilledToday: drill.drilled === new Date().toISOString().slice(0, 10),
      perfect: perfect,
      bestScore: bestScore,
      sat: sat,
      readiness: R,
      history: S.history || []
    };
  }

  /* ---------------- the lines ----------------
     One per day, picked by date so it is stable from breakfast to
     bedtime and different tomorrow. Dry, mostly. Nothing here says
     "you've got this!!" because nobody has ever been comforted by
     an exclamation mark. */

  var DAILY = [
    "The Bill of Rights was 1689. You knew that. That is the whole point — you know more of this than the panic is letting you feel.",
    "Nobody has ever walked out of this test wishing they had worried more the week before.",
    "Somewhere in this app is a question about the flag of St Piran. It is not going to answer itself, but it also cannot hurt you.",
    "Revision law, unwritten: the fact you cannot recall right now is never the one they ask.",
    "You are allowed to get things wrong in here. That is what in here is for.",
    "The Domesday Book took a year. You have had considerably less time and covered considerably more ground.",
    "If it helps: the pass mark is 18 out of 24. You do not have to be perfect. You have to be fine.",
    "Take the tea break. The questions keep.",
    "Henry VIII had six wives and no idea what a spaced-repetition schedule was. You are ahead of him.",
    "Today's forecast: light drizzle, heavy revision, a strong chance of knowing more than you did yesterday.",
    "A gentle fact — most people who feel this underprepared pass comfortably. Feeling ready and being ready are two different measurements.",
    "The test is multiple choice. The answer is on the screen. You only have to recognise it, not summon it from nothing.",
    "Whoever invented the phrase \"just relax\" never sat an exam. Ignore them. Do six questions instead.",
    "You have read about a thousand years of people muddling through. You are qualified to muddle through a Tuesday.",
    "Small and often beats long and grim. Twenty questions is a real session.",
    "The Magna Carta was sealed by a king who did not want to. You are doing this voluntarily, which is already more impressive.",
    "Being tired is not the same as being unprepared. Check the numbers below before you believe the feeling.",
    "There is no prize for the most stressed candidate. There is a prize for the one who turns up.",
    "Everyone who has ever passed this test also, at some point in the week before, was convinced they would not.",
    "You are three-quarters of a millennium of British history deep. The last bit is just paperwork.",
    "Put the kettle on. Genuinely. Then twenty questions. In that order.",
    "The Angles, the Saxons, the Jutes, the Vikings and the Normans all turned up here unprepared. You have flashcards.",
    "If you only do one thing today, do the drill. If you do nothing today, that is also allowed.",
    "Confidence is not a prerequisite. Turning up is."
  ];

  /* The last stretch overrides the rotation entirely — on the days that
     actually matter the app should sound like it knows what week it is. */
  var COUNTDOWN = {
    3: "Three sleeps. This is the part where it feels worse than it is. Look at the numbers — they disagree with you.",
    2: "Two sleeps. Everything you are going to learn is more or less learned. From here it is upkeep, not cramming.",
    1: "Tomorrow. Do a light drill, eat something, stop early. Nothing learned tonight beats turning up rested.",
    0: "Today. You have done the work — all of it is already in there. Go and get it done, and we will see you on the other side."
  };

  function greeting(person) {
    var nick = person.nicks[dayIndex() % person.nicks.length];
    var part = partOfDay();
    if (part === "night") return "Still up, " + nick + "?";
    if (part === "morning") return "Morning, " + nick + ".";
    if (part === "afternoon") return "Afternoon, " + nick + ".";
    return "Evening, " + nick + ".";
  }

  function countdownLine() {
    var d = daysToExam();
    if (d === null) return "";
    if (d < 0) return "That's done. However it went — it is behind you now.";
    if (COUNTDOWN[d]) return COUNTDOWN[d];
    return d + " " + pluralise(d, "day") + " to go. Plenty.";
  }

  function countdownBadge() {
    var d = daysToExam();
    if (d === null) return "";
    if (d < 0) return "Sat it";
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    return d + " " + pluralise(d, "sleep");
  }

  /* The countdown lines point at the evidence block underneath them, so on a
     device with nothing in the store yet they were pointing at an empty space
     and telling her to look at numbers that were not there. `hasEvidence` picks
     the version that stands on its own. */
  var COUNTDOWN_BARE = {
    3: "Three sleeps. This is the stretch where it feels worse than it is. Do a test — you will almost certainly surprise yourself.",
    2: "Two sleeps. Whatever you get through now is a bonus; the bulk of it is already done.",
    1: "Tomorrow. A light run through, something to eat, an early night. Rested beats crammed.",
    0: "Today. Nothing left to learn now — go and get it done, and we will see you on the other side."
  };

  function dailyLine(hasEvidence) {
    var d = daysToExam();
    if (d !== null && d < 0) return "That's done. However it went — it is behind you now.";
    if (d !== null && COUNTDOWN[d]) return (hasEvidence ? COUNTDOWN : COUNTDOWN_BARE)[d];
    return DAILY[dayIndex() % DAILY.length];
  }

  /* ---------------- the evidence ----------------
     The single most useful thing this layer does. Exam nerves are a
     feeling, and a feeling loses an argument with a number. So the
     card puts her own numbers back in front of her, phrased as the
     case for the defence. */

  function evidence(st) {
    var bits = [];

    if (st.readiness != null && st.answered >= 40) {
      var p = Math.round(st.readiness * 100);
      if (p >= 85) {
        bits.push("The model has watched you answer <b>" + commas(st.answered) +
          "</b> questions and puts you at a <b>" + p + "%</b> chance of passing. It is not being polite — it is arithmetic.");
      } else if (p >= 55) {
        bits.push("A <b>" + p + "%</b> chance of passing, worked out from <b>" + commas(st.answered) +
          "</b> answers you have actually given. It moves every time you drill.");
      }
    }

    if (!bits.length && st.answered >= 200) {
      bits.push("You have answered <b>" + commas(st.answered) + "</b> questions in here. That is not nothing — that is a lot of evidence.");
    }

    if (st.passes >= 3) {
      bits.push("<b>" + st.passes + "</b> practice " + pluralise(st.passes, "test") + " passed.");
    }
    if (st.recentPct != null && st.recentN >= 20 && st.recentPct >= 75) {
      bits.push("Last " + st.recentN + " answers: <b>" + st.recentPct + "%</b>.");
    }
    if (st.coverage >= 40) {
      bits.push("<b>" + st.coverage + "%</b> of the bank met at least once.");
    }
    if (st.bestScore >= 22) {
      bits.push("Your best paper so far: <b>" + st.bestScore + "/24</b>.");
    }
    if (st.streak >= 2) {
      bits.push("<b>" + st.streak + "</b> days running.");
    }

    return bits;
  }

  /* ---------------- the shelf ----------------
     Eighteen things, every one of them earned by revising. There is no
     password, no tap-count and no konami code: you cannot go looking
     for these, you can only end up with them. They also backfill — the
     first time this runs it grades the work already done, so the shelf
     starts out with something on it rather than accusing you of having
     achieved nothing.

     Each one is checked against the store on every load. `test` gets the
     stats object and answers a plain boolean. */

  var BADGES = [
    { id: "start",    icon: "🌱", name: "Off the mark",
      line: "First question answered. Everything else on this shelf follows from it.",
      test: function (s) { return s.answered >= 1; } },

    { id: "century",  icon: "💯", name: "The hundred",
      line: "A hundred questions answered. This is the point where it stops being a browse and starts being revision.",
      test: function (s) { return s.answered >= 100; } },

    { id: "fivehun",  icon: "🖐", name: "Five hundred",
      line: "Five hundred answers deep. Whatever the nerves are telling you, this is what the work actually looks like.",
      test: function (s) { return s.answered >= 500; } },

    { id: "thousand", icon: "🏔", name: "The thousand",
      line: "A thousand questions. Genuinely — most people who pass this have done a fraction of that.",
      test: function (s) { return s.answered >= 1000; } },

    { id: "pass1",    icon: "✅", name: "First pass",
      line: "First practice test cleared. The real one is the same shape as that.",
      test: function (s) { return s.passes >= 1; } },

    { id: "pass10",   icon: "🎖", name: "Ten passes",
      line: "Ten of them. At some point this stops being luck and starts being a pattern.",
      test: function (s) { return s.passes >= 10; } },

    { id: "pass25",   icon: "🏆", name: "Twenty-five passes",
      line: "Twenty-five passed papers. You are comfortably past the point of needing to prove it.",
      test: function (s) { return s.passes >= 25; } },

    { id: "perfect",  icon: "💎", name: "Full marks",
      line: "24 out of 24. Not a single one dropped. Keep that one in your pocket for the walk in.",
      test: function (s) { return s.perfect >= 1; } },

    { id: "perfect5", icon: "👑", name: "Five perfect papers",
      line: "Five clean sheets. At this point the test is the one that should be nervous.",
      test: function (s) { return s.perfect >= 5; } },

    { id: "streak3",  icon: "🔥", name: "Three days running",
      line: "Three days in a row. Consistency is the entire trick — there is no other one.",
      test: function (s) { return s.bestStreak >= 3; } },

    { id: "streak7",  icon: "🗓", name: "A full week",
      line: "Seven straight days. That is a habit, not an effort.",
      test: function (s) { return s.bestStreak >= 7; } },

    { id: "spotless", icon: "🧼", name: "Nothing left to fix",
      line: "Mistakes list empty. Every question that ever caught you has been put back in its place.",
      test: function (s) { return s.answered >= 100 && s.openMistakes === 0; } },

    { id: "sharp",    icon: "🎯", name: "In form",
      line: "Nine out of ten on your recent answers. This is what ready feels like from the inside.",
      test: function (s) { return s.recentN >= 20 && s.recentPct >= 90; } },

    { id: "half",     icon: "🧭", name: "Half the bank",
      line: "Half of every question in here, met at least once. The other half is not scarier than this one was.",
      test: function (s) { return s.coverage >= 50; } },

    { id: "whole",    icon: "🗺", name: "Every question",
      line: "The entire bank, seen. There is nothing left in here that can surprise you.",
      test: function (s) { return s.coverage >= 99; } },

    { id: "owl",      icon: "🦉", name: "Past midnight",
      line: "Revising in the small hours. Admirable, faintly alarming, very much noted.",
      test: function (s) {
        return (s.history || []).some(function (h) {
          var hr = new Date(h.t).getHours();
          return hr >= 0 && hr < 5;
        });
      } },

    { id: "lark",     icon: "🐦", name: "Before seven",
      line: "Questions answered before most of the country was upright.",
      test: function (s) {
        return (s.history || []).some(function (h) {
          var hr = new Date(h.t).getHours();
          return hr >= 5 && hr < 7;
        });
      } },

    { id: "ready",    icon: "🚀", name: "Ready",
      line: "The model puts you above 85%. That is not encouragement — that is a measurement.",
      test: function (s) { return s.readiness != null && s.readiness >= 0.85; } }
  ];

  /* Grades the shelf, stores anything new, and hands back the freshly
     earned ones so the caller can make a noise about them. The very first
     run is silent by design: announcing fourteen badges at once for work
     done last week is a popup, not a moment. */
  function gradeShelf() {
    var st = stats();
    var have = shelf();
    var first = !have._seeded;
    var fresh = [];

    BADGES.forEach(function (b) {
      if (have[b.id]) return;
      var ok = false;
      try { ok = !!b.test(st); } catch (e) { ok = false; }
      if (!ok) return;
      have[b.id] = Date.now();
      if (!first) fresh.push(b);
    });

    if (first) have._seeded = Date.now();
    shelfSave(have);
    return fresh;
  }

  function shelfCount() {
    var have = shelf();
    return BADGES.filter(function (b) { return have[b.id]; }).length;
  }

  /* ---------------- styling ----------------
     Every colour is a fallback chain, because this file lands on two
     pages that name their variables differently: the hub speaks
     --card/--ink-2/--gold, Practice Tests speaks --panel/--muted/--brand.
     Naming a raw hex anywhere would break the eleven accents, the news
     skin and both themes at once. */

  var CSS =
    ".cheer{max-width:540px;margin:0 auto 22px;box-sizing:border-box;padding:16px 18px;" +
    "border-radius:16px;text-align:left;position:relative;overflow:hidden;" +
    "color:var(--ink,var(--text,#222));" +
    "background:var(--card,var(--panel,#fff));" +
    "border:1px solid color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 38%,var(--line,rgba(128,128,128,.3)));" +
    "box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.07)}" +
    ".cheer::before{content:'';position:absolute;inset:0 0 auto;height:3px;" +
    "background:linear-gradient(90deg,var(--gold,var(--brand,#D4A94E)),transparent)}" +

    ".cheer-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}" +
    ".cheer-hi{font:700 1.12rem/1.25 var(--serif,Georgia,serif);letter-spacing:-.01em;margin:0;" +
    "color:var(--ink,inherit)}" +
    ".cheer-days{margin-left:auto;flex:0 0 auto;font-size:.66rem;font-weight:800;letter-spacing:.1em;" +
    "text-transform:uppercase;padding:4px 9px;border-radius:999px;white-space:nowrap;" +
    "color:var(--gold,var(--brand,#D4A94E));" +
    "background:color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 13%,transparent);" +
    "border:1px solid color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 34%,transparent)}" +

    ".cheer-line{margin:9px 0 0;font-size:.88rem;line-height:1.55;" +
    "color:var(--ink-2,var(--muted,#666))}" +

    ".cheer-ev{margin:12px 0 0;padding:11px 13px;border-radius:12px;font-size:.8rem;line-height:1.6;" +
    "color:var(--ink-2,var(--muted,#666));" +
    "background:color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 7%,transparent);" +
    "border:1px solid color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 20%,transparent)}" +
    ".cheer-ev b{font-weight:750;color:var(--gold,var(--brand,#D4A94E))}" +
    ".cheer-ev .lbl{display:block;font-size:.62rem;font-weight:800;letter-spacing:.13em;" +
    "text-transform:uppercase;margin-bottom:5px;color:var(--ink-3,var(--muted,#888))}" +

    /* who is holding the phone — asked once, changed by tapping the name */
    ".cheer-ask{margin:10px 0 0;font-size:.85rem;color:var(--ink-2,var(--muted,#666))}" +
    ".cheer-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}" +
    ".cheer-btn{flex:0 0 auto;min-height:40px;padding:0 16px;border-radius:11px;cursor:pointer;" +
    "font:700 .84rem/1 var(--sans,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif);" +
    "color:var(--brand-ink,var(--on-solid,#20242C));" +
    "background:var(--gold,var(--brand,#D4A94E));border:0;" +
    "-webkit-appearance:none;appearance:none}" +
    ".cheer-btn.ghost{background:transparent;color:var(--ink-2,var(--muted,#666));" +
    "border:1px solid var(--line,rgba(128,128,128,.35))}" +
    ".cheer-swap{background:none;border:0;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;" +
    "-webkit-appearance:none;appearance:none;border-bottom:1px dashed color-mix(in srgb," +
    "var(--gold,var(--brand,#D4A94E)) 55%,transparent)}" +

    /* the shelf */
    ".cheer-shelf{max-width:540px;margin:0 auto 22px}" +
    ".cheer-shelf>summary{list-style:none;cursor:pointer;text-align:center;padding:8px;" +
    "font-size:.7rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;" +
    "color:var(--ink-3,var(--muted,#8B8F98));transition:color .15s ease}" +
    ".cheer-shelf>summary::-webkit-details-marker{display:none}" +
    ".cheer-shelf>summary:hover{color:var(--gold,var(--brand,#D4A94E))}" +
    ".cheer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(152px,1fr));gap:8px;margin-top:8px}" +
    ".cheer-b{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:11px;" +
    "border:1px solid var(--line,rgba(128,128,128,.3));font-size:.77rem;line-height:1.45}" +
    ".cheer-b .cx{flex:0 0 auto;font-size:1.05rem;line-height:1.3}" +
    ".cheer-b b{display:block;font-weight:700;color:var(--ink,inherit)}" +
    ".cheer-b span{display:block;color:var(--ink-3,var(--muted,#8B8F98));margin-top:1px}" +
    ".cheer-b.locked{opacity:.55}" +
    ".cheer-b.locked .cx{filter:grayscale(1)}" +
    ".cheer-b.got{border-color:color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 45%,transparent);" +
    "background:color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 8%,transparent)}" +
    ".cheer-b.got b{color:var(--gold,var(--brand,#D4A94E))}" +

    /* the note that announces a new badge, and the results reaction */
    ".cheer-toast{position:fixed;left:0;right:0;margin:0 auto;z-index:9999;width:max-content;" +
    "max-width:min(92vw,430px);bottom:calc(var(--lituk-sab,0px) + 22px);cursor:pointer;" +
    "padding:13px 17px;border-radius:14px;text-align:left;opacity:0;transform:translateY(16px);" +
    "transition:opacity .3s ease,transform .3s cubic-bezier(.2,.8,.3,1);" +
    "font:400 .85rem/1.5 var(--sans,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif);" +
    "color:var(--ink,var(--text,#222));background:var(--card,var(--panel,#fff));" +
    "border:1px solid color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 42%,var(--line,rgba(128,128,128,.35)));" +
    "box-shadow:0 2px 6px rgba(0,0,0,.22),0 18px 44px rgba(0,0,0,.3)}" +
    ".cheer-toast.on{opacity:1;transform:none}" +
    ".cheer-toast b{display:block;font-weight:700;font-size:.92rem}" +
    ".cheer-toast span{display:block;margin-top:2px;color:var(--ink-2,var(--muted,#777))}" +
    ".cheer-toast i{display:block;margin-top:7px;font-style:normal;font-size:.68rem;font-weight:800;" +
    "letter-spacing:.09em;text-transform:uppercase;color:var(--gold,var(--brand,#D4A94E))}" +

    /* the reaction that lands on the results screen */
    ".cheer-react{margin:0 0 16px;padding:15px 17px;border-radius:14px;position:relative;overflow:hidden;" +
    "background:var(--panel,var(--card,#fff));" +
    "border:1px solid color-mix(in srgb,var(--gold,var(--brand,#D4A94E)) 40%,var(--line,rgba(128,128,128,.3)))}" +
    ".cheer-react .rh{font:700 1.05rem/1.3 var(--serif,Georgia,serif);color:var(--ink,inherit)}" +
    ".cheer-react .rb{margin-top:5px;font-size:.86rem;line-height:1.55;color:var(--ink-2,var(--muted,#666))}" +
    ".cheer-react .rr{margin-top:11px;display:flex;gap:8px;flex-wrap:wrap}" +

    /* confetti, for the handful of moments that have actually earned it */
    ".cheer-stage{position:fixed;inset:0;z-index:9998;pointer-events:none;overflow:hidden;" +
    "transition:opacity .8s ease}" +
    ".cheer-stage.out{opacity:0}" +
    ".cheer-bit{position:absolute;top:-16px;width:9px;height:14px;display:block;opacity:.95;" +
    "animation:cheerFall linear forwards}" +
    "@keyframes cheerFall{to{transform:translate(var(--drift,0),108vh) rotate(var(--spin,180deg));opacity:.1}}" +

    "@media (prefers-reduced-motion:reduce){" +
    ".cheer-toast,.cheer-toast.on{transition:none}}" +
    "@media print{.cheer-toast,.cheer-stage{display:none}}";

  function injectCSS() {
    if (document.getElementById("cheer-css")) return;
    var s = document.createElement("style");
    s.id = "cheer-css";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------- noises ---------------- */

  var toastTimer = 0;

  function note(icon, title, line, tail) {
    var old = document.querySelector(".cheer-toast");
    if (old) old.remove();

    var t = document.createElement("div");
    t.className = "cheer-toast";
    t.setAttribute("role", "status");

    var h = document.createElement("b");
    h.textContent = icon + "  " + title;
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
      clearTimeout(toastTimer);
      t.classList.remove("on");
      setTimeout(function () { t.remove(); }, 400);
    }
    t.addEventListener("click", close);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(close, 5200);
    return t;
  }

  var INK = ["#C8102E", "#F4F2EA", "#012169", "#D4A94E"];

  /* Spent sparingly and on purpose. Confetti for every passed paper is
     wallpaper; confetti for a full 24 is a moment. */
  function confetti(n) {
    if (calm()) return;
    var d = document.createElement("div");
    d.className = "cheer-stage";
    document.body.appendChild(d);
    for (var i = 0; i < n; i++) {
      var b = document.createElement("i");
      b.className = "cheer-bit";
      b.style.left = (Math.random() * 100).toFixed(2) + "vw";
      b.style.background = INK[i % INK.length];
      b.style.animationDelay = (Math.random() * .9).toFixed(2) + "s";
      b.style.animationDuration = (2.3 + Math.random() * 1.7).toFixed(2) + "s";
      b.style.setProperty("--spin", (Math.random() * 1080 - 540).toFixed(0) + "deg");
      b.style.setProperty("--drift", (Math.random() * 140 - 70).toFixed(0) + "px");
      if (i % 3 === 0) b.style.borderRadius = "50%";
      d.appendChild(b);
    }
    setTimeout(function () { d.classList.add("out"); }, 4400);
    setTimeout(function () { d.remove(); }, 5200);
  }

  function announce(fresh) {
    if (!fresh || !fresh.length) return;
    /* One at a time, so three at once reads as three moments rather than
       one pile — and if more than three land together it is the ones
       further down the list that get said out loud. "Off the mark" is not
       the badge to lead with when "Full marks" arrived alongside it. */
    fresh.slice(-3).forEach(function (b, i) {
      setTimeout(function () {
        note(b.icon, b.name, b.line, "✦ " + shelfCount() + " of " + BADGES.length + " on the shelf");
      }, 900 + i * 5600);
    });
  }

  /* ---------------- the hub card ---------------- */

  function renderCard() {
    var host = document.getElementById("cheer");
    if (!host) return;
    var person = who();
    var st = stats();

    if (!person) {
      host.innerHTML =
        '<div class="cheer">' +
          '<div class="cheer-top"><p class="cheer-hi">Before we start —</p></div>' +
          '<p class="cheer-ask">Who\'s revising? So this stops addressing you as "user".</p>' +
          '<div class="cheer-btns">' +
            '<button class="cheer-btn" data-who="her">' + esc(PEOPLE.her.nicks[1] || PEOPLE.her.name) + '</button>' +
            '<button class="cheer-btn ghost" data-who="him">' + esc(PEOPLE.him.name) + '</button>' +
          '</div>' +
        '</div>';
      Array.prototype.forEach.call(host.querySelectorAll("[data-who]"), function (b) {
        b.addEventListener("click", function () {
          setWho(b.getAttribute("data-who"));
          renderCard();
          renderShelf();
        });
      });
      return;
    }

    var ev = evidence(st);
    var days = daysToExam();

    var html =
      '<div class="cheer">' +
        '<div class="cheer-top">' +
          '<p class="cheer-hi"><button class="cheer-swap" type="button" title="Not you? Tap to switch">' +
            esc(greeting(person)) + '</button></p>' +
          (countdownBadge() ? '<span class="cheer-days">' + esc(countdownBadge()) + '</span>' : '') +
        '</div>' +
        '<p class="cheer-line">' + esc(dailyLine(ev.length > 0)) + '</p>';

    if (ev.length) {
      html += '<div class="cheer-ev"><span class="lbl">' +
        (days !== null && days <= 3 && days >= 0 ? "The case for the defence" : "Where you actually are") +
        '</span>' + ev.join(" ") + '</div>';
    }

    /* Both of them sit it on the same day, which is worth saying out loud
       on the days it counts — revising alone and revising together are
       different experiences of the same week. */
    if (days !== null && days >= 0 && days <= 3) {
      html += '<p class="cheer-line" style="margin-top:10px">You and ' + esc(person.them) +
        ', same morning. Whatever happens, you are both walking into it having done the work.</p>';
    } else if (days !== null && days < 0) {
      html += '<p class="cheer-line" style="margin-top:10px">Whatever the result, you and ' + esc(person.them) +
        ' did the work — and this app can finally go and be quiet.</p>';
    }

    html += '</div>';
    host.innerHTML = html;

    var swap = host.querySelector(".cheer-swap");
    if (swap) swap.addEventListener("click", function () {
      setWho(person.id === "her" ? "him" : "her");
      renderCard();
      renderShelf();
    });
  }

  /* ---------------- the shelf, drawn ---------------- */

  function renderShelf() {
    var host = document.getElementById("cheerShelf");
    if (!host) return;
    var have = shelf();
    var got = shelfCount();

    var items = BADGES.map(function (b) {
      var mine = !!have[b.id];
      return '<div class="cheer-b ' + (mine ? "got" : "locked") + '">' +
        '<span class="cx">' + b.icon + '</span>' +
        '<div><b>' + esc(mine ? b.name : "Not yet") + '</b>' +
        '<span>' + esc(mine ? b.line : b.name) + '</span></div></div>';
    }).join("");

    host.innerHTML =
      '<details class="cheer-shelf"' + (got ? "" : " hidden") + '>' +
        '<summary>🏅 The shelf — ' + got + ' of ' + BADGES.length + '</summary>' +
        '<div class="cheer-grid">' + items + '</div>' +
      '</details>';
  }

  /* ---------------- the results screen ----------------
     Practice Tests already tells you the score and whether it cleared the
     bar. What it never did was say anything to the person who just sat
     it. This adds one paragraph that does — pitched to how it actually
     went, and warmest exactly where the old copy was coldest, which was
     a near miss reported as a subtraction. */

  var TRAINING = { drill: 1, sweep: 1, twist: 1, dates: 1, examq: 1, mset: 1, hset: 1 };

  function reaction(score, total, passed, src, st) {
    var person = who();
    var nick = person ? person.nicks[dayIndex() % person.nicks.length] : null;
    var need = Math.round(18 / 24 * total);
    var short = need - score;

    /* Training sets are built to be hard — a low score in one is the
       format working, not the person failing, and it should never be
       reported in the same tone as a dropped exam. */
    if (TRAINING[src]) {
      if (src === "mset" || src === "hset") {
        return { h: "That's the hard pile, done",
          b: "Those are your worst questions by construction — the ones that already caught you once. Getting " +
             score + " of " + total + " out of that set is not the same as getting " + score +
             " out of a fair one, and it counts for more." };
      }
      if (score >= total * 0.8) {
        return { h: "Strong run" + (nick ? ", " + nick : ""),
          b: score + " of " + total + " on a set that was deliberately stacked against you. Nothing to fix here." };
      }
      return { h: "Good — that's the point of it",
        b: "Training sets are meant to sting a bit. " + score + " of " + total +
           " here says nothing about the real paper, and every one you missed just got scheduled to come back." };
    }

    if (score === total && total >= 10) {
      return { big: true, h: "Full marks" + (nick ? ", " + nick : ""),
        b: "Every single one. Not a lucky paper — a clean one. Remember this on the walk in." };
    }
    if (passed && score >= total - 1) {
      return { big: true, h: "That's about as good as it gets",
        b: score + " of " + total + ", one off perfect, and " + (score - need) +
           " clear of the pass mark. You are not scraping this." };
    }
    if (passed && score - need >= 3) {
      return { h: "Comfortably through",
        b: score + " of " + total + " — " + (score - need) + " more than you needed. " +
           "That is the margin that means a bad morning still passes." };
    }
    if (passed) {
      return { h: "Passed" + (nick ? ", " + nick : ""),
        b: score + " of " + total + ". Through is through, and the real one asks no more of you than this did." };
    }
    if (short <= 2) {
      return { h: "So close it barely counts as a miss",
        b: short + " " + pluralise(short, "question") + " off. " +
           "That is a gap you close by breakfast, not a verdict on whether you know this. Fix them and go again." };
    }
    return { h: "Fine — that's what practice is for",
      b: "This one did not go your way, and it costs you nothing. Every question you missed has just been " +
         "put on the list to come back at you until it stops being a problem." };
  }

  /* A one-tap brag. No backend, no account: it hands the sentence to the
     phone's own share sheet, or to the clipboard on a desktop. The whole
     "two of you" feature is this button. */
  function bragText(score, total, passed, title) {
    var person = who();
    var mine = person ? person.nicks[0] : "Me";
    var d = daysToExam();
    var when = d === null ? "" : d > 0 ? d + " " + pluralise(d, "sleep") + " to go." : d === 0 ? "Today's the day." : "";
    return mine + " — " + (title || "practice test") + ": " + score + "/" + total +
      (passed ? " ✅" : "") + "\n" + (when ? when + " " : "") + "Life in the UK study hub.";
  }

  function brag(score, total, passed, title) {
    var text = bragText(score, total, passed, title);
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
      return;
    }
    var done = function () {
      note("📤", "Copied", "Paste it wherever you like — it is ready to send.", "");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    }
  }

  function decorateResults(score, total, passed) {
    var el = document.getElementById("view-results");
    if (!el || el.querySelector(".cheer-react")) return;

    var S = store();
    var last = (S.history || [])[0] || {};
    var src = last.src || "";
    var title = last.title || "";
    var st = stats();
    var r = reaction(score, total, passed, src, st);
    var person = who();

    var box = document.createElement("div");
    box.className = "cheer-react";
    box.innerHTML = '<div class="rh">' + esc(r.h) + '</div><div class="rb">' + esc(r.b) + '</div>';

    /* Worth sending only when it is worth sending. A button offering to
       broadcast a 9/24 is not a kindness. */
    if (person && (passed || score === total || score >= total * 0.8)) {
      var row = document.createElement("div");
      row.className = "rr";
      var b = document.createElement("button");
      b.className = "cheer-btn";
      b.type = "button";
      b.textContent = "📤 Send this to " + person.them;
      b.addEventListener("click", function () { brag(score, total, passed, title); });
      row.appendChild(b);
      box.appendChild(row);
    }

    /* Anchor after the score card, so the number lands first and the
       sentence about it lands second. */
    var hero = el.querySelector(".card.pad");
    if (hero && hero.parentNode) hero.parentNode.insertBefore(box, hero.nextSibling);
    else el.insertBefore(box, el.firstChild);

    if (r.big) confetti(110);

    announce(gradeShelf());
  }

  /* ---------------- during the session ----------------
     A run of right answers is the one thing that happens mid-revision
     that is worth marking, and it is invisible in the existing UI. Read
     off the verdict the page has already painted, so this needs no
     access to the session object at all. */

  var run = 0;
  var RUN_LINES = {
    5:  ["Five in a row", "Not a fluke — that is a streak."],
    10: ["Ten straight", "Ten correct without a stumble. This is what the real thing feels like when it goes well."],
    15: ["Fifteen", "Fifteen unbroken. Whatever you were worried about, it is not this."],
    20: ["Twenty in a row", "Twenty. At this point you are showing off, and you have earned it."]
  };

  function watchRun() {
    var v = document.querySelector("#explain .verdict");
    if (!v) return;
    if (v.classList.contains("good")) {
      run++;
      var line = RUN_LINES[run];
      if (line) note("🔥", line[0], line[1], "");
    } else {
      run = 0;
    }
  }

  /* ---------------- boot ---------------- */

  function patch(name, after) {
    var original = window[name];
    if (typeof original !== "function" || original.__cheered) return;
    var wrapped = function () {
      var out = original.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) {}
      return out;
    };
    wrapped.__cheered = true;
    window[name] = wrapped;
  }

  function boot() {
    injectCSS();

    /* Grade before drawing, so a badge earned by work done on another
       page is already on the shelf the first time this one paints. */
    var fresh = gradeShelf();

    if (document.getElementById("cheer")) {
      renderCard();
      renderShelf();
      announce(fresh);
    }

    patch("renderResults", function (score, total, passed) {
      decorateResults(score, total, passed);
    });
    patch("checkQ", watchRun);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* A small console door, same spirit as the rest of the app. */
  window.LitUKCheer = {
    who: who,
    setWho: function (id) { setWho(id); renderCard(); renderShelf(); },
    badges: function () {
      var have = shelf();
      return BADGES.map(function (b) { return { id: b.id, name: b.name, got: !!have[b.id] }; });
    },
    stats: stats,
    days: daysToExam,
    forget: function () { shelfSave({}); renderShelf(); }
  };
})();
