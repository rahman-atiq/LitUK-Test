# TestPrep.UK Source — Implementation Plan

Add testprep.uk as a third question bank: 38 Mock tests and 11 Exam tests, with
"seen in a recent real exam" carried as a first-class property of the question.

> Canonical source of truth for execution. Drafted 2026-08-13. Every count below was
> measured against the live site and the working tree on that date, not estimated.
> Status: **planned, not executed.**

## Status

Nothing built. Baseline on the day of drafting: `node tools/validate-banks.mjs`
reports 2 banks · 84 tests · 2,016 slots · 1,890 ids · 1,858 unique · **All checks
pass**. That clean baseline is the revert point.

---

## The finding that reshapes the request

The request was to add Mock and Exam "with clear differentiation of Mock vs Exam
questions", on the reasonable assumption that they are two pools. They are not.

**261 of the 263 unique Exam questions also appear in testprep's own Mock tests.**
The site is one pool of ~979 questions sliced three ways — by chapter, as 38 mocks,
and as 11 exams. Exam-ness is a *curation over the pool*, not a separate source.

Two independent signals confirm the curation is real and not arbitrary:

| Signal | Exam questions | Mock-only questions |
| --- | --- | --- |
| Site's own 1–5★ rating | **263 / 263 are 5★** | 36·87·164·147·122 across 1–5★ |
| "Recently Asked" tag inside `data-relatedQuestions` | 131 / 263 (50%) | 43 / 639 (7%) |

So the differentiation is worth carrying, but it belongs on the **question**, not on a
bank boundary. Two banks would mint 261 duplicate ids for identical content; the
engine's INV-6 collapse would then merge them anyway, leaving an "Exam" bank whose
per-test stats silently share state with the Mock bank. One bank with a flag is both
smaller and more honest.

### Decided (2026-08-13)

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Bank shape, given Exam ⊂ Mock | **One `testprep` bank, one id space.** `x:1` on a question means it appears in at least one Exam test. Tests carry `kind: "mock" \| "exam"`. |
| 2 | The 40 chapter-organised tests | **Not imported.** They add only 76 further unique questions for 40 more tiles. They *are* used at build time as ground truth for topic mapping — see §4. |
| 3 | The 1–5★ rating | **Carried as `r`.** It is a high-yield signal independent of exam membership: 122 mock-only questions are also 5★. |

---

## 1. Verified findings

Source: <https://testprep.uk/life-in-the-uk-test/practice-tests>.

`robots.txt` (fetched 2026-08-13) is `User-agent: * / Allow: /` with disallows only on
`/css/`, `/js/`, `/lib/`, `/build/`, `/scss/` for Googlebot. Nothing restricts
`/life-in-the-uk-test/`. Pages are fully server-rendered — `quiz.js` reads questions out
of the DOM with `document.querySelectorAll('.question')`, so there is no API to call and
no JavaScript to execute.

All 89 pages were fetched and parsed during planning. **1,176 mock+exam questions,
0 parse problems.**

| Metric | Value |
| --- | --- |
| Pages | 38 mock (`/test-1` … `/test-38`) + 11 exam (`/exam-1` … `/exam-11`) |
| Slots scraped | 1,176 (49 × 24) |
| Parsed without error | 1,176 / 1,176 |
| Unique under the engine's INV-6 key | **902** |
| — carrying `x:1` (in ≥1 Exam test) | **263** |
| — appearing in more than one test | 270 |
| — exam-only, absent from every mock | 2 |
| Already in the existing bank | **3** |
| Net new unique questions | **899** |
| Explanations present | 902 / 902 |
| Multi-answer questions | 108 |
| Two-option questions | 51 |
| Options per question | 2, 4 or 5 |
| Image options | **none** — every option is text |
| Topic auto-mapped | 901 / 902 (1 by hand) |

The three that collide with the existing bank:

```
Which flower is associated with Northern Ireland?   -> existing g368
Which flower is associated with England?            -> existing g144
What is the capital of Wales?                       -> existing g166
```

They get fresh ids, consistent with decision #2 of
[PLAN-practice-tests.md](PLAN-practice-tests.md); INV-6's collapse gives them one shared
SR card at runtime. **0 answer conflicts** across all three — the new source agrees with
what is already in the bank everywhere they overlap.

### Merged totals

