-- ============================================================
-- Progress Photos Migration
-- הרץ את זה ב-Supabase SQL Editor
-- ============================================================

-- 1. טבלה
create table if not exists public.progress_photos (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid references auth.users not null,
    storage_path text not null,
    uploaded_at  timestamptz default now()
);

-- 2. RLS
alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos_user_all"  on public.progress_photos;
drop policy if exists "progress_photos_admin_select" on public.progress_photos;

create policy "progress_photos_user_all" on public.progress_photos
    for all using (auth.uid() = user_id);

create policy "progress_photos_admin_select" on public.progress_photos
    for select using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

-- 3. הרשאות
grant all on public.progress_photos to authenticated;

-- ============================================================
-- Storage Bucket — צור ידנית ב-Supabase Dashboard:
--   Storage > New bucket > שם: progress-photos > Public: כן
--
-- אחר כך הרץ את ה-policies הבאות:
-- ============================================================

-- Policy: לקוח יכול להעלות לתיקיה שלו בלבד
create policy "progress_photos_upload"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'progress-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: לקוח יכול למחוק מתיקיה שלו, מנהל יכול למחוק הכל
create policy "progress_photos_delete"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'progress-photos'
        and (
            (storage.foldername(name))[1] = auth.uid()::text
            or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
        )
    );

-- Policy: גישה ציבורית לקריאה (כי הבאקט public)
create policy "progress_photos_read"
    on storage.objects for select
    to public
    using (bucket_id = 'progress-photos');
