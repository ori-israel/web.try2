-- ============================================================
-- Cardio Log Migration — יומן ביצועי אירובי בפועל
-- הרץ את זה ב-Supabase SQL Editor
-- ============================================================
-- מטרה: לשמור כל אירובי שבוצע בפועל (תאריך, סוג, דקות),
--       כדי לחשב התקדמות שבועית והיסטוריה עתידית.
-- ============================================================

-- 1. טבלה
create table if not exists public.cardio_log (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users not null,
    date        date not null,
    cardio_type text not null,
    minutes     integer not null,
    created_at  timestamptz default now(),
    unique(user_id, date)
);

-- אינדקס לשליפה מהירה לפי משתמש + תאריך
create index if not exists cardio_log_user_date_idx
    on public.cardio_log (user_id, date);

-- 2. RLS
alter table public.cardio_log enable row level security;

drop policy if exists "cardio_log_user_all"     on public.cardio_log;
drop policy if exists "cardio_log_admin_select" on public.cardio_log;

-- המשתמש רואה/כותב/מוחק רק את שלו
create policy "cardio_log_user_all" on public.cardio_log
    for all using (auth.uid() = user_id);

-- מנהל יכול לקרוא הכל
create policy "cardio_log_admin_select" on public.cardio_log
    for select using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

-- 3. הרשאות
grant all on public.cardio_log to authenticated;
