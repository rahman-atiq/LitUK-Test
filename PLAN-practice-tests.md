# Practice Tests Merge — Implementation Plan

Fold the 39 LifeInTheUKTest.com practice tests into the hub behind a single shared
engine, without disturbing saved progress.

> Canonical source of truth for execution. Drafted 2026-08-10, decisions resolved the
> same day, to be executed in a fresh session. All findings below were verified
> against the live site and the working tree on that date.

## Decided

- **Hosting** — unchanged. GitHub Pages, origin `rahman-atiq.github.io`, repo stays
  public for now. Because the origin does not move, existing `localStorage` is safe
  by default.
- **Architecture** — one engine, one data file per source bank.
- **`lituk.html`** — hidden from the hub, file retained on disk.
- **Execution** — fresh session. Export/import ships and is verified on device before
  any other app code changes, so every later phase is recoverable.
- **Discoverability** — every page carries `<meta name="robots" content="noindex">`.
  Repo and deployed site both stay public; this reduces discovery, it does not change
  the legal position. See Phase 4.
- **Private hosting** — out of scope. Parked as a contingency in
  [PLAN-private-hosting.md](PLAN-private-hosting.md); every option there changes the
  origin, so it can only follow Phase 1.

### Decisions resolved 2026-08-10

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Shared ids for the 126 cross-test repeats? | **Yes.** One question, one SR card — 810 ids across 936 slots. |
| 2 | The 4 questions already in the Britizen bank | **Fresh ids.** Keeps INV-2 a clean mechanical rule; accepts 4 duplicate cards across banks. |
| 3 | Test numbering 101–139 | **Confirmed.** |
| 4 | Export / import | **In scope**, and promoted to Phase 1 — ahead of every other app change. |

---

## 1. Verified findings

Source: <https://lifeintheuktest.com/practice-tests/> — 39 tests at `/test-1/` …
`/test-39/`. Pages are server-rendered; each carries its full question set in a
`.faq_container` block including correct answers, explanations and chapter
references. `robots.txt` permits fetching these paths.

| Metric | Value |
| --- | --- |
| Questions scraped | 936 (39 × 24) |
| Parsed without error | 936 / 936 |
| Unique within the scrape | 810 (126 cross-test repeats) |
| Already present in the existing bank | 4 |
| Net new unique questions | 806 |
| Merged unique bank | 1,858 |
| Multi-answer questions | 153 |
| Options per question | 2, 3 or 4 |
| Explanations present | 935 / 936 |
| Topic auto-mapped from the Reference line | 932 / 936 (4 manual) |
| Compact JSON size | ~350 KB |

Existing bank for comparison: 1,080 entries, of which 1,052 are unique by
text + option set — 28 content-level repeats already carry distinct `g` ids.

The overlap of only 4 questions is the finding that justifies the whole exercise:
this is additive content, not a re-skin of what you already have.

---

## 2. Storage contract

State lives in `localStorage` under `lituk_v1`, with preferences separately under
`lituk_prefs`. The engine loads it as:

```js
Object.assign(structuredClone(DEFAULT), JSON.parse(localStorage.getItem(LS)) || {})
```

A **shallow merge** — so adding new top-level fields is safe and existing data
survives untouched. The keying is what matters:

- `S.tests[n]` — keyed by **test number**
- `S.sr[g]`, `S.mistakes[g]`, `S.flags[g]` — keyed by **question id**

### Invariants

| ID | Invariant |
| --- | --- |
| INV-1 | `lituk_v1` and `lituk_prefs` key names never change. |
| INV-2 | New question ids start at 1080. Existing ids 0–1079 are never renumbered. |
| INV-3 | New test numbers are 101–139. Existing 1–45 are untouched. |
| INV-4 | State changes are additive only. New top-level fields are safe; renames and reshapes are not. |
| INV-5 | Origin stays `rahman-atiq.github.io`. `localStorage` is origin-scoped — a host move wipes progress. Satisfied by the hosting decision. |

Violating INV-2 or INV-3 does not throw. It silently reattaches spaced-repetition
boxes and mistake history to the wrong questions — corruption you would not notice
for weeks. The Phase 5 validator exists specifically to make that impossible.

