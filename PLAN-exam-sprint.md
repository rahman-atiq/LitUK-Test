# Exam Sprint — Implementation Plan

Turn the study hub from a long-term retention tool into a 25-day exam machine, and
make "mastered" mean mastered.

> **Exam: Saturday 5 September 2026.** Two candidates, two devices, separate
> `localStorage`. Drafted 2026-08-11. Every figure below was measured against the
> working tree on that date, not estimated.
>
> Execution model: **one phase per session.** Each phase below is self-contained —
> it states the current behaviour, the file and function to change, and its own GO
> criteria. A fresh session should be able to execute any single phase from this
> document alone.

## The problem in one line

`drillPlan()` gives **4 of its 20 slots to unseen questions**. At that rate you will
see **100 of 1,858 questions** before exam day — 5% of the bank — while the other 16
slots recycle material you already know. The confidence this produces is not real.

---

## 1. Verified findings

Measured 2026-08-11 via `tools/lib/banks.mjs`.

| Metric | Value |
| --- | --- |
| Question ids | 1,890 |
| Truly unique questions (stem + option set) | **1,858** |
| Exact duplicates (redundant ids) | 32, of which 4 cross-bank |
| 4-option questions | 1,378 |
| Literal TRUE/FALSE | 354 |
| "Which statement is correct?" discrimination pairs | **157** |
| 3-option | 1 |
| Multi-answer (select 2+) | 216 |
| Questions containing a year | 483 |
| Distinct years referenced | 253 |
| Questions missing an explanation | 1 |
| Days to exam from 2026-08-11 | 25 |

### The duplicate count, corrected

An earlier pass reported 212 duplicates by matching on question stem alone. **That
was wrong and the correction is load-bearing.** 141 questions share the stem
*"Which of these statements is correct?"* — they are not duplicates, they are the
discrimination questions, two near-identical statements differing by one word:

- "Life peers are appointed by the **Prime Minister** on the advice of the **monarchy**"
- "Life peers are appointed by the **monarchy** on the advice of the **Prime Minister**"

Deduplicating on stem would have collapsed 140 distinct questions into one and
deleted the single best twist-training resource in the bank.

**Dedup key is `stem + normalised option set`, never stem alone.** On that key there
are 32 redundant ids — the same 1,858 content-level count that
[PLAN-practice-tests.md](PLAN-practice-tests.md) already recorded. This is a known,
documented, and *small* problem. Phase 1 handles it in a footnote, not a subsystem.

### The finding that shapes Phase 3

**511 questions (27% of the bank) have two options** — 354 true/false and 157
discrimination pairs. *(511 of the 1,890 **ids**; two of them are duplicates, so
it is **509** unique questions. `tools/validate-banks.mjs` now prints the number
on every run.)* Two consequences:

1. A 50% guess rate, currently promoted through the spaced-repetition boxes exactly
   like a 4-option question. A meaningful share of "mastered" two-option cards are
   coin flips that landed right.
2. Those same 511 questions are *precisely* the twisted format the exam uses. They
   already exist. Phase 3 does not need to generate twisted questions — it needs to
   stop burying them in the general pool.

---

## 2. Hard constraints

The invariants from [PLAN-practice-tests.md](PLAN-practice-tests.md) §2 all still
hold — `lituk_v1` / `lituk_prefs` key names, id ranges, test numbers, additive state
changes, fixed origin. This plan adds three.

| ID | Invariant |
| --- | --- |
| INV-6 | Dedup and clustering key on **stem + option set**. Stem alone is forbidden — it merges the 157 discrimination pairs. |
| INV-7 | No phase generates new question content. Auto-derived questions risk teaching a wrong fact, which is worse than no question. Re-ordering, re-weighting and re-surfacing existing content is in scope; synthesis is not. |
| INV-8 | No SR due date may fall after **2026-09-03**. A review scheduled past the exam is a review that never happens. |

### Prerequisite — do this before Phase 1

**Export progress on both phones.** Settings → ⬇ Export backup, save both files
off-device. Every phase from here rewrites scheduling state; the export/import path
shipped in the previous plan is the only way back.

The phone restore test is still outstanding from
[PLAN-practice-tests.md](PLAN-practice-tests.md). Do it now, on one device: export,
clear site data in a private tab, import, confirm the numbers return. *An untested
backup is not a backup* — and this is the week it stops being theoretical.

---

## 3. Phases

### Phase 1 — Coverage first

