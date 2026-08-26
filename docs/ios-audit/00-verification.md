# Spot-check of the highest-severity subagent findings (done by the lead, independently)

## VERIFIED — empty-row clobber on a failed library load

`AtlasStore.swift:214` `guard let saved = try? await runs.list(token: token) else { return }`
A failed/offline `runs.list` leaves `library` empty and `graph.nodes` empty, so the shell
shows onboarding. The code's own ponytail comment at :210-213 calls this "wrong but
recoverable — building a map with the same subject upserts the same row". That comment is
the bug: the upsert replaces the row, so `cards`, `calib` and `reviewed` from the real run
are destroyed. Severity **critical** stands.

## VERIFIED — `positions: {}` crashes the web map

`RunSnapshot.swift:115` writes `row["positions"] = row["positions"] ?? .object([:])`, so an
iOS-built run carries an empty positions map. On the web, `components/map/MapCanvas.tsx:274`
reads `const pos = positions[node.id]` and `:306` dereferences `left: pos.x` with **no null
guard** — unlike the edge branch at :227-229, which does guard with `if (!pa || !pb) return null`.
Opening an iOS-built run in the browser throws `TypeError: reading 'x'` on first render.
Severity **high** stands. Cross-client, and only reproducible by using both clients.

## VERIFIED — no token refresh after launch

`refresh` appears exactly once in the whole iOS client, at `AtlasStore.swift:199`, inside
`restore()`. No 401 retry path exists in `RunStore` or `AtlasAPI`. The ponytail at :192-193
admits it. Severity **high** stands.

## CORRECTED — mastered-node CTA is a stub, not the Crucible

A subagent reported the mastered-node CTA "says Retained, opens Crucible". The first half is
right, the second is wrong. `phaseIndex` (`Concept.swift:249`) returns 5 for mastered and 6
for mastered+reviewed; `NodeDetailViewModel.swift:29` clamps with `min(current, 5)`, and
`Phase.allCases[5]` is `.retained`, not `.crucible`. `SessionView.swift:53` renders
`.retained` as `Pending("Revisão")` — a placeholder. So the real defect is: **a mastered
node's primary CTA reads "Começar · Retained" and pushes the learner into an unimplemented
stub screen**, instead of routing to the Review tab. Still **high** — it is the dead end at
the end of every completed node — but the mechanism is a stub, not a mis-routed phase.

## VERIFIED — review cards collide after the first draft (the audit's worst bug)

Three-sided check, all three sides confirmed:

1. `lib/server/generate/retain.ts:79` assigns ``id: `r${i + 1}` `` — indices scoped to one
   request, so every draft returns `r1, r2, r3…` starting from one.
2. The web knows this and re-ids on receipt: `components/atlas/useSpiral.ts:1690` writes
   `` id: `${c.node}-retain-${stamp}-${i}` `` — node + timestamp + index, collision-free.
3. iOS does not re-id. `Data/Warm.swift:281` files with
   `for card in drafted where !cards.contains(where: { $0.card.id == card.id })`, deduping on
   the raw `r1…rN`.
   Consequence: the first draft files `r1…r4`. Every later draft returns ids already present, so
   the guard skips all of them and **no card is ever filed again**. `uncovered` never shrinks, so
   the draft is re-requested and re-billed on every launch, forever, and the deck permanently
   contains only the concepts mastered on day one. Severity **critical** stands. This is the
   single highest-value fix in the whole audit and the one-line nature of it (re-id on receipt)
   makes it the first thing to do.

## VERIFIED — Socratic sends the tutor's critique to the judge as "the question"

`SocraticViewModel.swift:84` appends the learner turn _before_ the judge call; `:90` appends
the tutor's verdict text as a non-learner turn. So on the **second and later** attempts at one
probe, `judgeContext`'s `log.last(where: { !$0.learner })` (`:115`) resolves to the critique,
not the probe. The judge is then told the question was "Not quite — think about what happens
when…" and grades the answer against that. The `?? current.prompt` fallback never fires,
because the log is never empty by then. First attempts are correct, which is why this survives
casual testing — it only corrupts the `near`/`wrong` retry loop, i.e. exactly the learners who
are struggling. Severity **high** stands. Fix is one line: `context["question"] =
.string(current.prompt)`.

## VERIFIED (same excerpt) — the "send it again" comment is false

`SocraticViewModel.swift:77-78` promises "the same answer can be sent again", but `:81` clears
`answer` before the call and the `catch` at `:100-102` only sets `message`. After a judge
failure the learner's text is gone and must be retyped. Severity **medium** stands.