| | Before | After |
| --- | --- | --- |
| Banks | 2 | 3 |
| Tests | 84 | **133** |
| Slots | 2,016 | **3,192** |
| Question ids | 1,890 | **2,792** |
| Unique after INV-6 collapse | 1,858 | **2,757** |
| Two-option questions | 509 | 560 |

Topic distribution of the new 902 — 297 / 297 / 262 / 23 / 23 — tracks the existing
bank's shape (27% / 42% / 27% / 2% / 1%) closely enough that it needs no rebalancing.
The two tiny topics stay tiny because the handbook chapters behind them *are* tiny.

---

## 2. Storage contract

Unchanged from [PLAN-practice-tests.md](PLAN-practice-tests.md) §2. `lituk_v1`,
shallow-merged; `S.tests[n]` keyed by test number, `S.sr[g]` / `S.mistakes[g]` /
`S.flags[g]` keyed by question id.

### Invariants

| ID | Invariant |
| --- | --- |
| INV-2 | New question ids start at **1890**. Ids 0–1889 are never renumbered. |
| INV-3 | New test numbers are **201–238** (Mock) and **301–311** (Exam). 1–45 and 101–139 are untouched. |
| INV-4 | State changes are additive only. |
| INV-6 | The dedup key stays stem + sorted option set. Adding `x` and `r` must not touch it. |
| INV-9 | *(new)* `x` is derived, never authored. A question is `x:1` **iff** it appears in at least one `kind:"exam"` test in the same bank. The builder asserts this; nothing hand-edits it. |

The 200/300 test-number split is deliberate and self-documenting: the block a test
number falls in tells you what it is without a lookup, and it leaves 139–200 free if
lifeintheuktest.com ever grows.

---

## 3. Data shape

```js
(window.LITUK_BANKS = window.LITUK_BANKS || []).push({
  id: "testprep",
  label: "TestPrep Tests",
  source: "TestPrep.UK",
  sourceUrl: "https://testprep.uk/life-in-the-uk-test/practice-tests",
  passmark: 18,
  perTest: 24,
  tests: [
    {"n":201,"kind":"mock","name":"TestPrep Mock 1","q":[ … ]},
    …
    {"n":301,"kind":"exam","name":"TestPrep Exam 1","q":[ … ]},
  ],
});
```

Question objects gain two optional fields on the existing `{g,t,e,p,o}`:

| Field | Meaning |
| --- | --- |
| `x` | `1` if the question appears in at least one Exam test. Absent otherwise — 648 of the 1,176 emitted slots, so omitting it rather than writing `x:0` saves ~3.8 KB. |
| `r` | The site's 1–5★ rating. |

Both are additive and optional, so `bankOk()` in the engine needs no change and the two
existing banks stay valid untouched.

Explanations are stored **plain text**. The source wraps key terms in `<b>`; the engine
renders explanations through `esc()`, so tags must be stripped at build time or they
show up as literal `<b>` on screen.

---

## 4. Topic mapping — use the chapter tests as ground truth

The existing practice-tests builder guesses the topic from a free-text `Reference:`
line and needed a word-matching fallback plus hand assignment. This source allows
something much better.

The 40 chapter tests state the handbook chapter for each question directly, and
**882 of the 902 mock+exam questions also appear in a chapter test**. So the chapter
tests are fetched and parsed as ground truth, then discarded rather than imported.

Resolution order, measured:

| Step | Resolves |
| --- | --- |
| 1. Chapter-test membership | 882 |
| 2. `data-reference` slug → chapter table, itself derived empirically from step 1 | 19 |
| 3. Hand assignment | 1 |

Zero questions appear under more than one chapter, so step 1 is unambiguous everywhere
it applies. The one straggler is *"What flowers did William Wordsworth write about…"*
(`famous-writers`, → Arts and culture → topic 0).

### The trap: testprep numbers its chapters differently

**testprep.uk's chapter numbering is not the numbering the existing pipeline assumes.**

```js
// tools/build-practice-data.mjs — lifeintheuktest.com
const CH2TOPIC = { 1: 3, 2: 4, 3: 1, 4: 0, 5: 2 };

// testprep.uk — chapters 1 and 2 are SWAPPED relative to the above
const TP2TOPIC = { 1: 4, 2: 3, 3: 1, 4: 0, 5: 2 };
//  1 What is the UK?                          -> 4
//  2 The values and principles of the UK      -> 3
//  3 A Long and Illustrious History           -> 1
//  4 A Modern, Thriving Society               -> 0
//  5 UK government, law and your role         -> 2
```