**Goal:** go from 5% bank coverage to 100%, with room for a second pass.

**Current behaviour** — `drillPlan()`, [life-in-uk-mock-tests.html:433](life-in-uk-mock-tests.html#L433):

```js
srDue(now).slice(0,12).forEach(g=>add(+g,'due'));          // up to 12 of 20
Object.entries(S.mistakes).filter(([,m])=>!m.done)
  .sort(...).forEach(([g])=>{if(picked.length<16)add(+g,'mistake')});   // up to 4 more
for(const tp of weakestTopics()){ ... }                     // new fills 16→20
```

`DRILL_N=20` is a module constant at line 432.

**Changes**

1. **Configurable session size.** `DRILL_N` becomes `prefs.dailyTarget`, default
   **60**. Add a control to the settings modal (`openSettings()`, line 842).
2. **Explicit, phase-aware mix.** Replace the hardcoded 12/16 cutoffs with a ratio
   table, and let unfilled categories overflow into `new`:

   ```js
   const MIX = { coverage: {due:.20, mistake:.20, new:.60},
                 consolidate: {due:.35, mistake:.35, new:.30},
                 final: {due:.50, mistake:.50, new:.00} };
   ```

   Mode is chosen by date (see Phase 2's exam-date field), defaulting to `coverage`.
3. **Sweep mode** — `startSweep(n)`: pure unseen questions, batch of `n` (default 50),
   untimed, instant feedback. Dashboard action card next to "Random exam". This is
   where the first two weeks are actually spent.
4. **Coverage is a first-class number.** `Object.keys(S.sr).length` against 1,858.
   Add a stat tile to the dashboard (`renderDashboard()`, line 368) and the hub
   (`index.html`, the `stats` block at line 381), plus a "never seen" count.
5. **Collapse the 32 duplicate ids.** Build a canonical map at load —
   `stem+options → lowest g` — and route `srUpdate` / `recordAnswer` / `S.flags`
   through it, so answering one member updates the group. Question ids themselves do
   not change (INV-2). Existing state for the redundant ids is merged on first load,
   taking the *worse* of the two records — a mistake anywhere is a mistake.
6. **Timed test scores say how they were earned.** ~~Force `instant:false` when
   `timed`.~~ **Reversed on 2026-08-11, by decision, after it shipped.** The
   feedback pref governs every session including timed tests — when you see the
   answer is the candidate's call, not the app's. The original concern stands
   though: a `best` earned with the explanations on screen was going into "tests
   passed" indistinguishable from one earned blind. So instead of forbidding it,
   record it — `S.tests[n].revealed` is set from `sess.instant` whenever a sit
   becomes the new best, and the tile appends "· answers shown". No migration:
   bests predating this change carry no flag and are simply unlabelled.

**GO criteria** — a 60-question drill on a fresh profile returns ≥ 33 unseen
questions; Sweep mode never repeats a question until the unseen pool is empty;
coverage tile matches `Object.keys(S.sr).length`; a test sat with feedback on is
labelled "answers shown"; `node tools/validate-banks.mjs` passes.

**This is the revert point for everything that follows.**

---

### Phase 2 — Make "mastered" mean mastered

**Goal:** stop the app retiring questions you got lucky on.

**Current behaviour** — `recordAnswer()`, [life-in-uk-mock-tests.html:591](life-in-uk-mock-tests.html#L591):

```js
if(m&&!m.done){m.streak=(m.streak||0)+1;if(m.streak>=2){m.done=true}}
```

No time gate anywhere. Wrong answers reschedule to `now + 10 minutes`
(`srUpdate`, line 578), so a question missed at 09:00 can be answered correctly at
09:10 and 09:20 and be marked mastered inside a single sitting.

**Changes**

1. **Day-keyed retirement.** Replace `m.streak` with `m.ok` — an array of distinct
   `dayKey()` strings. Retire when:
   - 4-option question: **3 distinct days**, none of them the day it was last missed.
   - Two-option question (509 of them): **4 distinct days**. Priced for the 50% guess
     rate.

   Migration: existing `m.streak >= 2 && m.done` stays retired — do not reopen
   hundreds of questions three weeks out and destroy morale. Open mistakes start with
   `ok: []`.
2. **Leeches.** `m.count >= 4` sets `m.leech = true`. A leech never auto-retires; it
   is pinned to the top of the Mistakes view, always eligible for the drill, and
   carries a "read the chapter" deep link (Phase 3, change 4). Clearing one requires
   an explicit tap.
3. **"Wasn't sure".** A second button on the explanation panel (`paintCheck()`, line
   553) beside the verdict. Marking a correct answer unsure: no SR box promotion
   (`e.box` unchanged, `due = now + 1 day`), no credit toward `m.ok`, and increments
   `S.sr[g].unsure`. Costs one tap and buys an honest model of what you know.

   **Extended on request, 2026-08-12:** it also opens a record in `S.mistakes`, so a
   guessed question is reviewable and practisable rather than only rescheduled. It
   is a *distinct kind* of entry — `m.unsure` counts guesses, `m.count` stays the
   count of real misses, and a record with `count: 0` is a question you have never
   actually got wrong. The Mistakes view splits into three sections (🐛 Leeches ·
   Got wrong · 🤔 Wasn't sure) and the guess-only rows carry a grey 🤔 badge, not
   the red miss count. Clearing is the ordinary rule — right on 3 separate days
   (4 for two-option), confidently. `m.miss` is stamped on a guess for the same
   reason it is on a miss: a confident answer ten minutes after admitting you were
   guessing is not a separate day. Guessing a question that had already cleared
   re-opens it.
4. **Exam date and interval clamping.** Add `S.examDate = '2026-09-05'` (settings
   field, default this date). Then:
   - `SR_DAYS = [0,1,3,7,16,35]` (line 576) is recomputed against days remaining, so
     the ladder always fits inside the window.
   - Every `due` is clamped to `min(due, examDate − 2 days)` — INV-8.
   - Dashboard shows a countdown, and drill mode switches `coverage → consolidate`
     at 14 days out and `consolidate → final` at 6 days out.

   Today's `SR_DAYS` schedules a box-5 question 35 days out. That is 10 days after
   the exam. Every question you know well is currently being filed away where you
   will never see it again.

**GO criteria** — a question missed and then answered correctly twice in one session
is still open; a two-option question needs four separate days; no `S.sr[g].due`
exceeds 2026-09-03; "wasn't sure" leaves the box unchanged; existing retired
mistakes stay retired across the migration.

**Shipped 2026-08-12.** All four changes, all GO criteria verified against the real
engine (loaded into a node VM with a stub DOM — 39 assertions, no browser). Notes
on what the code does that the plan above did not spell out:

- **`m.miss`** — the retirement rule needs "not the day it was last missed", so a
  miss now stamps the record with its `dayKey()`. A correct answer on that same
  day is worth nothing, which is the whole point: answering right ten minutes
  after reading the explanation is recall of the last ten minutes.
- **"Wasn't sure" is an undo, not a flag.** The button only exists once the answer
  is checked, and by then `recordAnswer()` has already promoted the box. So it
  returns what it did — `{preBox, credited, retired}` — and `markUnsure()` hands
  all three back: box restored, due set to tomorrow, the banked day removed, and a
  retirement earned by that answer reversed. It is offered on correct answers only;
  on a wrong one there is nothing to take back. It then opens the mistakes-list
  entry described in change 3 above.
- **The drill's mistake queue sorts on misses + guesses**, behind leeches. A
  question guessed three times has caused as much trouble as one missed three
  times, and it is the same fix.
- **`srDays()` scales the whole ladder**, rather than truncating it: with 22 days of
  window `[0,1,3,7,16,35]` becomes `[0,1,2,4,10,22]`, and in a very short window it
  rises one day at a time and then saturates. `clampDue()` is the backstop under
  everything, including the 10-minute wrong-answer reschedule, so INV-8 holds even
  if a future change forgets the ladder.
- **The leech's "read the chapter" deep link is not built** — it needs the
  question → chapter mapping from Phase 3 change 4. Everything else about leeches
  is in: set at 4 misses, never auto-retires, pinned above the ordinary mistakes in
  both the Mistakes view and the drill queue, cleared only by tapping "I know this
  now" (which clears the leech flag too, so it can only return after 4 more misses).
- **The validator now guards the pricing** — `RETIRE_2 > RETIRE_4`, `LEECH_AT >=
  RETIRE_4`, and `clampDue()` still present. A future edit that makes a coin-flip
  question cheaper to retire than a four-option one now fails the build.

---

### Phase 3 — Twist-proofing

**Goal:** make the exam's twisted phrasing feel like Tuesday. This is the phase that
decides the result.

The insight from §1: the bank already contains 509 purpose-built twist questions.
They are simply diluted across 1,858 and shuffled, so they arrive one at a time,
where recognition memory carries you. Served in clusters, they cannot be.

**Changes**

1. **Twist Gauntlet** — a drill mode over the 509 two-option questions (157
   discrimination + 354 true/false), served **in clusters of related content**, not
   shuffled globally. Answering "peers appointed by the monarchy on the advice of the
   PM" is easy in isolation and genuinely hard immediately after three other
   constitutional-appointment statements. Dashboard action card.
2. **Discrimination clusters for 4-option questions.** Cluster on shared salient
   entity — year, proper noun, Act name — and serve cluster members adjacently.
   Cheap first cut: the 253 distinct years, weighted by contest (1066 appears in 21
   questions, 2012 in 32, 1969 in 20, 1928 in 18). Build the cluster map at load from
   `q.t + q.o + q.e`; no data file changes.
3. **Date Gauntlet.** 483 questions carry a year. Drill the association in both
   directions using only existing content: *given the year, which event* (options
   drawn from other years' events in the same topic) and *given the event, which
   year* (options drawn from near-miss years already present in the bank). INV-7
   holds — every option is real content lifted from an existing question, never
   synthesised.
4. **Wrong answer → the chapter that explains it.** Record which option was picked:
   `S.mistakes[g].picked = { [optionIndex]: count }`. Surface it in the Mistakes view
   ("you have chosen *1801* three times") and add a "read why" link that deep-links
   into the chapter pages via the existing `?find=` machinery
   ([app.js:123](app.js#L123)) and `search-index.js`. The index already covers every
   chapter block; nothing needs rebuilding.
5. **Fact cards.** Median explanation is 177 characters — dense enough to mine a
   one-line atomic fact per question. Derive and store these at build time in a new
   `tools/build-facts.mjs` → `facts.js`. Used by the cram sheet (Phase 4) and the
   mistake view. **Display only.** Per INV-7 these never become auto-generated
   questions; a mined fact that is subtly wrong is a fact you would then drill.

**GO criteria** — Twist Gauntlet serves all 509 with related items adjacent; Date
Gauntlet generates no option that is not lifted verbatim from existing bank content;
distractor counts persist and render; "read why" lands on the right chapter section
with the term highlighted.

**Shipped 2026-08-12.** All five changes. 41 assertions against the real engine in a
node VM with a stub DOM, no browser; `node tools/validate-banks.mjs` passes. Measured
numbers and the decisions the plan above did not settle:

- **Clustering is one mechanism, used by five modes.** `clusterOrder()` reorders any
  list so questions sharing a salient entity are adjacent, and it is what change 1 and
  change 2 both are. Two passes over keys drawn from `q.t + q.o + q.e`: years and
  proper-noun runs first, then rare lowercase words for what that leaves behind,
  rarest key first throughout. It puts **466 of the 509** two-option questions and
  **93% of the whole bank** into a cluster of 2–5. Measured adjacency: **268 of 508**
  neighbouring pairs in a Twist run share a key, against **30** for a plain shuffle.
  Cost is 34ms cold, once, and it is lazy.
  - A single-word capital is only a proper noun if that word is never seen lowercase
    anywhere in the 1,858 — otherwise "However" and "Almost" cluster the bank.
  - The drill and Sweep now cluster instead of shuffling. Sweep clusters the whole
    unseen pool *then* cuts the batch, so cluster-mates arrive in the same session
    rather than a fortnight apart.
- **The Date Gauntlet is built on 62 questions, not 483.** Only 62 questions in the
  bank are answered by a bare year, and those are the only place a year is asserted
  rather than mentioned — 483 "carry a year" but mostly in passing, where nothing
  verifies what the year attaches to. INV-7 makes that the whole design: forward is
  the original stem verbatim with the three nearest years in the bank swapped in as
  distractors; reverse is a year against four verbatim question stems. 124 derived
  items, every option a character-for-character lift, checked in the harness against
  the set of all bank strings. One direction per source question per session, or the
  forward item hands you the reverse one's answer. Sessions longer than 62 pad with
  real year-carrying questions, clustered — which groups them by date, since a year
  is a cluster key.
- **Gauntlets and Sweep no longer count as exam attempts** (`TRAINING`), because a
  60-question pile-up of coin flips is not a sit and scoring it as one buries the pass
  rate Phase 4 is about to build on. They still keep the daily streak.
- **`m.picked` keys on the canonical question's option order.** A duplicate id can
  list the same options in a different order, so an index copied straight across would
  name the wrong distractor; the option is matched by normalised text instead. Derived
  Date Gauntlet items record no index at all — their options are built for the session.
- **`facts.js` stores offsets, not sentences.** `cut` is a `[start,length]` slice into
  the question's own explanation, so a fact card is *provably* a substring of text a
  human wrote, and the file is 77KB instead of ~400KB. 1,844 fact cards (median 97
  chars), 1,854 chapter links. It is loaded on demand by the Mistakes view and
  everything degrades to nothing if it is absent.
- **The chapter link needed a prior and a text-node check.** Term overlap alone sent
  drink-driving to a sentence about arrests in the Civil War; the five topics *are*
  the five chapters, so `q.p` picks the chapter and **1,825 of 1,854** links land in
  it. And `?find=` only highlights if the term sits inside one text node — "the Battle
  of Hastings" is three, because the page sets the name in `<b>` — so the builder
  verifies each term against the real page the way `app.js` will read it. 32 links
  that would have silently failed to highlight now use a term that works.
- **Not built:** nothing from this phase. The leech "read the chapter" deep link left
  over from Phase 2 is now in, via change 4.

---

### Phase 4 — Readiness, and the last week

**Goal:** an honest answer to "are we ready?", and a plan for the final five days.

**Changes**

1. **Rolling accuracy replaces lifetime accuracy.** `acc = S.correct/S.answered`
   ([index.html:368](index.html#L368) and `renderDashboard()` line 369) never forgets
   your first week. Keep a 200-entry ring buffer of 0/1 in `S.recent` and report that
   instead. Show lifetime as a small secondary figure.
2. **Pass probability.** Monte Carlo, 1,000 draws of 24 questions sampled from the
   bank, each question's success probability estimated from its SR box, `unsure`
   count and mistake history — **floored at the guess rate** (50% for two-option, 25%
   for four-option), so an unseen question contributes its true coin-flip value
   rather than a zero. Report the share of draws clearing 18/24. This replaces
   "tests passed" as the headline number on both the dashboard and the hub.
3. **Final-week mode.** From 30 Aug (6 days out) the drill switches to `final`:
   everything ever missed, plus everything not seen in 10 days, no new questions.
   Auto-triggered by `S.examDate`, no user action.
4. **Cram sheet.** One screen, print-friendly, generated from `S.mistakes` +
   `facts.js`: every leech, every open mistake, and the most-contested dates, grouped
   by topic. This is the 4 September artifact.
5. **Weight the pass probability by how each score was earned.** Phase 1 records
   `S.tests[n].revealed`; a best set with the explanations on screen is weak
   evidence of readiness and change 2 above should discount it rather than treat it
   as a clean sit. *(Replaces the retired "drop the pre-fix `dirty` flag" item —
   Phase 1 change 6 was reversed, see there.)*

**GO criteria** — pass probability is stable across reloads and moves in the right
direction after a good session; final-week mode activates on 30 Aug without
intervention; cram sheet prints to one or two sides of A4.

**Shipped 2026-08-12.** All five changes. 64 assertions against the real engine in a
node VM with a stub DOM, no browser; `node tools/validate-banks.mjs` passes. What the
code decided that the plan above left open:

- **The pass probability is seeded.** 1,000 draws carry a sampling error of about
  ±1.5 points, so an unseeded Monte Carlo would move the headline two points on a
  reload — and a number that wobbles when you have done nothing is a number nobody
  believes. A fixed-seed xorshift makes it a pure function of your saved progress,
  and the result is cached against a state-revision counter that every `save()`
  bumps. **3ms** to recompute over all 1,858; the whole dashboard renders in 1.1ms
  with the cache warm.
- **The guess floor is per question, not per format.** 1/nCk, so a "select 2 of 4"
  floors at one in six rather than 25% — it is the hardest thing in the bank to fall
  into by accident, and pricing it as a four-option question would have quietly
  inflated every draw containing one of the 216.
- **Calibration is measured on the questions the sat tests actually contain.**
  Comparing a test score against a bank that is 80% unseen compares nothing, so for
  each test with a best score the model's own prediction over *those 24* is what the
  score is weighed against. `revealed` bests count for 0.35 of a blind one (change 5),
  the whole correction is shrunk towards 1 by a prior worth three clean sits, and it
  is clamped to ±25%. It nudges; it cannot take over. With no sits at all it is
  exactly 1 and the model stands on its own.
- **"Wasn't sure" does not take the tick back from rolling accuracy.** Accuracy is the
  outcome — a guess that lands right would have landed right on the day. What it does
  not know is *why*, and that is what `unsure` is for in `pKnow()`, where it costs 12%
  a time. Two numbers, two jobs, and neither lying on the other's behalf.
- **The hub reads the number rather than computing it.** `index.html` deliberately
  carries no bank data (modelling there would mean loading 750KB to draw one tile), so
  the engine leaves its answer in `S.readiness` and the hub renders that, with a line
  saying how old it is once it is three days stale. Tests passed is demoted from tile
  to footnote on both pages.
- **The final week splits what is left between the two new buckets.** First cut let
  "everything ever missed" take every remaining slot and "not seen in 10 days" never
  appeared at all — caught by the harness, not by reading it. Now the remainder is cut
  in half, and either mops up what the other cannot fill. `final` mode itself dates
  from Phase 2's `drillMode()`; what Phase 4 added is what it *serves*: retired
  mistakes reopened, and any card whose `last` is older than `STALE_DAYS` regardless of
  the box it climbed to.
- **The cram sheet is capped at 60 mistakes and 24 dates, measured.** A real
  mid-sprint profile (220 open mistakes) typesets to **1.74 sides of A4** at 8.6pt in
  two columns; the uncapped version ran to nine pages, which is read as none. A
  "which of these statements is correct?" question prints its answer alone, because
  there the answer *is* the fact and the stem says nothing.
- **The results screen shows what the session moved** — "▲ pass 63% (+2)". A sweep of
  50 unseen questions moves it whatever you score, because coverage is itself worth
  something, and that is the argument for doing them on the days it does not feel
  like progress.
- **Not built:** nothing from this phase.

---

### Phase 5 — Bank verification *(parallel, no app code)*

**Goal:** stop a wrong third-party answer teaching a wrong fact.

Both banks are third-party scrapes. They are not authoritative and they contain
errors. The official handbook content already sits in the repo as the chapter pages,
and `search-index.js` already indexes every block of it.

Build `tools/verify-bank.mjs`: for each question, locate the explanation's key
assertion in the chapter index and flag any question whose stated answer is not
supported, or is contradicted. Output a review list, worst-confidence first. This is
a *triage tool for a human*, not an auto-corrector — it produces a list you read, not
edits it applies.

Touches no app code and no saved state, so it can run in any session, in any order,
including alongside another phase.

**GO criteria** — the report runs clean over all 1,858 and its top 20 flags are
worth a human's time.

**Shipped 2026-08-12, at GO.** `tools/verify-bank.mjs` runs over all 1,858
against 1,999 chapter blocks and emits three signals, now **0 conflict · 9
chapters-disagree · 47 not-in-the-chapters**. The review the GO bar asks for was
done by hand against the chapter pages, and `tools/test-verify-bank.mjs` (43
checks) pins every ruling it produced.

- **Cross-bank conflict reports 0, and the zero is verified.** The rule is
  identical option set plus a near-identical stem, keyed differently. Every
  candidate pair down to stem-Jaccard 0.30 was read by hand and every one was
  innocent — two questions sharing a menu ("which TWO countries are in the
  Commonwealth?" over different lists) have different right answers and neither
  is wrong. Separately: the **32 duplicate pairs the engine collapses all agree**
  on their answer, so the CANON collapse is not silently choosing between two
  different keys. That was worth knowing and is now known.
- **The review said the thresholds were not the problem.** The plan expected
  tuning; reading the flags said the features were measuring the wrong thing.
  Of the top 20 "chapters disagree", **one** was real. Of the top 20 "not in the
  chapters", **none** were — and in several the passage printed underneath the
  flag contained the answer. No threshold fixes that.
- **What the four findings are, and why they are one finding.** Every survivor
  is the bank stating the world as it is now against chapters describing the
  handbook edition: Commonwealth **56 members vs 54** (q194, q748), small claims
  **£10,000 vs £5,000** (q170, q142, q22, q735), jury service **18–75 vs 18–70**
  (q112), and **Brexit in 2020**, which the chapters never mention at all (q7).
  The banks are more up to date than the handbook — and the exam is set from the
  handbook, so on these the *right* answer is the older one. Worth deciding
  deliberately rather than by whichever the drill happened to teach. The 2021
  census figures (q102, 6% Muslim against the chapters' 4%) are the same shape
  and surface in the other signal.
- **Signal 2 now tests the figure the question stakes itself on.** It read every
  number in answer *and* explanation, and 577 of the 768 questions carrying a
  number carry none in the answer — so it argued about Bobby Moore's dates in a
  question asking which sport he played. It now reads the answer only, plus a
  TRUE-keyed stem, and never a FALSE-keyed or NOT- stem, whose numbers are wrong
  on purpose. Four print-noise constructs are stripped first: lifespans in
  brackets (92 questions), metric conversions (1,865 km² also passes for a
  year), `see page N`, and clock times.
- **Corroboration is what killed the rest.** The locator matches on topical
  overlap, so "how many members does a jury have in Scotland?" landed on a
  paragraph about 129 MSPs and 60 AMs and the tool reported that the chapters
  say 129. They say 15 too, three pages away. A figure is now only contested if
  no block stating it is at least 0.6× as on-topic as the one being cited — a
  self-calibrating bar, and the list is identical from 0.6 down to 0.4.
- **Signal 1 was measuring verbosity.** Scoring a whole claim against one block
  penalises a wordy scrape and rewards a terse chapter: "countries join the
  Commonwealth voluntarily" scored 19% against a block reading *"Membership is
  voluntary"*. It now asks the only question it can honestly answer — do the
  chapters use these words anywhere — and needs **two** absent words, because an
  absent word scores at the maximum idf and one of them swamps a short claim.
- **The tokenizer stemmed nothing and that was half the noise.** It stripped a
  plural *s*. The banks and the chapters inflect differently — `recycling` vs
  `recycle`, `the right to vote` vs `voting age`, `voluntarily` vs `voluntary` —
  and every one of those read as a word the chapters never use. Crude suffix
  stripping plus trailing `e`/`y` normalisation fixed more flags than any
  threshold did.
- **What is left is a coverage report, and it is useful.** The surviving 47 are
  mostly questions you *cannot revise from the chapter pages*: banknotes,
  allotments, vets, the tobacco age, `EastEnders`, the PTA spelled out, John
  O'Groats to Land's End. Roughly three in twenty are the chapters saying the
  same thing in other words — the Commonwealth's "shared goals" phrasing is the
  repeat offender. Read it as a gap list, not an error list.
- **Dead end 1 — IDF cosine over answer-plus-explanation.** Near-duplicate
  questions share one long explanation and ask about different numbers inside
  it, so the discriminator is a single word — a saint's name, England vs
  Northern Ireland, "join" vs "leave" the EU — and cosine over the shared prose
  drowns it. Every one of the top 16 hits was a false positive.
- **Dead end 2 — the strict version of the same idea.** Requiring near-identical
  stems instead yields exactly one pair in the whole bank, also a false positive
  ("at what age did Victoria become queen" 18 vs "when" 1837). Cross-question
  numeric comparison does not work on this data. Do not rebuild it.
- **What ground truth means here.** The chapter pages are this repo's rendering
  of the handbook, not the handbook. "Unsupported" can only ever mean *this repo
  does not say it* — never *the handbook does not say it*. Any future
  auto-correction would launder the tool's own false positives into the bank,
  which is why it prints and never edits. The same caution applies to the four
  findings above: they are the chapters disagreeing with the banks, which is
  evidence about the handbook, not a ruling from it. Buying the official
  handbook (§5) is what would settle them.
- **The review is pinned, not remembered.** `tools/test-verify-bank.mjs` holds
  the 8 flags the reading kept and the 29 it ruled out, each tagged with its
  failure mode, and asserts all four findings survive. Every constant in this
  tool is a judgement over prose, and the temptation with a noisy triage tool is
  to turn a knob until the count looks tidy; turning one now has to keep 37
  hand-checked rulings on the right side of the line. The MUST-NOT ids were the
  literal top of the old report, so the file fails against the tool as it stood
  that morning.

---

### Backup and restore — the risk table's top item

**Code side cleared 2026-08-12.** `tools/test-backup.mjs`, 348 checks against
the real functions in a node VM with a stub DOM and a localStorage that survives
a simulated reload: round trip, wrong file refused, pre-Phase-4 backup migrated,
bare dump, restore over live progress, cancel is a no-op. Mutation-tested — an
export that drops `recent`, a shape check that accepts anything, a restore that
skips prefs, and a `migrate()` that stops being idempotent are all caught.

Refusals are tested through `importData()`, not `readBackup()`. `readBackup`
throws on malformed JSON by design and the caller's try/catch is what turns the
throw into a refusal; testing the inner function alone would still pass on the
day that try/catch is deleted.

**Device side still open, and it is the whole point.** This proves the code
restores, not that either phone's file does. Per device: export, move the file
off the phone, restore it in a different browser, check the dashboard reads what
it read on the phone. Until that has happened on both phones the sprint has no
insurance.

---

## 4. The study protocol

The app changes are worthless without the hours. 1,858 questions, 25 days.

| Days | Dates | Mode | Volume |
| --- | --- | --- | --- |
| 1–12 | 11–22 Aug | **Coverage.** Sweep mode, unseen only. | ~155/day each · ~40 min |
| 13–19 | 23–29 Aug | **Consolidation.** Mistakes, Twist Gauntlet, Date Gauntlet. Timed mock every other day, answers at end. | ~120/day · ~35 min |
| 20–24 | 30 Aug–3 Sep | **Final sweep.** Everything missed + anything unseen for 10 days. One timed mock daily, real conditions. | ~150/day · ~45 min |
| 25 | 4 Sep | Cram sheet, one mock, stop by 20:00. | — |

First pass alone is 75 questions/day — about 19 minutes. The table above budgets for
seeing everything once, re-drilling everything missed, and a full confidence pass.
**Complete coverage is not ambitious here. It is the baseline.**

Two people, two devices, two separate `localStorage` stores. Compare pass
probabilities out loud at the end of each week; the one who is behind gets the longer
evening.

---

## 5. More question sources

**Recommendation: do not add a third scraped bank.** You hold 1,858 questions and are
currently seeing 100 of them. Supply is not the constraint; throughput is, and Phase
1 fixes that. A new bank before Phase 1 makes the coverage problem arithmetically
worse.

Two additions that are worth it, both legitimate purchases:

- **Official TSO *Life in the UK Test: Practice Questions & Answers* (3rd ed.)**, ~£8.
  Same publisher as the official handbook, so it is the closest available proxy to
  the real bank. Worth it *specifically because* both current banks are third-party
  and may share the same lineage and the same errors — an independent source is a
  check on them, not just more volume.
- **The official handbook, *Life in the United Kingdom: A Guide for New Residents*
  (3rd ed.).** Ground truth. Everything on the real test comes from it, and Phase 5
  needs an authority to verify against. **Phase 5 has now made this concrete:** it
  found four places where the banks and the chapters disagree, all of them the
  banks being more current than the handbook, and nothing in this repo can rule on
  which the exam wants. £14 settles them.

If either is bought, folding it in is a new bank file under the existing
architecture — ids from 1890, test numbers from 201 — and a validator run. Half a
session. It should follow Phase 2, never precede Phase 1.

---

## 6. Risks

| Risk | Notes |
| --- | --- |
| Progress lost mid-sprint | Export both phones **before Phase 1**. The restore test is still unperformed. Highest-consequence risk in this plan. |
| Accuracy drops and morale follows | Guaranteed and correct — you are trading 85% on familiar questions for 65% on new ones. Phase 4's rolling accuracy makes the recovery visible. Say this out loud to each other on day 3. |
| Dedup merges the discrimination pairs | INV-6. The stem-only key destroys 140 questions. Any dedup code must assert the unique count lands on 1,858. |
| Retirement rules reopen hundreds of mistakes | Phase 2 migration keeps already-retired mistakes retired. Do not "recompute from history" — it is demoralising and the history is not trustworthy anyway. |
| Auto-generated questions teach wrong facts | INV-7. Mined facts are display-only. |
| Over-fitting to these 1,858 | The real test draws from an unpublished bank built on the handbook. Fact-level and discrimination-level mastery transfers; question-level memorisation is exactly what fails on a twist. This is the entire argument for Phase 3. |
| Phase 3 is the biggest build and sits third | If time runs short, Phase 3 change 1 (Twist Gauntlet) is 80% of the value for 20% of the work — it is a filter and a sort over data you already have. Ship that first within the phase. |
| Scope creep eating study time | Every hour spent building is an hour not spent drilling. Phases 1 and 2 are non-negotiable. Phases 3–5 are ranked; drop from the bottom without guilt. |
