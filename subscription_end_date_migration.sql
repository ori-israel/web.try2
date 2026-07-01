-- הוספת שדות מנוי/ליווי לטבלת profiles
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_duration_months integer,
  ADD COLUMN IF NOT EXISTS bonus_months integer DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_end_date date
  GENERATED ALWAYS AS (
    CASE
      WHEN subscription_duration_months IS NULL THEN NULL
      ELSE (start_date + make_interval(months => subscription_duration_months + COALESCE(bonus_months, 0)))::date
    END
  ) STORED;
