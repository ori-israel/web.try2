-- הוספת שדות מנוי/ליווי לטבלת profiles
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS subscription_end_date;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS bonus_months;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_duration_months integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_end_date date
  GENERATED ALWAYS AS (
    CASE
      WHEN subscription_duration_months IS NULL THEN NULL
      ELSE (start_date + make_interval(months => subscription_duration_months))::date
    END
  ) STORED;
