-- Child rows checked only their own user_id, and the topic_id foreign key does
-- not look at who owns the topic — so a signed-in user could insert under
-- someone else's topic_id and squat its (topic_id, id) keys, making the owner's
-- next upsert fail its RLS check. Writes now also require owning the topic.
do $$
declare t text;
begin
foreach t in array array['nodes','edges','cards','node_content'] loop
  execute format('drop policy if exists "insert own" on public.%I', t);
  execute format('drop policy if exists "update own" on public.%I', t);
  execute format($f$create policy "insert own" on public.%I for insert to authenticated
    with check ((select auth.uid()) = user_id and exists (
      select 1 from public.topics tp where tp.id = topic_id and tp.user_id = (select auth.uid())))$f$, t);
  execute format($f$create policy "update own" on public.%I for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id and exists (
      select 1 from public.topics tp where tp.id = topic_id and tp.user_id = (select auth.uid())))$f$, t);
end loop;
end $$;
