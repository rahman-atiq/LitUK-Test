# The seven curiosities

Spoilers. Every one of them, and how to reach it.

Seven things are hidden in the study hub. None of them touch the study material
or the scoring — they are decoration, and they stay out of the way until
somebody goes looking. They live in [`app.js`](app.js), so the typed and spoken
triggers work on every page, not just the hub.

Finds are kept in `localStorage` under `lituk_eggs_v1`, per device. They survive
a reload, a rebuild and a service-worker bump; they do not travel between your
phone and your laptop.

---

## The cabinet

The hub footer carries a closed disclosure: **🎖️ Cabinet of curiosities**. Open
it and it lists all seven — found ones by name and their line, unfound ones by
hint only. It is the map, and it is the only in-app place that admits any of
this exists.

## The plaque — the way in on a phone

Six of the seven were originally words you *type at the page*, and a page never
receives a keystroke on iOS unless the caret is in a field — which the typed
triggers ignore on purpose, so the hub's search box stays a search box. On an
iPhone that made six of seven unreachable.

So there is a plaque:

> **Press and hold (about ⅔ of a second) the gold seal at the top of the hub** —
> or the **← Hub** pill in the top-left of any other page — and a small gold
> sheet slides up asking you to *say the word*.

Type a word into it and it fires the moment you finish it; you do not have to
press **Say it**. Capitals, spaces, punctuation and autocorrect's leftovers are
all forgiven. Tap the backdrop, the **×**, or press <kbd>Esc</kbd> to close it.

On a desktop the plaque still works, but you can also just type at the page with
no field focused, which is how these were built.

---

## All seven

### 1. 👑 Royal Assent

| | |
|---|---|
| **On a phone** | Open the plaque and say **`royal assent`** (or `assent`, or `Le Roy le veult`) |
| **On a desktop** | The Konami code: <kbd>↑</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> <kbd>←</kbd> <kbd>→</kbd> <kbd>B</kbd> <kbd>A</kbd> |
| **You get** | A crown drops in over gold confetti — *"Le Roy le veult. Royal Assent granted — the bill is now an Act."* |

The hint is a real test fact: a bill needs Royal Assent from the monarch before
it becomes an Act of Parliament.

### 2. ☕ Put the kettle on

| | |
|---|---|
| **On a phone** | Plaque → **`tea`** |
| **On a desktop** | Type `tea` with no field focused |
| **You get** | A mug rises up the screen, steaming — *"Priorities. Milk in after, and never let anyone tell you otherwise."* |

### 3. 🌧 Typical

| | |
|---|---|
| **On a phone** | Plaque → **`rain`** |
| **On a desktop** | Type `rain` |
| **You get** | Rain across the whole page — *"Typical. Take a coat — you will want it by four."* |

### 4. 🧍 The Queue

| | |
|---|---|
| **On a phone** | Plaque → **`queue`** |
| **On a desktop** | Type `queue` |
| **You get** | A line of people files patiently across the bottom of the screen — *"Not a single person pushed in. A beautiful, orderly line."* |

### 5. 🏹 Hastings

| | |
|---|---|
| **On a phone** | Plaque → **`1066`** |
| **On a desktop** | Type `1066` |
| **You get** | An arrow flies across the page — *"1066. William, Harold, and an arrow. You will not forget it now."* |

### 6. 🙇 No, after you

| | |
|---|---|
| **On a phone** | Plaque → **`sorry`** |
| **On a desktop** | Type `sorry` |
| **You get** | The note itself bows to you, twice — *"No — I'm sorry. Honestly. Entirely my fault."* |

### 7. 🇬🇧 Flutter

| | |
|---|---|
| **On a phone** | **Tap the gold seal at the top of the hub five times**, within about three seconds of each other |
| **On a desktop** | The same five clicks |
| **You get** | The seal itself flutters, and fourteen small Union Flags float up the page — *"Three crosses, one flag, and a very respectable flutter."* |

The seal pulses on every tap, and from the **third** tap the gold ring lights up
— that is the "keep going" signal. Stop for three seconds and the count resets.
Hold instead of tapping and you get the plaque, not the flutter.

---

## Finding all seven

The seventh find triggers a second note a beat later — a full-screen confetti
burst, *"The cabinet is complete — all seven found. Now go and pass the actual
test."* — and the cabinet summary changes to **all 7 found**. The page also
picks up `data-eggs="complete"` on `<html>`, if you ever want to hang something
off it.

## Reduced motion

Anyone whose system asks for less motion gets **no** particle effect at all —
no confetti, no rain, no crown. The note still appears and the find still
counts. Nothing here is gated behind an animation.

## The console, and starting over

On the hub, a desktop console prints how many are left and points at the API:

```js
LitUK.eggs.all()      // every egg: id, name, hint
LitUK.eggs.found()    // the ids you have found on this device
LitUK.eggs.hints()    // hints for the ones you have not
LitUK.eggs.fire("brew")  // fire one by id, without earning it
LitUK.eggs.plaque()   // open the plaque from anywhere
LitUK.eggs.forget()   // wipe every find on this device and start again
```

Ids, in order: `assent`, `brew`, `rain`, `queue`, `hastings`, `sorry`, `flag`.

## One more, somewhere else entirely

[`lituk.html`](lituk.html) — *Study Quest* — is a separate game with its own
secret and its own badge for it. **Triple-tap the fox**, bottom-right, or press
and hold it for about a second. It also honours the Konami code, if you happen
to have a keyboard.
