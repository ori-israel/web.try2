-- מעבר ממערכת "מנות" לגרמים חופשיים בתזונה — שלב 1: עמודות DB
-- להריץ ב-Supabase SQL Editor
-- הערה: עמודות המנות הקיימות (protein/carbs/fat, portions_protein/carbs/fat)
-- נשארות בינתיים ללא שינוי — מעבר הדרגתי, לא הרסני.

ALTER TABLE public.daily_nutrition
  ADD COLUMN IF NOT EXISTS protein_g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs_g   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat_g     numeric DEFAULT 0;

ALTER TABLE public.food_log
  ADD COLUMN IF NOT EXISTS grams     numeric,
  ADD COLUMN IF NOT EXISTS protein_g numeric,
  ADD COLUMN IF NOT EXISTS carbs_g   numeric,
  ADD COLUMN IF NOT EXISTS fat_g     numeric;
