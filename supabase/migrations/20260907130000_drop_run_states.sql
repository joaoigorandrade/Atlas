-- The old shape, once both clients ship against `/api/v1`.
--
-- Deliberately a separate migration, applied after the deploy rather than with
-- it: the backfill leaves `run_states` in place so a rollback is possible while
-- the new routes are still proving themselves in production. Nothing reads the
-- table from the moment the deploy lands — `lib/persistence.ts` is an API
-- client now and the iOS `RunStore` talks to `/api/v1` — so this is the last
-- step, not part of the cutover.
--
-- Verify before running (each should be 0):
--   select count(*) from public.run_states r
--     left join public.topics t
--       on t.user_id = r.user_id and t.subject = r.subject
--    where t.id is null;

drop trigger if exists run_states_touch_updated_at on public.run_states;
drop function if exists public.touch_run_states_updated_at();
drop table if exists public.run_states;
