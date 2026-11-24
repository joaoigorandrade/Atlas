-- Per-learner cache of worked-example images (MAI-Image via OpenRouter).
-- Private, no policies: only the service role (the /api/example-image route)
-- reads or writes, under <user id>/<prompt hash>; learners get signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('example-images', 'example-images', false, 4194304,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
