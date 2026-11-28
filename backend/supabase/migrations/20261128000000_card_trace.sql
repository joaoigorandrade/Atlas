-- One flow (docs/PLAN-FLOW.md §5): a card records where it came from, so a
-- miss can open the Consume section that taught it and the exam can trace a
-- wrong answer to its spine item. All nullable: every card written before the
-- pivot has none, and the web/iOS clients read them as optional.
alter table public.cards
  add column if not exists section text,
  add column if not exists atoms text[],
  add column if not exists spine text[],
  add column if not exists format text
    check (format is null or format in ('cloze', 'qa', 'reversed', 'figure', 'step', 'contrast')),
  add column if not exists sibling_of text;
