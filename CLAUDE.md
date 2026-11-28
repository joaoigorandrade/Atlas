# CLAUDE.md

Read `AGENTS.md` for the stack, commands, layout, and conventions — it is the
single source of truth for agent rules in this repo.

Claude-specific notes:

- `docs/PLAN-FLOW.md` is the product design: one flow (Consume → Explain →
  Perform → Retain → Mock Exam) over a per-concept spine. Consult it before
  adding a surface so new UI reads and writes the shared node state instead of
  inventing its own.
- The visual source of truth is the Claude Design project file
  `Learning Platform.dc.html` — match its tokens via `web/lib/theme.ts` rather than
  eyeballing colors.
