# LifeInTheUKTestWeb Exams Source — Implementation Plan

Add lifeintheuktestweb.co.uk as a fourth question bank: **the 17 Exam tests only.**
The site's ~60 mock/practice tests are deliberately not imported.

> Canonical source of truth for execution. Drafted 2026-08-14. Every count below was
> measured against the live site and the working tree on that date, not estimated —
> all 17 pages were fetched and parsed during planning.
> Status: **Phases 0–2 executed 2026-08-14. Phases 3–5 not started.**

## Status

Phases 0–2 shipped exactly as measured in planning: 17 exam URLs discovered from
`/exams/` (1–17, no gaps), 408 slots, 0 parse problems, 406 unique questions
(ids 2792–3197), 0 answer conflicts against the existing banks. `node
tools/validate-banks.mjs` reports 4 banks · 150 tests · 3,600 slots · 3,198 ids ·
3,147 unique · **and fails on exactly the two checks Phase 3 exists to close**:
`facts.js` and `search-index.js` haven't been rebuilt yet, so they're missing
entries for the 390 net-new canonical questions. That is the expected, correct
state of a Phase-0–2-only checkout — not a bug to chase.

Phases 3 (rebuild `facts.js` / `search-index.js`), 4 (surface it — the
`bankSection` subtitle fix, `BANK_NOTE` attribution, the §6 wording calls) and 5
(the guard-breaking proof pass and the two eyes-on screen checks: the "Select 3"
badge and a phone backup/restore round-trip) are unstarted.

Revert point: 3 banks · 133 tests · 3,192 slots · 2,792 ids · 2,757 unique ·
263 exam questions.

---

## The finding that shapes the request

[PLAN-testprep-source.md](PLAN-testprep-source.md) opened by reporting that its source's
Exam tests were not a separate pool — 261 of 263 exam questions also sat in that site's
own mocks, so exam-ness had to ride on the question rather than on a bank boundary.

**This source is the opposite, and that is the useful finding.** Its 17 exam papers are
substantially disjoint from everything already in the app:

| | |
| --- | --- |
| Unique questions in the 17 exams | **406** |
| Already present in the three existing banks | **16** (10 testprep, 6 mock) |
| Net new unique questions | **390** |
| Answer conflicts where they overlap | **0** |

96% new. Dropping the mocks costs nothing here — there is no "the exams are a curated
slice of the mocks" relationship to preserve, because we are not importing the mocks and
the exams stand on their own. The request as stated is the right shape.

The machinery this needs was already built. Phase 4 of the testprep plan shipped `x:1`
on the question, `EXAM_SEEN` as a set of *canonical* ids, `examBadge()`, and the
`examq` drill. A bank whose every test is `kind:"exam"` drops into all of it with no
engine change — INV-9 sets `x:1` on all 406 by derivation, and the exam drill grows
from 263 cards to **663**.

### Decided (2026-08-14)

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Import the site's mock tests too? | **No.** Explicitly out of scope per the request. They are ~60 further pages for a bank that is already the app's fourth; revisit only if the exam import proves the parser. |
| 2 | One bank or fold into an existing one? | **New bank `lituktestweb`.** Different source, different attribution, its own id and test-number blocks. Nothing about it wants to merge. |
| 3 | Do these carry the exam flag? | **Yes — all 17 tests are `kind:"exam"`, so all 406 ids derive `x:1`.** This is what the flag is for, and it costs no new code. See §6 for the wording problem this creates. |
| 4 | The per-question audio narration | **Not imported.** 384 of 408 questions link an `.m4a` on a third-party host. Noted in §7 as future work, out of scope here. |
| 5 | The site's 1–5★ rating equivalent | **Does not exist here.** `r` is simply absent on this bank. It is already an optional field. |

---

## 1. Verified findings

Source: <https://lifeintheuktestweb.co.uk/exams/>.

`robots.txt` (fetched 2026-08-14) is `User-agent: * / Disallow: /wp-admin/` with
`Allow: /wp-admin/admin-ajax.php`. Nothing restricts the exam pages. It is WordPress,
but the quiz is **not** a plugin — no wpProQuiz, LearnDash, HD Quiz or Watu fingerprint
appears anywhere. Questions, options, explanations and the answer key are all
server-rendered into the page. There is no API to call and no JavaScript to execute.

