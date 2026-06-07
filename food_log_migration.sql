-- ============================================================
-- Food Log Migration — יומן מאכלים יומי (שבוע אחורה)
-- הרץ את זה ב-Supabase SQL Editor
-- ============================================================
-- מטרה: לשמור כל מאכל שהמשתמש מזין, כדי שהסוכן AI
--       יראה מה/כמה/מתי אכל ב-7 הימים האחרונים.
--       נתונים מעל 7 ימים נמחקים אוטומטית ע"י ה-cron.
-- ============================================================

-- 1. טבלה
create table if not exists public.food_log (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid references auth.users not null,
    date             date not null,                 -- תאריך האכילה (YYYY-MM-DD)
    time             text,                           -- שעה:דקה (HH:MM)
    food             text not null,                  -- שם המאכל
    portions_protein numeric default 0,
    portions_carbs   numeric default 0,
    portions_fat     numeric default 0,
    created_at       timestamptz default now()
);

-- אינדקס לשליפה מהירה לפי משתמש + תאריך
create index if not exists food_log_user_date_idx
    on public.food_log (user_id, date);

-- 2. RLS
alter table public.food_log enable row level security;

drop policy if exists "food_log_user_all"     on public.food_log;
drop policy if exists "food_log_admin_select" on public.food_log;

-- המשתמש רואה/כותב/מוחק רק את שלו
create policy "food_log_user_all" on public.food_log
    for all using (auth.uid() = user_id);

-- מנהל יכול לקרוא הכל (לדשבורד המאמן בעתיד)
create policy "food_log_admin_select" on public.food_log
    for select using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

-- 3. הרשאות
grant all on public.food_log to authenticated;
