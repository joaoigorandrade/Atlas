-- "Ver figura" may store a Jev-routed SVG next to raster draws.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
where id = 'example-images';