| Metric | Value |
| --- | --- |
| Pages | 17 exam tests |
| Slots scraped | **408** (17 × 24) |
| Parsed without error | **408 / 408** |
| Unique under the engine's INV-6 key | **406** |
| Repeated within the source | 2 |
| Already in the existing banks | 16 |
| Net new unique questions | **390** |
| Answer conflicts against existing banks | **0** |
| Explanations present | 408 / 408 (mean 123 chars, longest 557) |
| Multi-answer questions | 34 — 33 two-correct, **1 three-correct** |
| Options per question | 2 (57 slots) or 4 (351 slots) |
| Image options | **none** — every option is text |
| Topic auto-mapped | **408 / 408, zero by hand** |
| Pass mark / per test / time limit | 18 · 24 · 45 min — identical to all three existing banks |

The two in-source repeats:

```
By law, which TWO types of media have to give a balanced coverage of all
  political parties and equal time to rival viewpoints before an election?
Wales has its own established church.
```

They get one shared id, exactly as repeats do in the other builders.

### The 17 URLs are irregular — derive them, never construct them

This is the first thing that will break a naive implementation. The exams are **not**
at `/exam-1/` … `/exam-17/`. Years of SEO churn left them at five different slug
patterns:

```
 1– 9  /british-citizenship-test-N/
10     /british-naturalization-test-10/
11     /audio-british-citizenship-test-11/
12     /british-citizenship-test-practice-questions-12/
13–15  /british-citizenship-test-N/
16     /life-in-the-uk-exam-16/
17     /exam-17/
```

The `/exams/` index page links all 17 with clean `Exam N` link text, and the fetcher
**must scrape that index to discover the set** rather than hard-coding a list that will
rot the next time the site renames a page. Assert exactly 17 are found and that their
numbers are 1–17 with no gaps; fail the fetch otherwise.

### Merged totals

| | Before | After |
| --- | --- | --- |
| Banks | 3 | **4** |
| Tests | 133 | **150** |
| Slots | 3,192 | **3,600** |
| Question ids | 2,792 | **3,198** |
| Unique after INV-6 collapse | 2,757 | **3,147** |
| Exam-flagged canonical questions | 263 | **663** |

Raw question payload is ~122 KB of JSON before ids and minification — comfortably the
smallest of the four banks.

---

## 2. Storage contract

Unchanged from [PLAN-practice-tests.md](PLAN-practice-tests.md) §2 and unchanged by the
testprep work. `lituk_v1`, shallow-merged; `S.tests[n]` keyed by test number,
`S.sr[g]` / `S.mistakes[g]` / `S.flags[g]` keyed by question id.

### Invariants

| ID | Invariant |
| --- | --- |
| INV-2 | New question ids start at **2792**. Ids 0–2791 are never renumbered. |
| INV-3 | New test numbers are **401–417**. 1–45, 101–139, 201–238 and 301–311 are untouched. |
| INV-4 | State changes are additive only. |
| INV-6 | The dedup key stays stem + sorted option set. |
| INV-9 | `x` is derived, never authored — `x:1` **iff** the question appears in at least one `kind:"exam"` test in the same bank. Here that is every question in the bank, but it is still derived in a second pass, not written during the first. |

The 400 block continues the self-documenting scheme: the block a test number falls in
tells you which source it came from without a lookup.

### The block registry has a bug that this bank will trip

`tools/validate-banks.mjs` line 56 currently reads:

```js
const BLOCKS = {
  testprep: { g: [1890, Infinity], n: [[201, 238], [301, 311]] },
};
```

`Infinity` was correct while testprep was the last bank. It is not any more — ids 2792+
belong to `lituktestweb` and would sit inside testprep's declared block, so INV-2 drift
in *either* bank would go unreported. **Close testprep's range to `[1890, 2791]` and give
the new bank `[2792, Infinity]`** in the same commit that registers it. Whoever adds a
fifth bank inherits the same one-line obligation.

---

## 3. Data shape

```js
(window.LITUK_BANKS = window.LITUK_BANKS || []).push({
  id: "lituktestweb",
  label: "Reported Exam Tests",
  source: "LifeInTheUKTestWeb.co.uk",
  sourceUrl: "https://lifeintheuktestweb.co.uk/exams/",
  passmark: 18,
  perTest: 24,
  tests: [
    {"n":401,"kind":"exam","name":"Reported Exam 1","q":[ … ]},
    …
    {"n":417,"kind":"exam","name":"Reported Exam 17","q":[ … ]},
  ],
});
```

