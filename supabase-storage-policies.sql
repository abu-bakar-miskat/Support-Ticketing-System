-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Storage Policies for the "attachments" bucket
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Make bucket public so getPublicUrl() works for all files
update storage.buckets set public = true where id = 'attachments';

-- Allow any authenticated user to upload files
create policy "authenticated users can upload files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

-- Allow anyone to read/view files (public bucket)
create policy "public can read files"
  on storage.objects for select to public
  using (bucket_id = 'attachments');

-- Allow authenticated users to update their own files
create policy "authenticated users can update own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments' AND owner = auth.uid());

-- Allow authenticated users to delete their own files
create policy "authenticated users can delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' AND owner = auth.uid());
