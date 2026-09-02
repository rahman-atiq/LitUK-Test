# The warm layer

Everything in [`cheer.js`](cheer.js), loaded on the hub and on Practice Tests.

It exists because the seven curiosities in [`EASTER-EGGS.md`](EASTER-EGGS.md)
were a flop, and the reason they flopped is worth writing down: **they were
hidden.** Every one of them needed a secret word or a tap-count, and nobody
revising three days before a test goes hunting for secrets. Confetti nobody
sees is not a feature.

So this layer follows three rules instead:

1. **Nothing is hidden.** It is on screen, on the way to the work.
2. **It is earned by studying**, never by knowing a password.
3. **It is addressed to the person doing it, by name.**

It reads `lituk_v1` and **never writes to it**. Its own keys are
`lituk_cheer_v1` (the shelf) and `lituk_who_v1` (who is holding the phone).
Nothing here can touch a score, a schedule or a question bank.

---

## Changing the names or the date

Top of [`cheer.js`](cheer.js), and nothing else needs editing:

```js
var PEOPLE = {
  her: { id:"her", name:"Gulfeshan", nicks:["Gulfeshan","Gullu","Bunty"], them:"Atiq" },
  him: { id:"him", name:"Atiq",      nicks:["Atiq"],                      them:"Gullu" }
};
var EXAM_DATE = "2026-09-05";
```

`nicks` rotate by day — that is the whole trick behind it sounding like a
person rather than a mail merge. `EXAM_DATE` is only a fallback: if the
Practice Tests page has an exam date set, that one wins.

The first visit asks who is revising. Tap the greeting any time to switch.

## The four pieces

**The card, on the hub.** Greeting, a countdown pill, one line for the day,
and — the part that actually earns its place — *the case for the defence*: her
own numbers, quoted back at her. Exam nerves are a feeling, and a feeling
loses an argument with `1,284 questions answered, 91% pass chance`. The last
four days replace the rotating line with something written for that day; each
has a second version for a device with nothing in the store yet, so it never
points at numbers that are not on screen.

**The shelf.** Eighteen badges, every one earned by revising. They grade
themselves against the store on every load, so the first run backfills work
already done — silently, because announcing fourteen badges at once is a popup,
not a moment. After that they arrive one at a time as they are earned.

**The results screen.** Practice Tests already said the score; it never said
anything *to the person who just sat it*. One paragraph now does, pitched to
how it went — warmest exactly where the old copy was coldest, which was a near
miss reported as a subtraction. Full marks get confetti. Nothing else does.

**The brag button.** On a good result only, one tap hands `22/24 ✅` to the
phone's share sheet, or the clipboard on a desktop. No backend, no accounts —
that is the entire "two of you" feature and it needs to be no bigger.

## Reduced motion

`prefers-reduced-motion` suppresses the confetti outright. Every note, badge
and reaction still appears — nothing here is gated behind an animation.

## The console

```js
LitUKCheer.badges()     // every badge, and whether it is on the shelf
LitUKCheer.stats()      // what the layer thinks it knows about you
LitUKCheer.days()       // sleeps to go
LitUKCheer.setWho("him")
LitUKCheer.forget()     // empty the shelf and re-grade from scratch
```
