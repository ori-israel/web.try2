-- הוספת עמודת מנוי לטבלת profiles
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_subscriber boolean DEFAULT false;
