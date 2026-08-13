-- ============================================================
-- אלכוהול כקלוריות — עמודת alcohol_g בטבלאות התזונה
-- הרץ ב-Supabase SQL Editor
-- ============================================================
-- מטרה: משקאות המכילים אלכוהול טהור לא חישבו את הקלוריות שלו
--       (7 קק"ל לגרם). מוסיפים עמודת alcohol_g לצד protein_g/
--       carbs_g/fat_g בכל טבלה רלוונטית, כדי שהחישוב יהיה מדויק.
-- ============================================================

ALTER TABLE public.daily_nutrition
  ADD COLUMN IF NOT EXISTS alcohol_g numeric DEFAULT 0;

ALTER TABLE public.food_log
  ADD COLUMN IF NOT EXISTS alcohol_g numeric DEFAULT 0;

ALTER TABLE public.custom_foods
  ADD COLUMN IF NOT EXISTS alcohol_g numeric NOT NULL DEFAULT 0;

-- custom_recipes.ingredients הוא jsonb, לא דורש מיגרציה —
-- כל איבר חדש במערך פשוט יכלול alcohol_g בתוך ה-JSON.