---

## 3. Phases

### Phase 0 — Preserve the scrape *(inert)*

The validated scraper currently exists only in an ephemeral session scratchpad and
will not survive. Recreate it as `tools/fetch-practice-tests.mjs` (source in
Appendix A), caching pages to `tools/.cache/practice-tests/`. The repo has no
`.gitignore` — add one covering that cache path.

Nothing here touches app code or the device.

**GO criteria** — `node tools/fetch-practice-tests.mjs` reports 39 tests × 24
questions with 0 parse problems.

### Phase 1 — Export / import *(ships and is verified first)*

Orthogonal to everything else: it reads and writes the `lituk_v1` and `lituk_prefs`
keys directly and never touches bank structure, so it needs no rework after the
refactor. Shipping it first converts every later phase from *careful* to
*recoverable*.

1. **Export** — serialise both keys into one timestamped JSON file and download it.
2. **Import** — file picker → parse → validate shape → write both keys → reload.
3. Refuse anything that is not recognisably a `lituk_v1` payload, and confirm before
   overwriting existing progress.
4. Both controls live in the existing settings modal.

**GO criteria** — export on the phone; in a private tab, clear site data and import
the file back; test bests, drill streak, open mistakes and SR state all return
identically. *An untested backup is not a backup — do the restore.*

### Phase 2 — Refactor to one engine, zero content change

1. Extract `DATA` (line 234 of `life-in-uk-mock-tests.html`) into `mock-data.js` as a
   bank registration:

   ```js
   (window.LITUK_BANKS = window.LITUK_BANKS || []).push({
     id: "mock", label: "Mock Tests", source: "Britizen",
     sourceUrl: "https://britizen.uk", passmark: 18, perTest: 24, tests: [ ... ]
   });
   ```

2. Engine reads `window.LITUK_BANKS`. Six call sites to change — grep for `DATA.`:
   `DATA.tests` ×4 (the `QByG` build, the dashboard tests grid, the dashboard tile
   map, and `bestByTest` in `renderStats`), plus `DATA.passmark` and `DATA.topics`.
   `TOPICS` becomes an engine constant; `PASSMARK` stays 18, with the validator
   asserting every bank agrees.
3. **Fix `tools/build-search-index.mjs:145`.** It regexes `const DATA=` out of the
   HTML and will throw the moment the data moves. Point it at the data files
   instead. *This is the one guaranteed breakage in the whole plan.*
4. Load order in the HTML: data files before the engine, `defer` on all of them.

**GO criteria** — still exactly 45 tests; `lituk_v1` byte-identical after a full load
and navigation; dashboard numbers match a pre-refactor screenshot; search still
deep-links `#q=<g>`.

**This commit is the revert point.** If Phase 3 goes wrong, this still works.

### Phase 3 — Add the 39

1. Generate `practice-data.js` — ids **1080–1889** (810 ids; repeated questions share
   one id), tests **101–139**, topic index from the Reference line, the 4 unmapped
   stragglers assigned by hand.
2. Bank metadata carries the source label and URL; tiles show provenance
   (*Britizen* / *LifeInTheUKTest.com*).
3. Dashboard: two labelled sections. Delint the hardcoded `/45`, the
   "45 official-style mock tests" copy, and the tests-passed denominator.

**GO criteria** — validator passes; 84 tiles render; every pre-existing test stat is
intact; all new tests read "New".

### Phase 4 — Hub and housekeeping

- `index.html` — remove the `lituk.html` tile (line 243) and its three progress
  reads: `luk_quest_save_v1` (line 369), the `hasProgress` term (line 383), and the
  "Study Quest: level N" extra (line 416). Update `TOTAL_MOCKS`, the `seen < 1080`
  threshold, and the "45 tests" tag (line 255).
- **`noindex` on every page.** Add `<meta name="robots" content="noindex">` to the
  shared `<head>` block in `tools/patch-pages.mjs` so it propagates everywhere, then
  re-run the patcher. Use the meta tag, **not** a `robots.txt` disallow — a disallow
  rule stops crawlers reading the page at all, so they never see the `noindex` and
  any already-indexed URLs linger. A `robots.txt` disallow can follow later, once the
  site has dropped out of the index.
