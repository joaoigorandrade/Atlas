# Atlas iOS — Retention ("Revisão") deep test, 2026-09-09

Tested against **production** (`https://atlas-tan-two.vercel.app`, `dpl_GmAqFezCtSJLuxvBnnUiD9VaBtm6`)
on the iOS Simulator, signed in as the real account, topic **"Fases da mitose"**
(1 mastered node, 2 gaps, 0 cards). Evidence: simulator screenshots, the app's
own `[Networking]` console log, Vercel runtime logs, and the Supabase tables.

Files in scope: `Features/Review/*`, `Domain/Retain.swift`, the Retain half of
`Data/AtlasStore.swift` and `Data/Warm.swift`, `app/api/v1/topics/[id]/review`,
`lib/fsrs.ts`, `lib/server/generate/retain.ts`, `components/atlas/useSpiral.ts`.

---

## Headline: the Review tab is dead in production

The screen cannot build a deck for any learner who does not already have cards.
It shows *"Não conseguimos montar sua revisão agora."* and stays there forever.
Confirmed live, twice, on the deployed build.

| #  | Finding                                                                                          | Where                                          | Sev          |
| -- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------ |
| 1  | `RetainContent.forecast` is non-optional; `/api/generate` kind=retain never sends it → every card draft fails to decode, silently | `Domain/Retain.swift:118`, `lib/server/generate/retain.ts:100` | **critical** |
| 2  | Drafted cards are filed with the server's request-scoped ids `r1…rN`, so the second draft files zero cards | `Data/Warm.swift:418`, vs `useSpiral.ts:1689`  | **critical** |
| 3  | The deck is re-read from the server before the 2 s debounce has saved the cards just drafted → first visit is always empty | `ReviewViewModel.swift:76`, `AtlasStore.swift:893` | **high**     |
| 4  | A miss flags the node Shaky only when it was `.mastered`; the web flags any node | `ReviewViewModel.swift:110` vs `useSpiral.ts:1765` | **high**     |
| 5  | A failure is a dead end — no retry control anywhere on the screen             | `ReviewView.swift:54`                          | high         |
| 6  | "Nada para revisar ainda. Aprenda um conceito e ele volta aqui." is shown to a learner with a full, not-yet-due deck | `ReviewViewModel.swift:52`                     | high         |
| 7  | `store.forecast` is fetched on every deck load and never rendered — the whole retention-health panel is missing on iOS | `AtlasStore.swift:33`                          | medium       |
| 8  | No done-for-today surface. The web ends on streak + nodes lit + a CTA; iOS ends on one grey sentence in the middle of a blank screen | `ReviewView.swift:54` vs `RetainFinished.tsx`  | medium       |
| 9  | A requeued (missed) card is graded on the server a second time, which the code's own comment says must not happen | `ReviewViewModel.swift:104`                    | medium       |
| 10 | `recordCalib` truncates its running average; the web rounds — the two clients drift a point per reading | `AtlasStore.swift:475` vs `useRunState.ts:260` | low          |
| 11 | `dueCount` counts a card with an unparseable `due` as due — an undecodable row inflates the dashboard forever | `AtlasStore.swift:826`                         | low          |
| 12 | `warmRetain()` re-runs the generation on every app open while cards fail to file; Home never warms it at all, so opening Review from Home is always cold | `MapView.swift:63`                             | low          |

### How #1 was confirmed

The app's own log, on the deployed build:

```
[Networking][RESPONSE] POST https://atlas-tan-two.vercel.app/api/generate
Status: 200
Response Body: { "content" : { "budgetMin" : 15, "cards" : [ … 3 cards … ] } }
```

No `forecast` key. `RetainContent` declares `public let forecast: [ForecastRow]`,
so `JSONDecoder` throws `keyNotFound`. The generator dropped `forecast` on purpose
(it is rebuilt from real due dates by `forecastRows`) — but only the `/api/v1/…/review`
response carries it, and both responses decode into the same Swift type.

`cards` for this topic in Postgres: **0 rows**, after four separate retain
generations across four app launches. Every one was paid for and thrown away.

---

