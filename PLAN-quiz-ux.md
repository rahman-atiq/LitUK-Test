# Quiz UX — Implementation Plan

Make a quiz session survive navigation and app restarts, stop the app recording
attempts nobody asked for, and give the question screen its space back.

> Drafted 2026-08-13, decisions resolved the same day, to be executed in a fresh
> session. Findings verified against the working tree at commit `96b3157`. Nothing
> here changes question content or the shape of `S` — see INV-11.

## The problem in one line

The session lives in a single module-level variable with no way back into it, so
walking away from a quiz destroys it — and if it was timed, it comes back twenty
minutes later and records a failure.

---

## 1. Verified findings

| # | Finding | Evidence |
| --- | --- | --- |
| F-1 | `go('quiz')` is only ever called from `makeSession()`. Once any other view is shown, a live session is unreachable. | [life-in-uk-mock-tests.html:640](life-in-uk-mock-tests.html#L640), [:507](life-in-uk-mock-tests.html#L507) |
| F-2 | `sess` is a plain module variable. A reload, an iOS webview eviction, or a tab close loses it entirely. | [:615](life-in-uk-mock-tests.html#L615) |
| F-3 | The timer tick does not check whether the quiz is on screen. A stranded timed session still reaches `finishQuiz()`. | [:999-1005](life-in-uk-mock-tests.html#L999-L1005) |
| F-4 | `finishQuiz()` grades unanswered items as wrong, increments `S.attempts`, and writes `S.tests[testN]` — with no user action. | [:1401](life-in-uk-mock-tests.html#L1401) |
| F-5 | `sess.remain--` accumulates one decrement per interval tick. A backgrounded PWA stops ticking, so a timed test silently grants extra time. | [:999](life-in-uk-mock-tests.html#L999) |
| F-6 | `beforeunload` guards tab close, but only for `sess.timed` *and* only while the quiz view is on screen. Nothing guards in-app navigation. | [:1933](life-in-uk-mock-tests.html#L1933) |
| F-7 | `it._rec` (`{preBox, credited, retired}`) is read by `markUnsure()` to roll the SR box back. It exists only in memory. | [:1248](life-in-uk-mock-tests.html#L1248), [:1133](life-in-uk-mock-tests.html#L1133) |
| F-8 | The dot navigator renders one 30px button per question. At the default drill size of 60 that is six rows — **~210px on every question**. | [:163-164](life-in-uk-mock-tests.html#L163-L164), `DRILL_DEFAULT=60` at [:607](life-in-uk-mock-tests.html#L607) |
| F-9 | `checkQ()` calls `paintCheck()`, then `renderQuiz()`, which reassigns `innerHTML` and calls `paintCheck()` again. The first call paints a discarded DOM. | [:1083-1092](life-in-uk-mock-tests.html#L1083-L1092) |
| F-10 | In instant mode a **picked but unchecked** item is scored wrong at the end and never reaches `recordAnswer()` — it costs a point on the results screen and teaches the Leitner schedule nothing. `recordAnswer()` is reached from `checkQ()` and from `finishQuiz()`'s exam branch only. | [:1684](life-in-uk-mock-tests.html#L1684) vs [:1359](life-in-uk-mock-tests.html#L1359), [:1681](life-in-uk-mock-tests.html#L1681) |

### What F-1 through F-4 cost together

Leave a timed Test 12 at question 9 to glance at Stats. The quiz view hides; `sess`
survives but is unreachable. The interval keeps running. Twenty minutes later
`finishQuiz()` fires from under whatever screen you are on: fifteen unanswered
questions are graded wrong, `S.attempts` goes up, `S.tests[12]` records the sit, and
you are dropped onto a results page for a test you never abandoned on purpose.

Pass probability is derived from that data. This is the only finding in the plan that
makes the app lie to you.

### Storage headroom

Persisting `sess` whole is not an option — `items[].q` is a live reference into the
bank, so a 60-question drill would serialise ~60 KB of duplicated question text.
Storing `q.g` and rehydrating through `QByG` gives roughly:

| Session | Persisted size |
| --- | --- |
| 24-question test | ~2 KB |
| 60-question drill (default) | ~5 KB |
| 200-question drill (`DRILL_MAX`) | ~18 KB |

Against `S`, which is already written in full on every single answer, this is noise.

---

## 2. Hard constraints

Continuing the numbering in [PLAN-practice-tests.md](PLAN-practice-tests.md) and
[PLAN-exam-sprint.md](PLAN-exam-sprint.md).

| ID | Invariant |
| --- | --- |
| INV-9 | No code path may write `S.attempts`, `S.passes` or `S.tests[n]` without an explicit user action. Expiry, resume and reload may *offer* to submit; none of them may submit. |
| INV-10 | A timed session's remaining time is derived from an absolute deadline and the wall clock. Never accumulated from interval ticks. |
| INV-11 | This plan does not change the shape of `S` or the meaning of any existing key. The session lives under its own key and is absent from backups. Every phase is revertable with `git revert` and no migration. |
| INV-12 | A restored session is all-or-nothing. If any `g` fails to resolve against the bank, that session is discarded rather than silently shortened — a 24-question test that resumes with 23 is worse than one that resumes not at all. A bad session never blocks the others from loading. |
| INV-13 | No session is ever deleted without a user action. No time expiry, no count cap, no eviction (D-3). Finishing one and discarding one are the only two ways a session leaves the store. |

**Carried forward:** INV-1 (`lituk_v1` and `lituk_prefs` key names never change) is
satisfied by adding a third key, not by touching either of those two.

---

## 3. Decisions — resolved 2026-08-13

| # | Question | Resolution |
| --- | --- | --- |
| D-1 | Does leaving a **timed** test pause its clock? | **No.** Absolute deadline, wall clock. On return past it, offer *Submit what I had* / *Discard, record nothing* — never auto-grade (INV-9). |
| D-2 | One live session, or several in parallel? | **Several.** Overrides the drafted recommendation of one. Sessions are a keyed collection, not a slot; starting a new one never destroys an old one. See §3.1 — this is the decision with the most reach. |
| D-3 | Do abandoned sessions expire? | **No expiry, show the age.** Nothing auto-deletes study state (INV-13). |
| D-4 | On app launch with a stored session, open it or land on the dashboard? | **Dashboard**, with the resume list at the top. |

### 3.1 What "several" costs

Allowing parallel sessions removes the confirm-on-overwrite the draft relied on, and
introduces three problems in its place.

**The Drill tab is a session generator.** The header's Drill tab is
`onclick="startDrill()"` ([life-in-uk-mock-tests.html:300](life-in-uk-mock-tests.html#L300)) —
it is a *start* action wearing a *navigation* label. With one session slot that was
merely destructive; with several it means tapping Drill → Stats → Drill leaves two
half-finished drills behind. Resolution: **a tab navigates, a button acts.**

- Drill **tab** → resume the newest unfinished drill if one exists, else start one.
- Dashboard **Start drill** button → always starts fresh.

**Same-identity collisions.** Starting a Test 12 while an unfinished Test 12 exists is
the one genuinely ambiguous case. Resolution: prompt *Resume / Start fresh* only when
`source` **and** `testN` both match an unfinished session. Distinct things — Test 12
against a Daily drill — never prompt; they just coexist, which is the point of D-2.

**Unbounded accumulation.** D-2 and D-3 together mean sessions are created freely and
never expire. At ~5 KB each this is not a storage problem (see §1), it is a dashboard
problem: an unbounded resume list would push the drill card and the stat tiles below
the fold and undo the 2026-08-13 space work. Resolution: **no eviction ever**
(INV-13), but the dashboard shows the 3 most recent with an *"N more"* expander, and
every card carries a Discard. If the list ever gets genuinely silly, that is
information about how the app is being used, and it is one tap per row to clear.

---

## 4. Phases

Ranked. Phase 1 pays for itself; everything below it is comfort. **Drop from the
bottom without guilt** — 23 days to the exam on 2026-09-05, and the sprint plan's own
risk table is explicit that build hours are drill hours.

### Phase 1 — A session you cannot lose

> **Status: built 2026-08-13, not yet GO.** All nine changes are in
> `life-in-uk-mock-tests.html`; `sw.js` VERSION bumped to `2026-08-13b` so the
> phones actually pick it up. The GO list below is unrun — every line of it is a
> thing to do on a device, and none of it is done.
>
> Two things the plan did not anticipate, both resolved in code:
>
> - **The Date Gauntlet builds questions the bank does not contain.**
>   `dateForward`/`dateReverse` synthesise option lists, so rehydrating from `g`
>   alone would hand back the bank question with the wrong options and `picked`
>   indices pointing at nothing. Derived items now persist their own stem and
>   options (`d:{t,o,_derived}`); everything else still comes from the id.
> - **Elapsed time on the results screen is now wall clock across a break.** A
>   drill resumed the next morning would have claimed "1440:00 taken". The chip
>   is dropped past 6 hours rather than reported.
>
> One deliberate omission: `toggleFlag` is **not** a session write point. Flags
> live in `S.flags`, not in the session, so the slim projection is byte-identical
> before and after — the write would cost a localStorage round trip per flag tap
> and change nothing.

**Goal:** navigate away, close the app, come back tomorrow, carry on. And nothing is
ever recorded that you did not ask to record.

**Changes**

1. **Persist a slim projection** under a new key `lituk_sess_v1`, as a keyed
   collection rather than a slot (D-2):

   ```js
   {v:1, sessions:{ [sid]: {
      sid, instant, title, timed, testN, source, idx, readyBefore, startTs, deadline,
      items:[{g, order, picked, checked, _correct, unsure, _rec}]
   }}}
   ```

   `sid` is `startTs` — already stored, unique per session for any human, and sorts
   by recency for free. No `activeSid`: D-4 lands on the dashboard, so nothing is
   active at load time and there is no such thing to restore.

   `_rec` is not optional — F-7. Without it, "Wasn't sure" on a resumed question
   reads `preBox` as undefined, resets the box to 0 instead of restoring it, and
   fails to take back the credited day.

   `order` is persisted so option letters do not reshuffle under you mid-test.
   `picked` already stores original option indices, so correctness would survive a
   reshuffle — legibility would not.

2. **Rehydrate on load**, before `renderDashboard()`. Map `g → QByG[g]` per session;
   drop any session with an unresolvable id, keep the rest (INV-12).

3. **Write on every state change** — `pick`, `checkQ`, `markUnsure`, `prevQ`, `nextQ`,
   `jump`, `toggleFlag` — writing only the active `sid`'s entry. `save()` already
   writes all of `S` at those points; this is strictly cheaper.

4. **Remove an entry in exactly two places** — `finishQuiz()`, and an explicit
   discard. Nothing else, ever (INV-13).

5. **Resume UI**, two entry points:
   - A **resume list** above the drill card on the dashboard, newest first, 3 shown
     with an *"N more"* expander (§3.1). Each row: *"Test 12 · Q9/24 · 31 min left ·
     started 19:42 today"*, with **Resume** and **Discard**. Age is on every row per
     D-3. This is the durable entry point; it survives an app restart.
   - A **▶ Resume** chip in the header while a session is active, returning to *that*
     session — so a glance at Stats mid-drill is one tap out and one tap back,
     without going via the list.

6. **Wall-clock timer** (INV-10, and fixes F-5). `deadline = startTs + 45*60*1000`
   stored absolutely; `remain` derived as `Math.max(0,(deadline-Date.now())/1000|0)`
   on each tick. Guard the tick with a visibility check so no path can resurrect a
   hidden session's clock.

7. **Expired-on-return screen** (INV-9). If a timed session is resumed past its
   deadline: *Submit what I had* / *Discard, record nothing*. No third option, no
   default action, nothing on a timer.

8. **Tabs navigate, buttons act** (§3.1). The Drill tab resumes the newest unfinished
   drill if there is one, else starts one; the dashboard's Start drill button always
   starts fresh. Same-identity collisions (`source` + `testN` both matching an
   unfinished session) prompt *Resume / Start fresh*; everything else just coexists.
   The `route()` deep links (`#drill`, `#sweep`, …) take the tab behaviour — a
   bookmarked launch should land you back in the drill you were doing, not open a
   second one beside it.

9. **Retire the `beforeunload` guard** (F-6). Once the session is durable, the dialog
   is warning about a loss that can no longer happen. Deleting a spurious "are you
   sure you want to leave?" is itself a UX win.

**Note on the header.** My earlier suggestion — replace the tabs with a ✕ during a
session — is **dropped**. It bought ~48px of sticky header by making the session
fragile in a different way. Resume is worth more than the pixels. The header shrink
survives as Phase 4, on its own merits.

**GO criteria**

- Start Test 12, answer 3, tap **Stats**, tap **Resume** → question 4, three answers
  intact, clock where it should be.
- Same, but force-quit the PWA and reopen → dashboard shows the resume card; resuming
  restores all three answers.
- Start a timed test, leave it, wait past the clock → **no results screen appears and
  `S.attempts` does not move** until a button is pressed.
- Background the app for 2 minutes mid-timed-test → the clock has lost 2 minutes, not 0.
- Answer a question, leave, resume, tap **Wasn't sure** → `S.sr[g].box` returns to its
  pre-answer value and the credited day comes off `m.ok`.
- Start a drill while a test is live → **both** appear in the resume list, both
  resumable, neither disturbed.
- Tap Drill → Stats → Drill → **one** drill session exists, not two, and the second
  tap lands back on the question you left.
- Start Test 12 while an unfinished Test 12 exists → prompted *Resume / Start fresh*.
  Start Test 12 while an unfinished *drill* exists → no prompt.
- Discard a session from the list → it goes; every other session survives.
- Corrupt one stored session's `g` by hand → that one is dropped on load, the others
  still resume (INV-12).
- Export a backup mid-session → the JSON contains no session key.
- `node tools/test-backup.mjs` and `node tools/validate-banks.mjs` pass.

**What has been checked without a device (2026-08-13).** `tools/test-backup.mjs`
(348 checks) and `tools/validate-banks.mjs` both pass. A throwaway harness ran the
real engine in node behind a stub DOM — no browser — booting it repeatedly over one
localStorage to stand in for app restarts: 43 assertions covering persist/rehydrate,
option-order stability, `_rec` survival, backup exclusion, parallel sessions, the
Drill-tab and same-identity rules, single-session removal on finish, INV-12's
all-or-nothing drop, and the derived Date Gauntlet round trip. **It proves the data
survives. It proves nothing about how any of this feels or looks on a phone** — the
GO list above is still the gate.

**This is the revert point for everything that follows.**

---

### Phase 2 — Give the question screen its space back

> **Status: built 2026-08-13, not yet GO.** Item 3 — the one that said "worth a
> look, not worth forcing" — turned out to be the whole answer, so the shape
> differs from the draft: **the strip replaced `.qprog` rather than sitting where
> the grid was.** A per-question segment says everything the progress bar said
> (how far along you are is where the tall brand segment sits) and adds what the
> grid was really being kept on screen for. So the top of the question costs 6px
> instead of 3px, and the bottom loses the grid entirely — on paper, from the CSS
> rather than from a phone, ~210px of grid becomes a ~39px toggle.
>
> Two things worth knowing before it goes on a device:
>
> - **Flags are not on the strip.** A 3px segment cannot carry the grid's border
>   colour. Flagged questions show in the grid, which is one tap away and is
>   where you go to jump to them anyway.
> - **`pick()` now refreshes the navigator in instant mode too**, which it did
>   not before. With the grid folded away the strip is the only thing on screen
>   that knows a question is answered; it could not be the thing that goes stale.

**Goal:** stop spending 210px per question on a control you use twice a session.

**Changes**

1. **Collapse the dot grid by default** when `sess.items.length > 24`, behind a
   *"Jump to question ▾"* toggle. At 24 or fewer — the exam-shaped sessions, where
   revisiting is the point — keep it expanded. Remember the choice in `prefs`.
2. **A thin segmented strip** in its place: full width, ~4px tall, one segment per
   question, coloured by the existing `ok` / `no` / `ans` / `cur` states. Keeps the
   at-a-glance overview the grid was really providing without the six rows.
3. Consider folding the strip and the `.qprog` bar added on 2026-08-13 into one
   element — they currently show position and progress separately, a few pixels apart.
   Worth a look during implementation; not worth forcing.

**GO criteria** — a 60-question drill shows ≤ 40px of navigator by default; the toggle
reveals all 60 and the choice survives a reload; a 24-question test still shows the
grid; the strip's colours match the grid's for the same session.

---

### Phase 3 — Swipe between questions

> **Status: built 2026-08-13, not yet GO.** Built as specified, including the
> picked-but-unchecked guard, the 24px edge exclusion and the last-question
> no-op. Listeners are `passive:true` and never call `preventDefault()`, so
> scrolling is untouched by construction.
>
> The risk table said to ship Phase 1 alone, use it for a day, then decide on
> Phase 3 — **that did not happen; both are landing together.** The sticky action
> bar, the swipe and the folded navigator are three touch changes on one screen
> arriving in one go. If the question screen feels wrong on the phone, that is
> the thing to remember, and Phase 3 is the cheapest of the three to revert.
>
> **F-10 is only shut for swipes.** Picking an option and then leaving via Prev
> or the dot grid still costs a point and still teaches the schedule nothing.
> That hole is exactly as open as it was this morning; the plan said it was
> acceptable to leave and not acceptable to forget, so here it is, not forgotten.

**Goal:** make the common move a gesture instead of an aimed tap.

**Correcting the drafted goal.** "180 taps, make it one gesture" oversells it. With
instant feedback on, a question is *pick → Check answer → Next*; the swipe replaces
the third of those, so three taps become one tap and two swipes. The count barely
moves. What moves is precision: **Next** is a small target at the bottom of the
screen that you aim at sixty times with one thumb, and a swipe lands anywhere. That
is the win, and it is enough of one. Do not expect a drill to get shorter.

**Changes**

1. `touchstart` / `touchend` on `#view-quiz`. Horizontal delta > 60px **and** > 2×
   the vertical delta → forward / back. Left is forward.
2. **Ignore gestures starting within 24px of either screen edge.** In a browser tab
   that region is iOS Safari's back/forward swipe; hijacking it is worse than not
   having the feature. In standalone PWA mode there is no such gesture, so this costs
   nothing where it matters most.
3. **A forward swipe does whatever `#mainBtn` says**, and its three states are the
   whole rule:

   | State of the current item | Forward swipe does |
   | --- | --- |
   | Nothing picked | Moves on. Skipping an untouched question is legitimate; the dot grid brings you back. |
   | Picked, not checked | **Reveals the answer** (`checkQ()`). It does not move. A second swipe moves on. |
   | Checked | Moves on. |

   In one sentence: **a swipe never throws away an answer you gave.** The main button
   already changes identity in place — *Check answer*, then *Next →* — so a gesture
   inheriting that identity costs no new mental model. The swipe is a big invisible
   main button.

   This is a guard, not a nicety. F-10: an item picked but never checked is scored
   wrong and never reaches `recordAnswer()`, so it costs a point and teaches the
   schedule nothing. That hole exists today via Prev and the dot grid, but both are
   deliberate aimed taps. A swipe is cheap and mistap-prone, and would turn a rare
   accident into a routine one.

4. **Never let a swipe leave the screen looking jammed.** `checkQ()` toasts *"Pick an
   answer first"* and returns — inherit that literally and an untouched question
   would answer a swipe with a toast and no movement, which reads as broken. Hence
   the first row of the table: nothing picked, swipe moves. A gesture that silently
   does nothing is worse than a button that does nothing, because there is no target
   to blame.
5. In exam mode (`!sess.instant`) there is no check step — the button is *Next →*
   throughout, so forward swipe is plainly forward and none of the above applies.
6. Back swipe is `prevQ()` unconditionally, matching the Prev button. No advancing
   past the last question; the last question's forward swipe does **not** call
   `finishQuiz()` — finishing stays an aimed tap on a button that names the score.

**Explicitly not doing: auto-check on selecting an option.** It would save 60 taps a
drill and cost the integrity of the Leitner schedule the entire app is built on — one
fat-fingered tap becomes a permanent wrong answer and a rescheduled card. Not a trade
worth making three weeks out.

**GO criteria**

- Swipe moves questions on the phone; vertical scrolling inside a long explanation
  still works; a tap on an option never registers as a swipe; an edge swipe in a
  browser tab still does browser-back.
- Pick an option, swipe forward → the answer is **revealed**, the question does not
  change. Swipe again → next question.
- Swipe forward on an untouched question → it moves. No toast, no stuck screen.
- Do a 24-question test entirely by swiping, then check `S.sr` → every question you
  answered has been recorded. Nothing scored wrong that you actually answered.
- Swipe forward on the last question → nothing happens. Finishing is still a tap.

---

### Phase 4 — The sticky header

> **Status: built 2026-08-13, not yet GO.** Two of the three listed options, not
> the third: the tab typography and padding shrank (~8px off both rows), and the
> header now leaves on scroll-down and returns on scroll-up — `transform`, so
> layout never moves and `toQuestionTop()` still measures the header it always
> did. **Dropping the brand to an icon was not done**: the arithmetic at 393pt
> only fits if the ▶ Resume chip is absent, and it is present exactly when you
> are most likely to be on a question. A layout that fits until you need it is
> not a fit.
>
> The scroll handler is `passive`, rAF-throttled, ignores movements under 6px so
> a resting thumb cannot flap it, and never hides inside the first 140px.

**Goal:** ~110px of header is pinned at every scroll position, on a screen where the
2026-08-13 work fought for 80px.

`.hd` wraps to two rows on a 393pt screen: brand and icon buttons on the first, the
four nav tabs on the second ([life-in-uk-mock-tests.html:42](life-in-uk-mock-tests.html#L42),
[:290-307](life-in-uk-mock-tests.html#L290-L307)). Options, cheapest first: shrink the
tab typography and padding; drop the brand to an icon on narrow screens; or collapse
the header on scroll-down and restore it on scroll-up.

Lowest priority, and genuinely optional. Listed so it is not rediscovered as a new
idea in three weeks.

---

### Phase 5 — Dead paint

> **Status: done 2026-08-13.** One line, gone. No GO criteria; if the explanation
> still appears when you check an answer, it worked.

Delete the first `paintCheck()` call in `checkQ()` (F-9). One line, no behaviour
change. Do it while the file is already open; do not make a session of it.

---

## 5. Risks

| Risk | Notes |
| --- | --- |
| **Scope creep against 23 days** | The sprint plan says it plainly: every hour building is an hour not drilling. Phase 1 earns its hour by stopping the app from corrupting its own pass-probability data. Phases 2–5 are comfort. If the week gets tight, ship Phase 1 and stop. |
| Persisted session desyncs from the bank | Only if question ids move. INV-2 already forbids that, and INV-12 makes the failure mode loud rather than silent. |
| Resume becomes a way to game a timed mock | Exactly what D-1 is about. Absolute deadline, no pause. If the answer to D-1 changes, say so in the plan before implementing — do not decide it in code. |
| The resume list becomes a graveyard | D-2 creates freely, D-3 never expires, INV-13 forbids eviction. The 3-row cap with an expander keeps it off the dashboard's face, but nothing stops fifteen abandoned drills accumulating. That is a prompt to discard them, not a bug — but if the list is still growing after a week, revisit D-3 rather than adding a cap in code. |
| Parallel timed tests | D-2 permits two timed tests running at once, both burning wall clock, both able to expire unattended. Nothing breaks — INV-9 means neither records without a tap — but it is a way to lose two mocks instead of one. Worth noticing on device before deciding it needs a guard. |
| Timed tests will suddenly feel shorter | They will, because F-5 was quietly making them longer. Expect the first post-fix mock to score worse and do not read it as a regression. Say this out loud to each other. |
| F-10 rides on a phase that may get dropped | The picked-but-unchecked hole is live today, and the fix for it is written into Phase 3 because that is where it becomes easy to hit. Drop Phase 3 and the hole stays — small, rare, and only reachable by aiming at Prev or the dot grid mid-answer. Acceptable to leave; not acceptable to forget, which is what this row is for. |
| Two new touch behaviours at once | **This one happened.** The advice was to ship Phase 1 alone and decide on Phase 3 after a day; instead the sticky action bar, the swipe and the folded navigator all reach the phone together, none of them proven. Nothing is broken by it — it just means a bad feeling on the question screen has three suspects instead of one. Phase 3 is the cheapest to revert, Phase 2 the next. |
| localStorage write volume | One extra ~5 KB write per answer alongside the existing full-`S` write. Measured as noise, but if a 200-question drill ever feels sticky on the phone, debounce the session write — not the `S` write. |
| Verification is manual | No headless browser in this project. Every GO criterion above is a thing to do on the phone; budget for that rather than assuming a test run covers it. |

---

## 6. Suggested execution order

1. ~~Resolve D-1 through D-4.~~ **Done 2026-08-13** — see §3. D-2 came back as
   *several*, which is why §3.1 exists.
2. ~~Phase 1, in one session~~ **Built 2026-08-13** — see the status note in Phase 1.
3. ~~Phase 5, then Phase 2, then Phase 3, then Phase 4~~ **All built 2026-08-13**,
   in that order, in one sitting. `sw.js` VERSION is `2026-08-13c`.
4. **The whole GO list — Phases 1, 2, 3 and 4 — run on both phones. Still to do,
   and it is now the only thing standing between this and done.**

**The order this was meant to go in did not survive.** The plan said ship Phase 1,
use it for a day, then decide on Phase 3; it said Phase 4 was probably never. Both
were overtaken by a single instruction to build the rest, which is a legitimate
call — but it means the device pass is now carrying four phases' worth of unproven
change on one screen instead of one. Run the GO lists in phase order and stop at
the first thing that feels wrong, rather than reading the screen as a whole and
trying to work out which of four changes caused it.

**What has been checked without a device (2026-08-13).** `tools/test-backup.mjs`
(348 checks) and `tools/validate-banks.mjs` pass. A second throwaway node harness
behind a stub DOM — no browser — ran 35 assertions over the real engine: the
collapse default at 24 and at 60, the toggle's round trip through `prefs`, the
strip and the grid agreeing per question, the strip staying fresh on `pick` and on
a flag, all three forward-swipe states, a full 24-question test done by swipe alone
reaching `recordAnswer()` 24 times with nothing picked-but-unchecked left behind,
the last-question no-op, exam mode's plain forward swipe, and Phase 1's persistence
still intact through the new render path. **None of that says anything about how it
feels under a thumb.**
