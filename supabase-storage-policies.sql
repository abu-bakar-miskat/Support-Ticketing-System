-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Storage setup for the "attachments" bucket
-- Run this in: Supabase Dashboard → SQL Editor  (idempotent — safe to re-run)
--
-- Covers every upload in the app: avatars, tenant/department logos, ticket &
-- project attachments, and public intake-form files. Service-role uploads
-- (intake signed URLs) bypass RLS; the policies below cover authenticated
-- browser uploads that go through the user session.
--
-- Prefer `npx tsx scripts/setup-storage.ts` to create the bucket; this file also
-- creates it so the whole thing can be done from the SQL editor alone.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket if missing, and make sure it's public so getPublicUrl() works.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', true, 52428800) -- 50 MB
on conflict (id) do update set public = true;

-- 2. Policies (drop-then-create so re-running never errors).

-- Allow any authenticated user to upload files
drop policy if exists "authenticated users can upload files" on storage.objects;
create policy "authenticated users can upload files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

-- Allow anyone to read/view files (public bucket)
drop policy if exists "public can read files" on storage.objects;
create policy "public can read files"
  on storage.objects for select to public
  using (bucket_id = 'attachments');

-- Allow authenticated users to update their own files
drop policy if exists "authenticated users can update own files" on storage.objects;
create policy "authenticated users can update own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments' AND owner = auth.uid());

-- Allow authenticated users to delete their own files
drop policy if exists "authenticated users can delete own files" on storage.objects;
create policy "authenticated users can delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' AND owner = auth.uid());