## Brainstorm — value to the learner

What Review is *for* is the one thing the app has that Anki plus a chatbot does
not: a miss is not a reschedule, it is a node going Shaky on a map and pulling
attention back. Today the phone loses most of that.

1. **Say when the next card is due.** "Volte amanhã" is a guess. FSRS knows the
   date. A learner who is told "o próximo cartão volta em 3 dias" trusts the
   scheduler; one told "amanhã" and finding an empty queue stops trusting it.
2. **Show retention health on the empty screen.** The forecast is already
   fetched and thrown away. Due now / this week / consolidated turns a blank
   screen into evidence that the work is holding.
3. **End the session on something.** The web ends on a streak, a count and a lit
   node. The phone ends on a grey sentence — the exact moment the app should be
   earning tomorrow's return, it says nothing.
4. **Close the calibration loop out loud.** The tap-before-flip is the app's best
   idea and the learner never sees what it bought. A one-line verdict at the end
   of the pass ("você acertou 3 de 4, mas se deu 'sólido' nas duas que errou")
   teaches the feeling, which is the whole point of the curve.
5. **Make the miss visible on the map.** The web toasts "'X' marcado como
   Instável". The phone flags it silently, so the alive-loop happens off-screen.

## Brainstorm — feature design

- **One screen, three states, none of them blank.** Deck / done / waiting. The
  waiting state should carry the forecast and the next due date; the done state
  should carry the pass's result. A centred grey sentence on an otherwise empty
  screen is what every one of these bugs looks like from the outside, which is
  also why #1 went unnoticed.
- **A failure must offer the retry.** Generation is flaky by nature; the only
  recovery today is force-quitting the app.
- **Parity is not optional here.** The scheduler was deliberately centralised on
  the server so the two clients agree. Card ids (#2) and the Shaky rule (#4)
  are the same class of drift, still open, and they corrupt shared rows rather
  than just looking different.
- **Budget, not card count.** Already right — the header says minutes. Keep it.

---

## Round 2 — what the fixes turned up

Fixing #1 exposed the bug underneath it. `ReviewView` keyed its `.task` on
`store.cards.count` so a new concept would refresh the screen — but *drafting
cards is what changes that count*, so SwiftUI cancelled the task mid-draft. The
PUT that files the cards died 8 ms in (surfacing as "Sem conexão · não salvo"),
and the restarted pass read an empty deck back off the server and settled on
"fila limpa". Caught in the app's own network log; the task is now unkeyed.

Two more found by driving the fixed deck:

- The rail marked a missed card's requeued slot with its grade before the
  learner had answered it — `results` was keyed by card id, and a requeue keeps
  its id. Now keyed by deck position, which also makes the pass tally honest
  (1/2 recalled, not 1/1).
- Cloze halves were concatenated raw: "metáfase,\_\_\_\_\_e telófase." The
  browser lays the blank out as its own element and never had to care; here the
  string *is* the layout, so it owns the spaces.

And one on the server: the pt-BR forecast counts read "0 cards" — the
Portuguese copy in `lib/fsrs.ts` interpolated the English word.

## Verified end to end, against production

Deck loads (3 cards) → confidence tap → reveal with the scheduler's real
intervals on all four buttons → miss → re-explanation, calibration line, requeue
→ done-for-today with the pass tally and the next due time → calibration curve
reads the new sample. Postgres after the pass: three cards rescheduled with real
FSRS state, `ciclo-celular` = `shaky` / `review-miss` / `reviewed = true`.

## Out of scope, still red

`npm run size` fails on `main` for two files this change never touches —
`lib/server/job.ts` (707 > 689) and `lib/server/generate/judge.ts` (507 > 499).
Pre-existing; splitting them is its own change.

## What is *not* broken

Checked and correct: the confidence → grade → calibration pass; grade buttons
carry the scheduler's real intervals from `intervalLabels`; cards, calib and
`reviewed` survive relaunch; the calibration curve is safe at 0 and 1 readings
and carries a VoiceOver label; the streak rolls at the learner's local midnight;
copy exists in both languages, plurals included; grading does not block the deck.
