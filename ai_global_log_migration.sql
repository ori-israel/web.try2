-- מונה בקשות ל-AI — סופר בקשות גלובלית (כל המשתמשים יחד) ולפי משתמש
-- מטרה: billing פעיל בפרויקט, מגבלת Gemini בפועל גבוהה בהרבה מ-free tier.
-- שתי מגבלות באפליקציה: 15/דקה למשתמש בודד, 100/דקה גלובלית לכל האתר.

create table if not exists public.ai_global_log (
    id         bigint generated always as identity primary key,
    created_at timestamptz default now(),
    user_id    uuid
);

alter table public.ai_global_log add column if not exists user_id uuid;

create index if not exists ai_global_log_created_idx on public.ai_global_log (created_at);
create index if not exists ai_global_log_user_created_idx on public.ai_global_log (user_id, created_at);

-- רק service key (השרת) כותב/קורא; חוסם גישה ישירה מהדפדפן
alter table public.ai_global_log enable row level security;