Questions use the existing `{g,t,e,p,o}` plus `x:1` on every one. No `r` — this source
publishes no rating. Both extra fields are already optional, so `bankOk()` needs no
change and the three existing banks stay valid untouched.

Explanations are stored **plain text**. The source wraps key terms in `<strong>` (and
occasionally `<b>`); the engine renders explanations through `esc()`, so the tags must be
stripped at build time or they render as literal markup on screen. This is the same trap
the testprep parser hit, and the same fix.

---

## 4. Topic mapping — the site ships its own legend

This source is the easiest of the four to map, and it needs no ground-truth cross-import
and no hand assignment at all.

Every question button carries a leaf category id:

```html
<div class="question_button" data-id_question="p0" data-category="76">
```

and every page carries the full legend inline:

```js
var all_question_categories = JSON.parse('{"75":{"index":1,"name":"Chapter 1: The Values
and Principles of the UK","children":{"77":{…"1.1.Becoming a permanent resident"…}, …
```

23 distinct leaf categories are used across the 408 slots; all 23 resolve through the
legend to one of 5 parent chapters. **408 / 408 mapped, 0 unknown, 0 by hand.**

### The trap: this site's chapter numbering matches the *practice* bank, not testprep

The testprep plan's headline risk was that testprep.uk swaps chapters 1 and 2 relative to
lifeintheuktest.com. **This site swaps them back.** Its own legend states:

```
Chapter 1: The Values and Principles of the UK      -> topic 3
Chapter 2: What is the UK?                          -> topic 4
Chapter 3: A Long and Illustrious History           -> topic 1
Chapter 4: A Modern, Thriving Society               -> topic 0
Chapter 5: The UK Government, the Law and Your Role -> topic 2
```

which is `{1:3, 2:4, 3:1, 4:0, 5:2}` — identical to `CH2TOPIC` in
`tools/build-practice-data.mjs`, and **the opposite of `TP2TOPIC`** in
`tools/build-testprep-data.mjs`. `build-testprep-data.mjs` is the most recently written
builder and therefore the obvious one to copy from; copying its constant here would
silently mis-file the 18 chapter-1 and chapter-2 questions into each other's topic and
throw no error.

**So do not hardcode the table at all.** Derive it: strip `Chapter N: ` from each parent
`name` in the legend and match the remainder against `TOPICS` from `tools/lib/banks.mjs`,
case- and punctuation-insensitively. All five match exactly. Then assert all five
resolved and that the mapping is a bijection, and fail the build if not. That turns the
single most likely way to get this wrong into an impossibility rather than a comment.

Topic distribution of the 408 slots:

| Topic | Slots | Share |
| --- | --- | --- |
| 0 A modern, thriving society | 122 | 29.9% |
| 1 A long and illustrious history | 183 | 44.9% |
| 2 The UK government, the law and your role | 85 | 20.8% |
| 3 The Values and principles of the UK | 7 | 1.7% |
| 4 What is the UK? | 11 | 2.7% |

History-heavy compared with the existing banks (~42% → 45%) and lighter on government
(~27% → 21%). Not enough to want rebalancing, but it will nudge the weakest-topic
recommendation slightly toward history, which is worth knowing before someone reports it
as a bug.

---

## 5. Phases

### Phase 0 — Preserve the scrape *(inert)*

`tools/fetch-lituktestweb-exams.mjs`, modelled on `fetch-testprep-tests.mjs`: real
User-Agent, 1.2 s between requests, every page cached to
`tools/.cache/lituktestweb-exams/` (already covered by the `tools/.cache/` line in
`.gitignore`). Fetches `/exams/` first to discover the 17 URLs, then the 17 pages.
Exports `parse()` and `loadAll()`. Reuse the `ents` / `dec` / `txt` helpers from
`fetch-practice-tests.mjs` rather than writing a third copy.

**GO** — reports 17 exam URLs discovered, numbered 1–17 with no gaps, 17 pages × 24
questions, 0 parse problems.

### Phase 1 — Build the bank

`tools/build-lituktestweb-data.mjs` → `lituktestweb-data.js`.

1. Ids from 2792 in first-seen order (Exam 1 → 17); the 2 repeats share an id.
2. Tests 401–417, each with `kind:"exam"` and `name`.
3. `x:1` derived in a second pass over the assembled bank (INV-9).
4. Topic via §4's derived legend mapping, with the bijection assertion.
5. Strip `<strong>` / `<b>` from explanations.
6. Assert this bank's dedup key agrees with the validator's, as the testprep builder does.
7. Refuse to write on **any** problem.

