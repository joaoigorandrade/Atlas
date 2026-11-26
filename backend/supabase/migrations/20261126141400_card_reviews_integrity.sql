-- The review log's two missing guarantees.
--
-- One review per rep: `reps` is the card's rep count after the review, so two
-- rows with the same (card, reps) mean two grades both read the same state and
-- both wrote — the race `writeOwned`'s compare-and-swap now refuses. This is
-- the backstop under it, and it replaces the plain index the undo reads by.
drop index if exists public.card_reviews_card;
create unique index card_reviews_card on public.card_reviews (topic_id, card_id, reps desc);

-- A review belongs to its card: deleting a card used to leave its history
-- behind, orphaned, for an undo or an optimizer to trip over.
alter table public.card_reviews
  add constraint card_reviews_card_fk foreign key (topic_id, card_id)
  references public.cards (topic_id, id) on delete cascade;
