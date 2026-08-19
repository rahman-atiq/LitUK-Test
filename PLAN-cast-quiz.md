# The Cast Quiz — Implementation Plan

Turn the 195 reveal cards on the Day Before sheets into a graded, scheduled game
that tests **who / what / which field / when** as four separate axes, on a page
of its own.

> Drafted 2026-08-19. Tier 2, home (b) — a new page over both chapters — chosen
> by the user the same day. Findings verified against the working tree at the
> commit this branch starts from. Nothing here edits a Day Before page's content:
> those pages stay the source of truth and this one is generated from them.

## The problem in one line

The reveal card is a *self-graded* prompt — you tap, you see the fact, and
nothing anywhere records whether you actually knew it — so 195 names all feel
equally learned right up until the one you cannot place.

---

## 1. Verified findings

| # | Finding | Evidence |
| --- | --- | --- |
| F-1 | 195 person cards exist: 94 in ch3 across 7 era groups, 101 in ch4 across 10 domain groups. Ch5 has none — its cast is roles, not people. | `life-in-uk-day-before.html:586-712`, `life-in-uk-day-before-ch4.html:471-626`, [ch5:roles](life-in-uk-day-before-ch5.html) |
| F-2 | Every card is one line of markup with three fixed spans — `.p-name`, `.p-life`, `.p-note` — so extraction is a regex, not a parser. | [ch4:475](life-in-uk-day-before-ch4.html#L475) |
| F-3 | 124 of 195 `.p-life` lines carry a year, century or `BC`/`AD` marker. The other 71 carry only a domain (`· missionary`). A "when" question can only be asked of the 124. | measured across both files |
| F-4 | 194 of 195 `.p-note` bodies contain at least one `<b>` span; the mean is 2.37 (ch3) and 1.50 (ch4). The author has already marked exactly which words are the answer. | measured across both files |
| F-5 | Group identity is on the wrapper: `data-dom` plus a `--era` custom property, and the human label is the `<b>` inside the `.dom` header. Ch3 uses `1`–`7`, ch4 uses slugs. | [ch3:586-587](life-in-uk-day-before.html#L586), [ch4:471](life-in-uk-day-before-ch4.html#L471) |
| F-6 | Agatha Christie appears twice in ch4 — Theatre (The Mousetrap) and Novelists (detective stories) — deliberately, per the page's own note. Two cards, one person. | [ch4:527](life-in-uk-day-before-ch4.html#L527), dom-note at `:532` |
| F-7 | The Leitner engine in the mock-tests page is already exam-date-aware: `srDays()` compresses the whole ladder into the days remaining and `clampDue()` refuses to file anything past two days before the exam. | [life-in-uk-mock-tests.html:1943-1957](life-in-uk-mock-tests.html#L1943) |
| F-8 | That engine is inline in a 174 KB page with no module boundary, and it is keyed to `QByG` — the question bank. It cannot be imported, only re-implemented. | `srDue()` at [:1969](life-in-uk-mock-tests.html#L1969) |
| F-9 | The exam date lives at `S.examDate` inside the `lituk_v1` blob, default `2026-09-05`. | [:566-570](life-in-uk-mock-tests.html#L566) |
| F-10 | Both Grey-Thompson and Weir are welded to "six London Marathon wins"; Chichester, Knox-Johnston and MacArthur are three near-identical solo circumnavigations. Distractors drawn at random from a group will sometimes be *more* correct than the key. | [ch4:481,483](life-in-uk-day-before-ch4.html#L481), `:487-489` |
| F-11 | The hub links only the ch3 sheet; ch4 and ch5 are reachable only from the ch3 page's `.chapswitch`. | [index.html:300](index.html#L300), [day-before:411](life-in-uk-day-before.html#L411) |
| F-12 | A new page reaches offline readers only if it is added to `EVERYTHING` in `sw.js` **and** `VERSION` is bumped. | [sw.js:7,24-45](sw.js#L7) |
| F-13 | **Found during Phase 1.** Seven figures share a note with another figure, word for word: Keats, Shelley and Tennyson all read "In the chapter's 19th-century roll call; no work or line attached", and de la Mare, Masefield, Betjeman and Hughes all read "One of the chapter's modern poets — later than the WWI pair". The handbook names them and attaches nothing. | `life-in-uk-day-before-ch4.html`, Poets |

### What F-13 costs if ignored

"Whose fact is this?" has no answer when three people own the same sentence, and
neither does "what is Keats known for?". Built naively, the quiz would show a
note belonging equally to Keats, Shelley and Tennyson, mark one of them right by
accident of construction, and drop the learner's Leitner box for picking either
of the others. That is not a hard question — it is an unanswerable one, and it
would have looked completely normal on screen.

### What F-10 costs if ignored

Ask "who won six London Marathons?" with three distractors picked at random from
Sport, and one time in ten the distractor set contains the other person who also
won six London Marathons. The learner picks a defensible answer, is marked wrong,
and the Leitner box drops. The game would be teaching a fact the handbook does
not assert.

---

## 2. Hard constraints

| # | Invariant |
| --- | --- |
| INV-C1 | **No generated content.** Every string a question is built from is a verbatim slice of a Day Before card. Nothing is summarised, rewritten or inferred — same rule as INV-7 in `build-facts.mjs`. |
| INV-C2 | `cast-data.js` is generated. It carries the `do not edit by hand` banner and is rebuilt from the two HTML pages, so the sheet and the quiz can never disagree. |
| INV-C3 | The build **fails loudly** rather than shipping a thin bank: if any card yields no answerable axis, or the person count moves without the expected-count constant moving, it exits non-zero. |
| INV-C4 | Cast progress lives in its own key, `lituk_cast_v1`. It never writes `lituk_v1` — the mock-tests readiness model must not be moved by a different kind of drill. |
| INV-C5 | The exam date is **read** from `lituk_v1` and never written there. No date of its own. |
| INV-C6 | A twice-carded figure keeps **both** cards, with a box each — the second card is a different weld (Wren rebuilt St Paul's in ch3; he is an architect in ch4) and dropping it would put a fact the sheet teaches beyond the quiz's reach. They are refused as each other's distractors instead, so one name is never offered twice (F-6). |
| INV-C7 | Distractors are checked against the key: an option whose own fact would also satisfy the question is rejected (F-10). |
| INV-C8 | The page degrades honestly. Its data ships as JavaScript, so with scripting off there is no drill to show — a `<noscript>` block says so and sends the reader to the Day Before sheets, which are static HTML and do degrade. It must never render as a blank shell. |
| INV-C9 | A figure the sheet gives no distinguishing fact for is asked only what it can be asked — which group it is in, plus any blank inside its note. It never appears as the subject of a fact-or-name question, and never in a duel (F-13). |

---

## 3. Decisions — resolved 2026-08-19

| Question | Decision |
| --- | --- |
| Where does the data come from? | A build script, not runtime DOM scraping. Runtime scraping only works on the page being scraped, and breaks silently on markup drift. |
| Which of the five modes ship in Tier 2? | Weld Drill (4 axes), Confusion Duel, Cloze. Timeline Drop and the Gauntlet are Tier 3. |
| One SR engine or two? | Two, unavoidably (F-8) — but the cast page re-implements `SR_BASE` / `srDays` / `clampDue` **verbatim** so the two ladders behave identically, and reads the same exam date (INV-C5). |
| Does the "when" axis ask for a year? | **Revised in Phase 1.** The plan's century-band idea was dropped: for ch3 the group *is* the era, so a band question would have duplicated the group axis, and for ch4 "20th century" is true of almost everyone. The dates the handbook actually tests — 1954, 1966, 1727 — are bolded *inside the notes*, not in the life lines. So "when" is asked as a cloze over a dated `<b>` span, which also keeps it verbatim. 36 dated blanks across 27 figures. |
| What counts as "welded"? | Correct on every axis the person *has*, on two separate days. Same principle as the mock page's retirement rule: a fact re-answered ten minutes later is recall, not knowledge. |

---

## 4. Phases

### Phase 1 — `tools/build-cast-data.mjs` → `cast-data.js`

Extracts per person: `id`, `name`, `life`, `note` (HTML retained for the `<b>`
spans), `chapter`, `group` key + label + colour token, a parsed `when` band where
F-3 allows, and the list of cloze targets harvested from the `<b>` spans.

Emits `window.LITUK_CAST = {v, groups, people}`. Validates INV-C1/C3 before
writing. Prints a per-axis census so a content change shows up as a diff in the
build log.

### Phase 2 — `life-in-uk-cast.html`

Shared head block copied verbatim from a Day Before page (theme boot, safe-area
CSS, `app.js`), the same design tokens, the same card idiom. Sections:

- **Roll Call** — the day's due list, ~12 people, one tap to start.
- **Weld Drill** — four axes, one person at a time; the axis is chosen by which
  ones the person still owes.
- **Confusion Duel** — seeded from the 18 trap pairs plus auto-detected
  fact-collision pairs (F-10 turned from a hazard into content).
- **Cloze** — a `<b>` span blanked, four options drawn from same-shaped spans.
- **The Cast** — all 195 with per-group completion meters, the Day Before card
  idiom, and a link back to the sheet each person came from.

### Phase 3 — Wiring

Hub tile; `sw.js` `EVERYTHING` + `VERSION` (F-12); a fourth entry in the
`.chapswitch` on all three Day Before sheets so the quiz is reachable from the
cards it was built from.

F-11 is **left alone**: adding ch4 and ch5 to the hub changes whether the Day
Before tile stays one tile or becomes a group of three, and that is a call about
the hub's shape rather than part of this page.

### Phase 4 — Validation

`tools/test-cast-quiz.mjs`, in two passes.

Static, over `cast-data.js`: every cloze index points at a non-empty `<b>` span,
every figure can raise three legal distractors, every cloze kind has four
distinct values to draw on, every group anchor exists on the sheet its link
points at, and `SR_BASE`/`EXAM_GAP` still match the mock page's line for line.
Plus the duel bar: each pair must be **decidable from the whole note shown** —
each side must say something the other does not, or it is a coin flip dressed as
a question.

Live, driving the real page in Chromium for 288 questions across all four modes:
no duplicate or empty options, no leaked markup, exactly one right option per
answer, progress survives a reload, `lituk_v1` is never created, and no page
errors. INV-C7 is checked per rendered question by mapping every option back to
the figure it came from — the duel excepted, since colliding pairs are its whole
content.

---

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| A Day Before edit changes the markup shape and the extractor silently yields fewer people. | INV-C3's expected-count constant fails the build. |
| Two Leitner implementations drift apart over time. | The constants are copied with a comment naming the source line, and Phase 4 asserts equality. |
| `localStorage` pressure — the mock page already fills it. | Cast state is ~195 small records, under 20 KB, and its own key can be cleared without touching progress. |
| The cloze blanks a `<b>` span that is the whole note, leaving no prompt. | Cloze targets require surviving text on at least one side; otherwise the person gets no cloze axis. |

---

## 6. Suggested execution order

1, 2, 3, 4 in order — Phase 2 cannot start before the data shape is fixed, and
Phase 4 is what makes the whole thing trustworthy.

---

## 7. What implementation changed

Three things the plan got wrong, found by building it:

1. **The "when" axis** was going to be a derived century band. It would have
   duplicated the era axis on ch3 and been trivially "20th century" on ch4. The
   dates the test actually asks for are bolded inside the notes, so "when" is a
   cloze over a dated span instead — and stays verbatim, which the band never was.
2. **Twice-carded figures** were going to share one Leitner box. They carry
   genuinely different welds, so they keep a box each and are refused as each
   other's distractors instead. Detecting them by slug alone missed Chaucer, who
   is "Geoffrey Chaucer" on one sheet and "Chaucer" on the other; a name wholly
   contained in another name counts too.
3. **F-13 was not in the plan at all** and is the most consequential thing found:
   seven figures the handbook names without attaching a fact. INV-C9 exists
   because of them.

The duel also needed a bar of its own. INV-C7 refuses colliding figures as
distractors, but the duel is *made* of colliding pairs, so it is exempt from that
rule and held to a different one: decidable from the whole note shown. Ten pairs
failed that bar on the first run — all of them F-13 figures, which is how F-13
was found.