**GO** — `17 tests · 408 slots · 406 ids 2792–3197 · 406 exam · 0 problems`.

### Phase 2 — Register the bank

- `tools/lib/banks.mjs` — add `"lituktestweb-data.js"` to `BANK_FILES`.
- `life-in-uk-mock-tests.html` — add the `<script src>` before the engine in the same
  ordered (non-`defer`) position as the other three; `UNIQUE_EXPECT` **2757 → 3147**.
- `index.html` — `TOTAL_TESTS` 133 → **150** (line 351), `TOTAL_QUESTIONS` 2792 →
  **3198** (line 352), `UNIQUE_QUESTIONS` 2757 → **3147** (line 357), the `133 tests` tag
  (line 248) and the meta description (line 10).
- `tools/validate-banks.mjs` — `UNIQUE_EXPECT` 2757 → 3147, **and the `BLOCKS` fix from
  §2**: testprep `g: [1890, 2791]`, new entry `lituktestweb: { g: [2792, Infinity], n: [[401, 417]] }`.
- `sw.js` — bump `VERSION`, add `./lituktestweb-data.js` to `EVERYTHING`.

**GO** — `node tools/validate-banks.mjs` passes with `4 bank(s)`; the dashboard renders
150 tiles; every pre-existing test stat is unchanged and all 17 new tests read "New".

### Phase 3 — Rebuild the generated files

Both are validator-enforced; skipping either fails the build.

1. `node tools/build-facts.mjs` — 390 new canonical questions is 12% of the new total,
   over the validator's 5% uncovered threshold, so **this fails the build if skipped.**
2. `node tools/build-search-index.mjs` — the Phase 5 check added by the testprep work
   asserts one index entry per question id with matching stem and topics, so a bank edit
   without a rebuild fails rather than quietly breaking the hub's search box. Expect
   roughly 880 KB → ~1.0 MB; confirm it is still injected lazily by `index.html`.

### Phase 4 — Surface it

Much less work than testprep's Phase 4, because that phase built the machinery.