Confirmed from the site's own section headings and cross-checked against the data:
the `what-is-the-uk` and `uk-cities` reference slugs land under testprep chapter 1,
`the-values-and-principles-of-the-uk` and `responsibilities-and-freedoms` under
chapter 2.

Copying `CH2TOPIC` across would mis-file 46 questions into each other's topic and throw
no error at all — it would just quietly corrupt the topic breakdown and the weakest-topic
recommendation. This is the single most likely way to get this wrong.

---

## 5. Phases

### Phase 0 — Preserve the scrape *(inert)*

`tools/fetch-testprep-tests.mjs`, modelled on `fetch-practice-tests.mjs`: real
User-Agent, 1.2 s between requests, every page cached to
`tools/.cache/testprep-tests/`. Fetches all 89 pages — 49 for content, 40 for topic
ground truth. Exports `parse()` and `loadAll()`.

Add `tools/.cache/testprep-tests/` to `.gitignore` if the existing cache line does not
already cover it.

**GO** — reports 49 content pages × 24 questions, 40 chapter pages × 24, 0 parse
problems.

### Phase 1 — Build the bank

`tools/build-testprep-data.mjs` → `testprep-data.js`.

1. Ids from 1890 in first-seen order (Mock 1 → 38, then Exam 1 → 11); repeats share an
   id.
2. Tests 201–238 and 301–311, each with `kind` and `name`.
3. `x:1` set on every question reachable from a `kind:"exam"` test — derived in a
   second pass over the assembled bank, never during the first (INV-9).
4. `r` from the `rated-N` class.
5. Topic via §4's three-step resolution.
6. Refuse to write on **any** problem, exactly as the practice builder does.

**GO** — `49 tests · 1176 slots · 902 ids 1890–2791 · 263 exam · 0 problems`.

### Phase 2 — Register the bank

- `tools/lib/banks.mjs` — add `"testprep-data.js"` to `BANK_FILES`.
- `life-in-uk-mock-tests.html` — add the `<script src>` before the engine, in the same
  ordered (non-`defer`) position as the other two; bump `UNIQUE_EXPECT` **1858 → 2757**.
- `index.html` — `TOTAL_TESTS` 84 → **133**, `TOTAL_QUESTIONS` 1890 → **2792**,
  `UNIQUE_QUESTIONS` 1858 → **2757**, the `84 tests` tag (line 248) and the meta
  description (line 10).
- `tools/validate-banks.mjs` — `UNIQUE_EXPECT` 1858 → 2757.
- `sw.js` — bump `VERSION`, add `./testprep-data.js` to `EVERYTHING`.

**GO** — `node tools/validate-banks.mjs` passes with `3 bank(s)`; the dashboard renders
133 tiles; every pre-existing test stat is unchanged and all 49 new tests read "New".

### Phase 3 — Rebuild the generated files

Both are validator-enforced, and skipping either fails the build:

1. `node tools/build-facts.mjs` — `validate-banks.mjs:166` fails if more than 5% of
   canonical questions have neither a fact card nor a chapter link. Adding 899
   questions is 33% of the new total, so **this is a guaranteed failure if skipped.**
2. `node tools/build-search-index.mjs` — grows roughly 590 KB → ~880 KB. It is
   injected lazily by `index.html`; confirm that still holds.

### Phase 4 — Surface the differentiation

This is the part the request is actually about. `bankSection()` currently renders one
flat grid per bank; the testprep bank needs two.

1. **Two sections in the dashboard**, split on `t.kind` — *"TestPrep Mock Tests"* (38)
   and *"TestPrep Exam Tests"* (11), the latter subtitled with the source's own claim:
   *"Reported by test-takers as recently asked in real 2026 exams."*
2. **Exam badge on the question**, wherever a question is shown with its provenance —
   the review row, the mistakes view, the question modal. `x:1` → a small "Seen in a
   real exam" mark. This is the payoff for the one-bank decision: the badge shows up
   on a question you met in Mock 12, because it is the same question.
