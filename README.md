# Atlas — The Learning Platform

> A web application that takes any topic and moves a learner through a closed spiral: **plan → consume → question → teach back → connect → apply → retain**, with **calibration** and **adherence** woven through every surface. The concept map is the spine; mastery state is the blood that flows through all of it.

Atlas is **not** a linear course. It is a **living knowledge map** you act upon:

- **The map is home base.** Every subject is a directed graph of concept **nodes** connected by prerequisite **edges**, laid out foundations-to-frontier.
- **The phases are actions on a node**, not screens you walk through once. You always return to the map.
- **Everything reads and writes node state.** A Socratic session, a failed card, a botched application problem — all update the same mastery state and can spawn new nodes. That write-back is what makes the app a *spiral* instead of a checklist.

The three top-level surfaces are **Map** (the whole subject as a living graph — your home), **Session** (where learning happens, one node at a time), and **Review** (retention, surfaced daily). A thin **Analytics/Calibration** layer sits under all three, and an **Adherence** system (streaks, momentum, honest queue) wraps the whole experience.

The complete product specification lives in [`docs/SPEC.md`](docs/SPEC.md).

## Node mastery states

Every node is always in exactly one state, shown by color everywhere it appears:

| State | Meaning | Visual |
|---|---|---|
| **Unknown** | Not yet assessed or learned | Grey, dim |
| **Frontier** | Prerequisites met — ready to learn now (the ZPD) | Glowing / pulsing |
| **Learning** | In progress this session | Blue |
| **Shaky** | Learned but failing reviews or applications | Amber |
| **Mastered** | Understood + retained + *applied* in novel context | Green |
| **Gap** | A sub-concept spawned from a detected failure | Red, attached under its parent |

Mastery is only awarded when a concept has been **understood, retained, and successfully transferred** — not on recall alone.

## What's implemented

**First Run / Onboarding** (spec §2), built with Next.js from the [Learning Platform design](https://claude.ai/design/p/ede1cd84-a3be-42e4-a274-5190dbd696e4?file=Learning+Platform.dc.html):

1. **Welcome** — "What do you want to learn?" with goal conditioning (exam / project / mastery), interests for personalized analogies, and a daily target that becomes the streak unit and honest-queue budget.
2. **Building your map** — the concept DAG animates into place, foundations first.
3. **Placement diagnostic** — three adaptive questions; the map colors live as branches prune and the frontier lights up.
4. **The Map (home)** — pan/zoom/drag canvas, glowing frontier, prerequisite-chain highlighting on hover, node detail rail with the phase spiral, search, momentum replay, streak and honest review queue in the top bar.

The session phases (Consume, Socratic, Feynman, Connect, Crucible, Retain) are the next milestones — see the spec for how each reads and writes node state.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other commands:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

## Project structure

```
app/                 Next.js App Router (layout, fonts, global keyframes)
components/
  AtlasApp.tsx       Top-level client state machine (welcome → building → diagnostic → map)
  onboarding/        Welcome, Building overlay, Diagnostic panel
  map/               Map canvas, top bar, left rail, node detail rail
lib/
  curriculum.ts      Concept graph, mastery-state vocabulary, diagnostic script
  theme.ts           Design tokens (colors, fonts) from the design file
docs/SPEC.md         The complete final-product specification
```

## Tech

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- No UI framework — styling follows the design file's tokens directly (`lib/theme.ts`)
- Fonts: Newsreader (serif), Instrument Sans (sans), Spline Sans Mono (mono) via `next/font`

## For AI coding agents

Agent rules live in [`AGENTS.md`](AGENTS.md) (the open cross-tool standard) with a [`CLAUDE.md`](CLAUDE.md) pointer for Claude Code.