1. **One section**, since every test declares the same kind. `bankSection()` currently
   drops the subtitle when `kinds.length < 2`, so a bank that is *entirely* exams loses
   the very line explaining what an exam test is. One-line fix at
   [life-in-uk-mock-tests.html:680](life-in-uk-mock-tests.html#L680):

   ```js
   const body=kinds.length<2
     ? testGroup(b,b.tests,b.label,KIND_SUB[kinds[0]]??null)
     : …
   ```

   For `mock` and `practice`, `kinds` is empty so `kinds[0]` is `undefined` and the
   subtitle stays `null` — behaviour for those two is exactly preserved.
2. **The badge and the drill need no code at all.** `EXAM_SEEN` reads `q.x===1` through
   `canon()` already, so all 406 join it and the `examq` drill goes 263 → 663 cards.
3. **Attribution** — a `BANK_NOTE` entry and the source added to the page footer list.
   See §6: this site's footer says something materially different from testprep's.

### Phase 5 — Verification

`tools/validate-banks.mjs` gains, with every existing check untouched:

- the `BLOCKS` closure from §2, proved by moving one testprep id to 2792 and watching
  INV-2 fire
- the legend bijection assertion from §4, proved by breaking one chapter name

House rule from the testprep work applies: **prove each new guard by breaking a copy of
the data one way at a time**, watch the intended message fire and exit 1, then restore.
A guard that has never failed is not known to work.

Two things need eyes on a real screen, and neither can be settled by the validator:

- **The three-answer question.** *"Which three territories form Great Britain?"* is
  4 options / Select 3. The testprep plan flagged one of these as an open item that was
  never verified on screen; this adds a second. The engine handles it in principle
  (`nCk`, `eqSet`, `pick()` and the Select N badge are all general) but the *"Select 3"*
  badge has still never been seen rendering. **Check this one in a live session.**
- Phone: export progress, snapshot `lituk_v1`, deploy, hard reload, compare. Old test
  bests, drill streak, open mistakes and SR due-count must match exactly.

---

## 6. Two honesty problems worth deciding before Phase 4

Neither blocks the import. Both are your call, and both are easier to settle now than
after 406 questions are live.

**The `EXAM_CLAIM` wording no longer fits.** It currently reads *"Reported by test-takers
as recently asked in real 2026 exams"* — testprep.uk's claim, mirrored deliberately. This
site's claim is *"Exam Questions reported by previous candidates"*, with no year attached.
Flagging 400 new questions with a 2026 claim their source never made overstates it.
Recommendation: soften `EXAM_CLAIM` to *"Reported by test-takers as recently asked in
real exams"*, which is true of both sources, and keep the per-bank specifics in
`BANK_NOTE`.

**There is no Open Government Licence claim to mirror here.** The testprep `BANK_NOTE`
mirrors that site's own OGL v3.0 statement. This site publishes no licence — its footer
says only `© Copyright 2026`, and it runs AdSense against the pages. The underlying facts
are Crown copyright handbook material, but the site asserts its own copyright over the
compilation, which is a different posture from the other three sources and a weaker
footing for redistributing 408 questions. I'd still build it — it is the same category of
scrape as the other three and the questions themselves are not that site's invention —
but you should know the distinction exists rather than discover it later, and the
`BANK_NOTE` should not invent an OGL claim the source never made.

---

## 7. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Chapter table copied from `TP2TOPIC` — chapters 1/2 are swapped the other way | **High, silent** | §4: derive from the legend and assert the bijection; never hardcode. 18 questions would be mis-filed with no error |
| Exam URLs hard-coded and rotting on the next site rename | **High** | §1: discover from `/exams/`, assert 17 with numbers 1–17 |
| `BLOCKS` still says testprep owns `[1890, Infinity]` | **High, silent** | §2; close it in the same commit |
| `facts.js` not rebuilt — 12% of canonical questions uncovered | **Certain** | Phase 3.1; the validator catches it, so this fails loudly |
| Explanations keep `<strong>` and render as literal markup | Medium | Strip in the parser; the engine `esc()`s |
| The Select 3 question has still never been seen on screen | Medium | Phase 5, eyes-on. Second instance of a known-open item |
| Exam claim overstated across two sources with different claims | Medium | §6 |
| Source asserts copyright and publishes no licence | Medium | §6 — your call, stated rather than papered over |
| Page weight: four banks + ~1.0 MB search index | Medium | Search index stays lazily injected; data files cache independently |
| Source is a third-party scrape and not authoritative | Medium | Same as the other three. Run `node tools/verify-bank.mjs --only conflict` after import — it needs no ground truth and reads across banks. It already reports 0 conflicts on the 16 overlaps |
| Service worker serves a stale engine against the new data file | Medium | `VERSION` bump; `bankOk()` shape-check at boot |

---

## 8. Appendix — the validated parser

Verified: 17 pages, 408 questions, **0 parse problems**, using the cached pages from
2026-08-14.

Each page carries an inline script with everything the build needs:

```js
const time = 45
const id_test = 4869
const question_quantity = 24
const solution = {"p0":"r0,r1","p1":"r3","p2":"r2", … ,"p23":"r1"}
```

and 24 blocks of:

| What | Where |
| --- | --- |
| Question text | `<div class="question">` inside `.question_text` |
| Options, in order | `<label for="pNrM">` — text is the label's own text node |
| Option id | the `id="pNrM"` on the `<input>` |
| Correct answers | `solution["pN"]` — a comma-separated list of **option ids**, so multi-answer needs no text matching |
| Explanation | `.container_explication`, minus its `.container_response_correct_incorrect` child |
| Topic | `data-category` on the matching `.question_button`, via `all_question_categories` |
| Cross-check | `<input type="checkbox">` for multi-answer, `type="radio"` for single |

Three notes on what makes this source cheap, and one on what will bite:

- **`solution` gives option ids, not text.** No longest-first resolution against option
  strings, and no risk of shredding options that contain commas.
- **The input type is a free integrity check.** Asserting
  `(type === "checkbox") === (solution[pN].split(",").length > 1)` on every question is
  what turns "the parser probably works" into a measurement. It passes 408 / 408.
- **`question_quantity` is a second one.** Assert the block count equals it.
- **The block terminator is `<div id="container_button_check_answer">`, not any
  `container_result` element.** A regex that walks from one `container_question` to the
  next and terminates on the wrong element silently drops the 24th question on every
  page — it produced a clean-looking `17 × 23 = 391` during planning, and only the
  `question_quantity` assertion caught it. This is exactly why that assertion is in the
  list above rather than in a comment.

### Do not use the comment threads as a signal

The pages carry hundreds of user comments, many of them *"passed today, questions were
all from 1-17"*. It is good evidence the source is what it claims and worthless as data:
unstructured, undated in places, and impossible to tie to a specific question.
