# CLAUDE.md

Read `AGENTS.md` for the stack, commands, layout, and conventions — it is the
single source of truth for agent rules in this repo.

Claude-specific notes:

- The product spec in `docs/SPEC.md` explains every screen; consult it before
  adding a surface so new UI reads and writes the shared node mastery state
  instead of inventing its own.
- The visual source of truth is the Claude Design project file
  `Learning Platform.dc.html` — match its tokens via `lib/theme.ts` rather than
  eyeballing colors.
