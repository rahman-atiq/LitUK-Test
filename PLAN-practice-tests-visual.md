# Practice Tests — Visual & Layout Plan

Make the Practice Tests dashboard open on the tests rather than on a stat panel, and
make it behave like a phone app when you touch it.

> Drafted 2026-08-21, to be executed in a fresh session. Findings verified against the
> working tree at commit `5900d88` (clean). Nothing here changes question content, the
> shape of `S`, saved progress, or any grading path — this is presentation only.
> Two independent reviews produced this list: an inline review and a separate
> mobile-design agent that never saw the first. Where they agreed the item is marked
> **[both]**; where only the design agent found it, **[design]**.

## The problem in one line

Every block on the dashboard is a card of equal weight, so nothing is the page — and
the result is ~1,730px of furniture above the first test tile, on a page called
Practice Tests.

## Target device

iPhone 15, installed as a PWA, portrait. **393px viewport → 361px content width**
(`.wrap` padding is 16px each side, [life-in-uk-mock-tests.html:90](life-in-uk-mock-tests.html#L90)).
Every measurement below is computed against 361px. No hover exists on this device.

---

## 1. Verified findings

Do not re-derive these; they were computed from the real `minmax()` floors, gaps and
padding, and the contrast figures were recomputed by hand.

| # | Finding | Evidence |
|---|---|---|
| F-1 | `.actions` **never resolves to 2 columns on a phone.** Two tracks need `196×2+9 = 401px`; 361px available. Eight rows ≈ **615px**, the largest block above the tests. | [:241](life-in-uk-mock-tests.html#L241) |
| F-2 | `.tests` resolves to **2 columns of 163.5px**. Three tracks need `128×3+20 = 404px`; available inside `.bankbody` is `361−2−22 = 337px`. The default-open first section is 45 tiles = 23 rows ≈ **2,773px**. | [:384](life-in-uk-mock-tests.html#L384), [:351](life-in-uk-mock-tests.html#L351) |
| F-3 | `nextUpCard()` renders **after** `.tests-head`, ~1,570px down — below a section header it does not belong to. | [:1332](life-in-uk-mock-tests.html#L1332) |
| F-4 | **20 `:hover` rules, 3 real `:active` rules.** `-webkit-tap-highlight-color:transparent` is set on `button,.opt,.dot,summary,a`, so most of the page gives *zero* feedback on touch. | [:88](life-in-uk-mock-tests.html#L88) |
| F-5 | `.tcard` inherits `.card`'s deliberate **four-layer** shadow — 150 of them on a `--panel-2` field, and 150 composited layers to repaint down a ~5,000px page. `.act` already sets `box-shadow:none` for the same reason. | [:119](life-in-uk-mock-tests.html#L119), [:269](life-in-uk-mock-tests.html#L269) |
| F-6 | `.stat.hero` (~137px) + `.stat-row` 2×3 (~309px) = **458px, 61% of a screen**, all read-only. "Days to exam" and "Tests passed" repeat the `.phero` line and rail verbatim. | [:1287-1292](life-in-uk-mock-tests.html#L1287-L1292), [:1307](life-in-uk-mock-tests.html#L1307), [:1314](life-in-uk-mock-tests.html#L1314) |
| F-7 | `.hero-side` is `flex:0 0 auto` ≈107px; with 40px padding + 16px gap the left column gets ~196px, so `.s` **wraps to 3 lines** at 393px. | [:220](life-in-uk-mock-tests.html#L220) |
| F-8 | `heroIn` + `countUp()` re-run on **every** `renderDashboard()`, which fires from `setTestFilter`, `toggleAllGroups`, `toggleSessOpen`, `closeSettings`, `noteBackup`. Tapping "Retry" is worst: `:1164` forces all five sections open, so the whole page restages. | [:130](life-in-uk-mock-tests.html#L130), [:1338](life-in-uk-mock-tests.html#L1338), [:1079](life-in-uk-mock-tests.html#L1079) |
| F-9 | The settings-summary `.chip` in `.tests-head` is `white-space:nowrap` at ~280px, forcing the header to a second row. It is not a filter but sits directly above four that are. Both chips carry inline `style=` in a file that otherwise never does. | [:1329-1330](life-in-uk-mock-tests.html#L1329-L1330), [:466](life-in-uk-mock-tests.html#L466) |
| F-10 | `.fchips` wraps to 2 rows: the four chips measure ~411px against 361px. | [:181](life-in-uk-mock-tests.html#L181) |
| F-11 | `.tcard .tw` is 9.5px/0.13em uppercase and reserves `min-height:17px` on all 150 tiles, printing the word the section header just said. | [:399](life-in-uk-mock-tests.html#L399) |
| F-12 | Three `.btn primary` compete above the fold once F-3 is fixed: Resume, Start drill, Start. | [:1512](life-in-uk-mock-tests.html#L1512), [:1008](life-in-uk-mock-tests.html#L1008), [:1214](life-in-uk-mock-tests.html#L1214) |
| F-13 | `.dot` is 30px and `.rsm .x` ~30px — both under the 44px iOS touch minimum, and `.rsm .x` is destructive and adjacent to a primary button. | [:523](life-in-uk-mock-tests.html#L523), [:266](life-in-uk-mock-tests.html#L266) |

### F-14 — the contrast constraint that governs Phase 2

`GRP_ACC[4] = #5e93d0` (the lituktestweb section) on `--panel:#ffffff` measures
**3.20:1** — recomputed by hand, the design agent's figure is correct. It clears AA
only under the large-text rule.

`.tcard .tnum` is `font-weight:700`, so the applicable floor is **18.66px (14pt bold)**,
not the 24px regular-text threshold the design agent assumed. **Ship 27px anyway** —
that keeps a wide margin against font-synthesis differences across the serif stack, and
27px fits. Treat 18.66px as the hard floor if 27px proves too wide on device, and never
go below it. Re-check the same pair in dark theme against `--panel:#1f1929`.

---

## 2. Phases

Phases are ordered by return-on-risk. **Stop after Phase 1 and check the device**
before starting Phase 2 — Phase 1 is ~12 lines and changes the page's whole rhythm,
and Phase 2's column change should be judged against the new rhythm, not the old one.

### Phase 1 — the twelve lines (do first, then look at it) **[both]**

Sheds ~1,300px. Lowest risk on the list.

1. **Move `nextUpCard()` above the fold.** Move `${nextUpCard()}` from
   [:1332](life-in-uk-mock-tests.html#L1332) to immediately after the `.phero` block
   and before `${backupNag()}` ([:1296](life-in-uk-mock-tests.html#L1296)). Then set
   `.nextup{margin:0 0 14px}` and let `.phero`'s existing `16px` bottom margin do the
   rest, so the two read as one object rather than showing a doubled gap.

2. **Kill the tile shadow.** Add `box-shadow:none` to `.tcard`
   ([:385](life-in-uk-mock-tests.html#L385)). The tile keeps its border, its 3px
   `::before` top edge and its state tint, so nothing is lost. **Leave the four-layer
   `--shadow` on `.phero`, `.drill`, `.stat.hero` and `.bankhd`** — it is correct there.

3. **Press states.** The single most valuable change per line, and the one that fixes a
   stated constraint rather than a preference.

   ```css
   .btn:active,.fchip:active,.stat.tap:active{transform:scale(.985)}
   .bankhd:active{background:linear-gradient(100deg,color-mix(in srgb,var(--acc) 22%,var(--panel)),var(--panel) 62%)}
   .icon-btn:active,.hubLink:active,.nav button:active{background:var(--chip)}
   ```

   Add the `transform` selectors to the existing reduced-motion block at
   [:393](life-in-uk-mock-tests.html#L393). The `.bankhd` and `.icon-btn` rules are
   colour-only and deliberately survive reduced-motion untouched — colour carries the
   feedback, movement is the garnish.

4. **One primary button above the fold.** Demote the drill button at
   [:1008](life-in-uk-mock-tests.html#L1008) from `.btn primary` to `.btn`. `nextUp` is
   the page's action. Resume stays primary — it is contextual and rare, and when it is
   there it genuinely is the right move.

> **GO criteria for Phase 1:** on the phone, the recommended test is visible without
> scrolling; tapping a section header visibly acknowledges the touch; the tile grid
> looks cleaner, not flatter-in-a-bad-way.

### Phase 2 — three tiles per row **[design]**

The largest single saving on the page (~1,000px on the open section alone) and the
change that makes the `.mix` fingerprints do the job [:377](life-in-uk-mock-tests.html#L377)
claims for them: at 2-up they are a list of bars, at 3-up they are a field the eye can
read as a pattern.

```css
.tests{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
```

`3×104+16 = 328 ≤ 337` → **3 columns of 107px**. 45 tiles drops 23 rows → 15 rows,
≈2,773px → ≈1,777px. `auto-fill` still fans out to 7 columns on a 900px `.wrap`, so
desktop is unharmed.

Paired changes, both required:

- **`.tcard .tnum{font-size:27px}` inside the ≤560px block.** See F-14. At 27px
  "234" is ~45px against 81px of tile content width.
- **Shorten `.meta`.** [:1029](life-in-uk-mock-tests.html#L1029) renders
  `Best 18/24 · 3×` at ~88px against 81px available, so it ellipsises. Drop the word:
  render `18/24 · 3×`. `Not sat` already fits.

### Phase 3 — shorten the tile **[design]**

Compounds with Phase 2: together the open 45-tile section goes **2,773px → ~1,462px,
a 47% cut**, and the tile becomes what [:369](life-in-uk-mock-tests.html#L369) says it
should be — the number *is* the tile.

```css
@media (max-width:560px){
  .tcard .tw{display:none}
  .tcard .tm{position:absolute;top:8px;right:8px;margin-left:0}
  .tcard .tnum{margin-top:0}
}
```

Tile height 111px → 90px. The state mark (✓ / ↻) moves out of the flow rather than
being deleted — it is the only thing in `.tw` that is not redundant with the section
header. **Keep `.tw` on desktop**, where the width is free and the word helps.

### Phase 4 — demote the eight actions **[both]**

Eight equal-weight CTAs above 150 tests means nine ways in and no recommended one.
Three options were considered; **ship (c)**:

- (a) `minmax(150px,1fr)` → 2 cols of 176px. Only ~103px of text width after the 34px
  emoji tile and padding, so "Real-exam questions" wraps to 2 lines and its description
  to 3. Saves ~150px and looks worse. **Rejected.**
- (b) Keep 1 column, delete `.act .d` ([:284](life-in-uk-mock-tests.html#L284)). Saves
  ~90px but removes the live counts, which are the only thing distinguishing the rows.
  **Rejected.**
- **(c) Surface three, collapse five.** Show **Sweep**, **Practice mistakes**, **Random
  exam**; put Twist gauntlet, Date gauntlet, Real-exam questions, Practice by topic and
  Cram sheet behind a `<details>` styled like `.bankhd`
  ([:297](life-in-uk-mock-tests.html#L297)), reusing the summary chrome that already
  exists. Inside the details use `repeat(auto-fit,minmax(150px,1fr))`.

  `3×65 + 2×9 = 213px` visible + ~48px collapsed summary ≈ **261px, down from 615px**.

  The three were chosen by urgency, not taste: Practice mistakes is count-driven, Sweep
  is coverage-driven, Random exam is the canonical one. **This is a product decision —
  see §3.**

### Phase 5 — compress the stats **[both]**

- **Delete "Days to exam" and "Tests passed" from `.stat-row`**
  ([:1307](life-in-uk-mock-tests.html#L1307), [:1314](life-in-uk-mock-tests.html#L1314)).
  Both are already stated verbatim in the `.phero` line and rail 350px above. The page
  is currently arguing with itself.
- **Bank coverage and Never seen are the same fact** (`seen/UNIQUE_N` and
  `UNIQUE_N−seen`). Fold to one box reading `${seen}/${UNIQUE_N} seen`.
- Remaining boxes: **`.stat .n{font-size:20px}`, `.stat{padding:11px 12px}`** in the
  ≤560px block, and drop `.stat .s` ([:228](life-in-uk-mock-tests.html#L228)) from the
  dashboard. Result ≈136px, from 309px.
- **Keep the pass-probability hero big** — [:207](life-in-uk-mock-tests.html#L207) is
  right that it is the one number the app exists to move. Shrink `.stat.hero .n`
  44px → 38px only.
- **Fix F-7 by copy, not layout:** cut `.s` to `Tap for the maths`.

### Phase 6 — the header and chip rows **[both]**

- **Delete the settings-summary chip** ([:1330](life-in-uk-mock-tests.html#L1330)). The
  gear icon at [:685](life-in-uk-mock-tests.html#L685) already opens Settings.
- **Move "Collapse all"** out of `.tests-head` and right-align it in the `.fchips` row
  as a plain text button. Removes the inline `style=` attributes noted in F-9 with it.
- **Get `.fchips` onto one row:** rename `Not attempted` → **`Not sat`** in `FILTERS`
  ([:1063](life-in-uk-mock-tests.html#L1063)) — which matches the copy the tiles already
  use at [:1029](life-in-uk-mock-tests.html#L1029) — and set `gap:6px`,
  `.fchip{padding:6px 11px}`. Lands ≈358px against 361px. **Three pixels is not a
  margin to bet on; see §4.2.**

### Phase 7 — stop the page restaging on every filter tap **[design]**

Fixes F-8. Gate both effects on first paint:

```js
let heroFirst = true;
// in the template:  class="card phero${heroFirst ? ' in' : ''}"
// move the animation off .phero and onto .phero.in
// after the innerHTML assignment:  if (heroFirst) { countUp(el); heroFirst = false; }
```

`prefers-reduced-motion` is already handled at [:344](life-in-uk-mock-tests.html#L344);
this is about the *default* path being wrong, not the reduced one.

### Phase 8 — touch targets and semantics **[design]**

Lower priority, real. Not visual-polish, so it is last — but it is the same kind of care
the rest of the file already shows.

- **`.dot` 30px → 36px + 8px gap minimum** ([:523](life-in-uk-mock-tests.html#L523)), or
  accept it knowingly. It is behind `.jtog` so it is rare, but 30px with the tap
  highlight disabled is a mis-tap generator.
- **`.rsm .x`** ([:266](life-in-uk-mock-tests.html#L266)) is a ~30px destructive target
  beside a primary one. It is guarded by `confirmDiscard`, so nothing is lost — but
  widen it to a 44px minimum.
- **`.stat.hero`, `.tcard` and `.nextup` are `<div>`s with `onclick` and
  `cursor:pointer`** — not keyboard-reachable, not announced. Given
  [:289](life-in-uk-mock-tests.html#L289) chose `<details>` specifically "because the
  keyboard, find-in-page and print behaviour come for free", this is an inconsistency
  worth closing. `role="button"` + `tabindex="0"` + an Enter/Space handler is the
  minimum; a real `<button>` is better if the layout survives it.

---

## 3. Open decisions — resolve before executing that phase

1. **Phase 4: which three actions get surfaced.** Sweep / Practice mistakes / Random
   exam was chosen by urgency without usage data. If Twist gauntlet is genuinely a
   weekly habit, swap it for Random exam. **Atiq's call.**
2. **The gradient question — deliberately deferred.** The inline review's headline was
   that `.phero`, `.stat.hero` and `.drill` carry three near-identical
   `135deg accent→brand→panel` washes (16/12%, 12/9%, 15/11%) within 400px of each
   other, so none of them reads as the hero. The design agent did not flag them at all;
   its diagnosis was equal-weight cards, fixed structurally. Both readings explain the
   same symptom. **Do nothing here until Phases 1–6 are on the device** — those phases
   separate the three cards, and the problem may dissolve on its own. Re-judge then.

---

## 4. Device verification — Atiq's job, not the agent's

No headless browser. Each of these is a look-at-the-phone check, in this order.

1. **After Phase 1:** the Phase 1 GO criteria above.
2. **After Phase 2, both themes.** Does `.tnum` at 27px still read as a focal point at
   107px wide? And does `#5e93d0` on white (3.20:1, legal only as large text) look
   *acceptable* or merely *legal*? This is the tightest pair in the file and the one
   place to overrule the maths if it looks weak.
3. **After Phase 6:** does `.fchips` actually sit on one row? Margin is ~3px. If it
   wraps, drop `.fchip` to `font-size:12px`.
4. **After Phase 2 + Phase 1.2, scroll the full ~4,000px page** with the first section
   open. Removing 150 shadows is the change most noticeable in the hand and least
   visible in a screenshot.
5. **After Phase 7:** does the hero animating *once* feel less responsive on filter
   taps, or more? Expected: more, because nothing above the filter moves. Judgement
   call, best made with a thumb.

---

## 5. Invariants — do not break these

- **INV-V1.** No change to question content, `S`, saved progress, `lituk_prefs`,
  `lituk_sess_v1`, or any grading path. Presentation only.
- **INV-V2.** Every text pair keeps **4.5:1**, and every large-text exception is
  deliberate and recorded (F-14 is the only one). Both themes.
- **INV-V3.** No webfonts, no CDN, no external assets. The app is precached and
  installable; a font that 404s offline is a worse heading than a plain one
  ([:56](life-in-uk-mock-tests.html#L56)).
- **INV-V4.** Every motion added has a `prefers-reduced-motion` story, and the
  information it carries must survive with motion off.
- **INV-V5.** Desktop must not regress. Both grid changes rely on `auto-fill`/`auto-fit`
  continuing to fan out at 900px — verify at desktop width before committing.

## 6. What is already good — do not sand this off

Both reviews independently said leave these alone:

- The palette and the contrast discipline behind it — `--on-solid`, and `GRP_ACC` picked
  mid-toned so one set clears 3:1 on `--panel` in *both* themes
  ([:60](life-in-uk-mock-tests.html#L60)).
- `--serif` on headings and numbers with `lining-nums tabular-nums` on `.tnum`
  ([:406](life-in-uk-mock-tests.html#L406)) — catching that Baskerville/Palatino/Georgia
  default to old-style figures is a year-one-of-shipping bug most teams never find.
- `--acc` → `--tone` inheritance through `<details>` into every tile. One custom property
  carrying section identity into 45 children is the cleanest idea in the file.
- The `.mix` fingerprint strip. Phase 2 makes it work harder, not different.
- The `.rail` in `.phero`, including the `Math.min(passed,TESTS.length)` guard at
  [:1283](life-in-uk-mock-tests.html#L1283) that stops a 333% bar.
- The iOS plumbing: safe-area insets, `body.modal-open` scroll lock,
  `overflow-x:hidden`, `header.hd-away`.
- `.stat-row`'s orphan rules ([:196-201](life-in-uk-mock-tests.html#L196-L201)) — keep
  them even after Phase 5 shrinks the row.