3. **A drill filter** — "Exam questions only", 263 cards. The natural companion to the
   existing gauntlets, and the highest-yield 263 questions in the app.
4. Attribution: testprep.uk publishes under OGL v3.0 with a DMCA badge. Its footer
   disclaimer is worth mirroring in the bank's `source` line — same posture as the other
   two banks, plus the licence.

### Phase 5 — Verification

Extend `tools/validate-banks.mjs`:

- every `x` is `1` or absent, and `x:1` **iff** reachable from a `kind:"exam"` test
  (INV-9 — this is the assertion that keeps the differentiation honest)
- every `r` is an integer 1–5 where present
- every test in a bank that declares `kind` has one, and it is `mock` or `exam`
- new ids ≥ 1890; new test numbers in 201–238 ∪ 301–311
- the existing checks, unchanged

On the phone: export progress (Phase 1 of the practice plan, shipped and verified
2026-08-12), snapshot `lituk_v1`, deploy, hard reload, compare. Old test bests, drill
streak, open mistakes and SR due-count must match exactly.

---

## 6. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `TP2TOPIC` copied from `CH2TOPIC` — chapters 1/2 are swapped | **High, silent** | §4; 46 questions would be mis-filed with no error |
| `facts.js` not rebuilt — 33% of canonical questions uncovered | **Certain** | Phase 3.1; the validator catches it, so this fails loudly |
| Two banks minted instead of one, creating 261 duplicate ids | High | Closed by decision #1 |
| `x` hand-edited and drifting from exam-test membership | Medium | INV-9 assertion in Phase 5 |
| Explanations keep their `<b>` tags and render as literal markup | Medium | Strip in the parser; the engine `esc()`s |
| Two 5-option questions — a new option count for this bank | Low | `guessRate()` uses `nCk(q.o.length,k)` and handles it; `RETIRE_2` keys off `o.length===2` only. Verified, no change needed |
| Page weight: three banks + ~880 KB search index | Medium | Search index stays lazily injected; data files cache independently |
| Source is a third-party scrape and not authoritative | Medium | Same as the other two banks. Run `node tools/verify-bank.mjs --only conflict` after import — the conflict signal needs no ground truth and reads across banks |
| Service worker serves a stale engine against the new data file | Medium | `VERSION` bump; `bankOk()` shape-check at boot |

---

## 7. Appendix — the validated parser

Verified: 89 pages, 2,136 questions, **0 parse problems**. Every question is one
`.question` div carrying its answers, explanation and reference as data attributes.

```js
const blocks = [...html.matchAll(
  /<div class="question(?: active)?" id="question-(\d+)"([\s\S]*?)(?=<div class="question(?: active)?" id="question-\d+"|<div class="question-navigator|$)/g)];
```

Per block:

| What | Where |
| --- | --- |
| Question text | `<h3 class="questionDescription">` |
| Options, in order | `<span class="option-text">` |
| Correct answers | `data-answers="[0]"` — a JSON array of **option indices**, so multi-answer needs no text matching at all |
| Explanation | `data-explanation` — an HTML-escaped JSON *string* containing `<b>` tags |
| Reference | `data-reference` — JSON array of URLs |
| Rating | `question-rating … rated-N` |
| Cross-check | `<div class="select-correct-options">Select N correct answer` |

Two things worth stating because they are what makes this source cheap:

- **`data-answers` gives indices, not text.** The lifeintheuktest.com parser had to
  resolve a comma-joined answer string against option texts longest-first to avoid
  shredding options containing commas. None of that is needed here.
- **`Select N` is a free integrity check.** Asserting
  `selectN === data-answers.length` on every question is what turns "the parser
  probably works" into a measurement. It passes 2,136 / 2,136.

Attributes are HTML-escaped (`&#34;`), so entity-decode before `JSON.parse`. Reuse the
`ents` / `dec` / `txt` helpers already in `tools/fetch-practice-tests.mjs` rather than
writing a second copy.

### Do not use `data-relatedQuestions` as the exam signal

It is tempting — it literally contains the string `Recently Asked`. But it tags
*related* questions rather than the question carrying it, and it covers only 131 of the
263 exam questions while firing on 43 non-exam ones. Membership in an `exam-N` test is
the clean signal. The related-questions field is worth keeping in mind as future
"questions like this one" material, and nothing more.
