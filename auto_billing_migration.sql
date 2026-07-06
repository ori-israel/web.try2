-- הוספת auto_billing לטבלת profiles — מסמן מנוי עם חיוב אוטומטי אמיתי דרך Grow
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_billing boolean NOT NULL DEFAULT false;
