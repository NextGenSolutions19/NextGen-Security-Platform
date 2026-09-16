-- M02 photo storage repair
-- Bucket id must match VISITOR_PHOTO_BUCKET in supabase/functions/_shared/storage-config.ts

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitor-photos',
  'visitor-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Private bucket: no direct authenticated uploads. Edge Functions write via service_role.
-- Guards may read objects stored under their society prefix only.
drop policy if exists visitor_photos_objects_select_society_guard on storage.objects;

create policy visitor_photos_objects_select_society_guard
on storage.objects
for select
to authenticated
using (
  bucket_id = 'visitor-photos'
  and (storage.foldername(name))[1] = (select public.auth_society_id()::text)
);