- **AI crawler blocking — needs a second repo.** `robots.txt` is only honoured at the
  *domain root*. This is a project site at `https://rahman-atiq.github.io/LitUK-Test/`
  (verified: no custom domain), so a `robots.txt` committed here is served at
  `/LitUK-Test/robots.txt` and **never read by anything**. No `rahman-atiq.github.io`
  user-site repo currently exists, which means `/robots.txt` 404s and compliant
  crawlers read that as "allow everything".

  To actually block them, create a public `rahman-atiq.github.io` repo containing one
  file — `robots.txt` — scoped to this path so other project sites are unaffected:

  ```
  # Search engines may crawl: they need to read the noindex meta tag to drop
  # the site from their index. Nothing here is an access control.
  User-agent: *
  Disallow:

  # AI training, dataset and retrieval crawlers.
  # Retrieval bots are blocked too — the goal here is invisibility, not
  # AI-search visibility, which is the opposite of most published guidance.
  User-agent: GPTBot
  User-agent: OAI-SearchBot
  User-agent: ChatGPT-User
  User-agent: ClaudeBot
  User-agent: Claude-User
  User-agent: Claude-SearchBot
  User-agent: anthropic-ai
  User-agent: CCBot
  User-agent: Google-Extended
  User-agent: Applebot-Extended
  User-agent: meta-externalagent
  User-agent: PerplexityBot
  User-agent: Bytespider
  User-agent: Amazonbot
  User-agent: cohere-ai
  User-agent: Diffbot
  User-agent: omgilibot
  User-agent: ImagesiftBot
  User-agent: Timpibot
  Disallow: /LitUK-Test/
  ```

  Blocking `GPTBot` and `ClaudeBot` does **not** cover `CCBot` — Common Crawl is an
  independent pipeline feeding many downstream datasets, and is the single most
  important line here.

  Do **not** add `noai` / `noimageai` meta tags. They are not honoured by any major
  crawler and only manufacture false confidence.

  Limits, stated plainly: this is an honour system, user agents are spoofable, GitHub
  Pages cannot set headers or run a WAF, and none of it retracts anything already
  crawled. It also does nothing about the **public repo**, where the same data files
  sit under github.com's robots.txt, not yours. Only making the repo private closes
  that.
- `sw.js` — bump `VERSION`, add both data files, drop `./lituk.html` from
  `EVERYTHING`.
- Rebuild `search-index.js`. It grows from ~451 KB to roughly 800 KB. `index.html`
  injects it dynamically (line 462) — confirm it stays lazy, and consider gating
  injection on first search focus.

### Phase 5 — Verification

`tools/validate-banks.mjs` asserts:

- no duplicate `g` across banks
- no duplicate test `n` across banks
- every new `g` ≥ 1080
- every question has at least one correct option
- every test has exactly 24 questions
- every `p` is in 0–4
- all banks agree on `passmark`

On the phone: snapshot `lituk_v1` → deploy → hard reload → compare. Old test bests,
drill streak, open mistakes and SR due-count must all match exactly. With Phase 1
shipped, an exported file from before the deploy is the fallback.

---

## 4. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `build-search-index.mjs` regexes `DATA` out of the HTML; breaks when it moves | **Certain** | Fixed inside Phase 2, before Phase 3 |
| Question id collision reattaches SR boxes and mistake history to wrong questions | **High** | INV-2 + validator |
| Test number collision merges two tests' stats | **High** | INV-3 + validator |
| Service worker serves a cached engine against a newer data file — skew is newly possible now they are separate files | Medium | `VERSION` bump; engine shape-checks each bank at boot |
| Page weight: search index ~800 KB, engine + banks ~800 KB | Medium | Keep the search index lazily injected; data files cache independently |
| `QByG[g]` is last-write-wins, so a question shared across tests reports the later one in `_test` | Low | Cosmetic — only affects the "Take Test N" button in the question modal |
| iOS evicts `localStorage` after 7 idle days when not installed to home screen | High impact, pre-existing | Install to home screen; Phase 1 export/import |

