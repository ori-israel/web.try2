-- ============================================================
-- לוג "חורי ידע": הודעות שנשלחו למאמן AI ולא מצאו שום התאמה
-- בבסיס הידע (knowledge-*.js) וגם לא ב-USDA. עוזר לגלות בעתיד
-- אילו נושאים באמת חסרים, לפי שימוש אמיתי במקום ניחוש.
-- להריץ ב-Supabase SQL Editor פעם אחת.
-- ============================================================

create table if not exists public.ai_knowledge_gaps (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_knowledge_gaps_time on public.ai_knowledge_gaps (created_at);

alter table public.ai_knowledge_gaps enable row level security;

-- משתמש יכול רק לכתוב (fire-and-forget מהצ'אט) — לא לקרוא בחזרה, זה לא מיועד להצגה למשתמש
create policy "ai_gaps_insert" on public.ai_knowledge_gaps
  for insert with check (auth.uid() = user_id);

-- רק מנהל קורא — זה הדוח שאתה (אורי) תרצה לעבור עליו מדי פעם
create policy "ai_gaps_admin_select" on public.ai_knowledge_gaps
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

grant select, insert on public.ai_knowledge_gaps to authenticated;
