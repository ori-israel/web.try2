-- ============================================================
-- דיווח משתמש שתשובת המאמן AI לא הייתה טובה (כפתור 👎 בצ'אט).
-- שומר את השאלה+התשובה שסומנו, לסקירה תקופתית של המנהל.
-- להריץ ב-Supabase SQL Editor פעם אחת.
-- ============================================================

create table if not exists public.ai_feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  question   text not null,
  answer     text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_feedback_time on public.ai_feedback (created_at);

alter table public.ai_feedback enable row level security;

-- משתמש יכול רק לכתוב (fire-and-forget מהצ'אט) — לא לקרוא בחזרה, זה לא מיועד להצגה למשתמש
create policy "ai_feedback_insert" on public.ai_feedback
  for insert with check (auth.uid() = user_id);

-- רק מנהל קורא — זה הדוח שהמנהל יעבור עליו מדי פעם
create policy "ai_feedback_admin_select" on public.ai_feedback
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

grant select, insert on public.ai_feedback to authenticated;
