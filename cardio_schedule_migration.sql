-- ============================================================
-- Cardio Schedule Migration — לוח אירובי שבועי + יעד דקות, self-serve
-- הרץ את זה ב-Supabase SQL Editor
-- ============================================================

alter table public.profiles add column if not exists cardio_schedule jsonb default '{}';
alter table public.profiles add column if not exists cardio_weekly_goal_minutes integer default 150;