---

## 5. Appendix A — the validated parser

100% parse rate across all 39 pages. The one non-obvious bit: correct answers arrive
as a comma-joined string, and splitting on commas shreds any option that itself
contains a comma. Matching option texts **longest-first** and asserting nothing is
left over is what gets 936/936.

```js
const ents = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'",
  '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”',
  '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ', '&hellip;': '…',
  '&pound;': '£', '&eacute;': 'é' };
const dec = s => s.replace(/&#(\d+);|&[a-z]+;/gi, m =>
  ents[m.toLowerCase()] ?? (m[1] === '#' ? String.fromCharCode(+m.slice(2, -1)) : m));
const txt = h => dec(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
  .replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').trim();

function parse(html) {
  const faqs = [...html.matchAll(
    /<div class="faq">([\s\S]*?)<div class="faq_answer_container">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)];
  const out = [];
  for (const [, qBlock, aBlock] of faqs) {
    const title = qBlock.match(/<div class="question-title">([\s\S]*?)<\/div>/);
    if (!title) continue;
    const t = txt(title[1]).replace(/^\d+\.\s*/, '');
    const opts = [...qBlock.matchAll(/<span class="options">([\s\S]*?)<\/span>/g)].map(m => txt(m[1]));
    const ansRaw = aBlock.match(/<strong>Correct Answer:<\/strong>([\s\S]*?)<br\s*\/?>/);
    const expl = aBlock.match(/<strong>Explanation:<\/strong>([\s\S]*?)<br\s*\/?>\s*<strong>Reference:/);
    const ref = aBlock.match(/<strong>Reference:<\/strong>([\s\S]*?)<br\s*\/?>/);
    if (!ansRaw || !opts.length) { out.push({ bad: 'missing', t }); continue; }

    // Resolve the comma-joined answer string against real option texts, longest
    // first, so options containing commas cannot be shredded by a naive split.
    let rest = txt(ansRaw[1]);
    const picked = new Set();
    for (const o of [...opts].sort((a, b) => b.length - a.length)) {
      const i = rest.indexOf(o);
      if (i >= 0) { picked.add(opts.indexOf(o)); rest = rest.slice(0, i) + rest.slice(i + o.length); }
    }
    const leftover = rest.replace(/[,\s]/g, '');
    out.push({
      t, o: opts.map((text, i) => [text, picked.has(i) ? 1 : 0]),
      e: expl ? txt(expl[1]) : '', ref: ref ? txt(ref[1]) : '',
      bad: !picked.size ? 'no-answer' : leftover ? 'leftover:' + leftover : null,
    });
  }
  return out;
}
```

Fetch politely: a real `User-Agent`, 1.2 s between requests, and cache each page to
disk so re-runs cost nothing.

### Topic mapping

The `Reference:` line yields the chapter, which maps onto the existing `DATA.topics`
index order:

```js
const CH2TOPIC = { 1: 3, 2: 4, 3: 1, 4: 0, 5: 2 };
//  1 The Values and principles of the UK      -> 3
//  2 What is the UK?                          -> 4
//  3 A long and illustrious history           -> 1
//  4 A modern, thriving society               -> 0
//  5 The UK government, the law and your role -> 2
```

Chapter references are inconsistently formatted on the site (missing prefixes,
typos such as "the law and you role", stray spacing), so fall back to matching
distinctive words in the reference text — `government`, `illustrious`,
`middle ages`, `century`, `thriving`, `values`/`principles`, `what is the uk`.
That combination maps 932 of 936. The remaining 4 are assigned by hand.

### Deduplication key

Both the internal-repeat detection and the cross-bank overlap check use the same
key — question text plus the **sorted** option set, punctuation and case stripped:

```js
const norm = t => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const key  = q => norm(q.t) + "||" + q.o.map(o => norm(o[0])).sort().join("|");
```

Question text alone is not enough: generic stems such as *"Which of these statements
is correct?"* recur many times with completely different options, and keying on text
alone reports hundreds of false collisions.
