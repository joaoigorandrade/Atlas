-- The review log, and suspension.
--
-- `cards` held only each card's latest scheduler state, so every review was
-- thrown away the moment the next one replaced it: nothing to fit FSRS's
-- parameters against, nothing to undo a mis-tap with, nothing to count leeches
-- or accuracy from. One row per review now, written by the server alongside the
-- grade (`POST /api/v1/topics/:id/review`); `before` is the card's state ahead
-- of the review, which is what an undo puts back.
create table public.card_reviews (
  id bigint generated always as identity primary key,
  topic_id uuid not null references public.topics (id) on delete cascade,
  card_id text not null,
  user_id uuid not null default auth.uid(),
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  reviewed_at timestamptz not null,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  state smallint not null,
  elapsed_days double precision not null,
  scheduled_days double precision not null,
  stability double precision not null,
  difficulty double precision not null,
  -- Reps after this review: orders one card's log without trusting a clock
  -- (an offline grade arrives with an older `reviewed_at`).
  reps integer not null,
  before jsonb not null,
  created_at timestamptz not null default now()
);
create index card_reviews_card on public.card_reviews (topic_id, card_id, reps desc);
create index card_reviews_user on public.card_reviews (user_id);

alter table public.card_reviews enable row level security;
create policy "read own" on public.card_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own" on public.card_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.topics tp where tp.id = topic_id and tp.user_id = (select auth.uid())));
create policy "delete own" on public.card_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A card out of rotation: suspended by hand, or by the scheduler once it lapsed
-- often enough to be a leech. A column rather than a content field because it
-- is server-owned, like `fsrs`: a client's card write never changes it.
alter table public.cards add column suspended boolean not null default false;
