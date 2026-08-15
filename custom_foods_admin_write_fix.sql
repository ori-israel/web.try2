-- ============================================================
-- תיקון: אדמין לא יכול לכתוב (רק לקרוא) ל-custom_foods /
-- custom_recipes / food_log כשהוא צופה בלקוח
-- הרץ ב-Supabase SQL Editor
-- ============================================================
-- הבעיה: בטבלאות daily_nutrition / weight_history / workout_progress
--        וכו' (ר' fix_rls.sql) יש ל-policy את התנאי
--        "auth.uid() = user_id or public.is_admin()" שמאפשר לאדמין
--        לכתוב בשם לקוח שהוא צופה בו. בטבלאות custom_foods,
--        custom_recipes ו-food_log חסר התנאי הזה - יש רק policy
--        נפרדת לקריאה בלבד לאדמין, ואין היתר כתיבה. התוצאה: כשאדמין
--        צופה בלקוח ומנסה להוסיף מאכל אישי/מתכון/פריט ליומן בשם
--        הלקוח, ה-insert נכשל בשקט (RLS חוסם, לא שגיאת קוד).
-- ============================================================

drop policy if exists "custom_foods_user_all"     on public.custom_foods;
drop policy if exists "custom_foods_admin_select" on public.custom_foods;

create policy "custom_foods_all" on public.custom_foods
    for all using (auth.uid() = user_id or public.is_admin());

drop policy if exists "custom_recipes_user_all"     on public.custom_recipes;
drop policy if exists "custom_recipes_admin_select" on public.custom_recipes;

create policy "custom_recipes_all" on public.custom_recipes
    for all using (auth.uid() = user_id or public.is_admin());

drop policy if exists "food_log_user_all"     on public.food_log;
drop policy if exists "food_log_admin_select" on public.food_log;

create policy "food_log_all" on public.food_log
    for all using (auth.uid() = user_id or public.is_admin());
