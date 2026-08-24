-- ============================================================
-- זיכרון המאמן AI: היסטוריית צ'אט מתמשכת + פתק זיכרון ארוך-טווח
-- להריץ ב-Supabase SQL Editor פעם אחת.
-- ============================================================

-- 1) היסטוריית צ'אט עם המאמן (מחליפה את sessionStorage — נשמר בין כניסות)
create table if not exists public.ai_chat_history (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_history_user_time
  on public.ai_chat_history (user_id, created_at);

alter table public.ai_chat_history enable row level security;

-- כל משתמש רואה/כותב/מוחק רק את השורות שלו (ה-cron משתמש ב-service key ועוקף RLS)
create policy "own_ai_chat_select" on public.ai_chat_history
  for select using (auth.uid() = user_id);
create policy "own_ai_chat_insert" on public.ai_chat_history
  for insert with check (auth.uid() = user_id);
create policy "own_ai_chat_delete" on public.ai_chat_history
  for delete using (auth.uid() = user_id);

-- 2) פתק זיכרון ארוך-טווח: שורה אחת למשתמש, תקציר קצר שנכנס לכל שיחה
create table if not exists public.ai_memory (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  summary            text not null default '',
  last_summarized_at timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.ai_memory enable row level security;

create policy "own_ai_memory_select" on public.ai_memory
  for select using (auth.uid() = user_id);
create policy "own_ai_memory_insert" on public.ai_memory
  for insert with check (auth.uid() = user_id);
create policy "own_ai_memory_update" on public.ai_memory
  for update using (auth.uid() = user_id);

-- 3) הרשאות — חובה! בפרויקט הזה סופאבייס לא נותן GRANT אוטומטי, בלי זה מקבלים 403
grant select, insert, delete on public.ai_chat_history to authenticated;
grant select, insert, update on public.ai_memory       to authenticated;

-- 4) מנהל יכול לקרוא הכל (לדשבורד מאמן עתידי, לעקביות עם שאר הטבלאות)
create policy "ai_chat_admin_select" on public.ai_chat_history
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "ai_memory_admin_select" on public.ai_memory
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
