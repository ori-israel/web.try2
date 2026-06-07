-- מונה בקשות גלובלי ל-AI — סופר את כל הבקשות מכל המשתמשים יחד
-- מטרה: לא לעבור את מגבלת Gemini של 15 בקשות בדקה (חוסם ב-12 לבטחון)

create table if not exists public.ai_global_log (
    id         bigint generated always as identity primary key,
    created_at timestamptz default now()
);

create index if not exists ai_global_log_created_idx on public.ai_global_log (created_at);

-- רק service key (השרת) כותב/קורא; חוסם גישה ישירה מהדפדפן
alter table public.ai_global_log enable row level security;
