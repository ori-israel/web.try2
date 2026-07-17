-- הוספת workout_source לטבלת profiles — מסמן מי יצר את תוכנית האימונים (admin/template/custom)
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS workout_source text NOT NULL DEFAULT 'admin';
