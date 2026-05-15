-- ============================================================
-- תיקון infinite recursion ב-RLS
-- הרץ את הקוד הזה ב-SQL Editor של Supabase
-- ============================================================

-- ── שלב 1: מחיקת כל ה-policies הבעייתיות ──────────────────

drop policy if exists "users_select_own_profile"   on public.profiles;
drop policy if exists "users_update_own_profile"   on public.profiles;
drop policy if exists "admin_select_all_profiles"  on public.profiles;
drop policy if exists "admin_update_all_profiles"  on public.profiles;

drop policy if exists "users_all_own_nutrition"    on public.daily_nutrition;
drop policy if exists "admin_select_all_nutrition" on public.daily_nutrition;

drop policy if exists "users_all_own_weight"       on public.weight_history;
drop policy if exists "admin_select_all_weight"    on public.weight_history;

drop policy if exists "users_all_own_workout"      on public.workout_progress;
drop policy if exists "admin_select_all_workout"   on public.workout_progress;

drop policy if exists "users_all_own_performance"  on public.performance_metrics;
drop policy if exists "admin_select_all_performance" on public.performance_metrics;

drop policy if exists "users_all_own_streaks"      on public.streaks;
drop policy if exists "admin_select_all_streaks"   on public.streaks;

-- ── שלב 2: פונקציית עזר שעוקפת את ה-RLS (security definer) ─
-- הפונקציה קוראת את profiles ישירות ללא RLS — ללא לולאה

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── שלב 3: policies חדשות — ללא לולאה ─────────────────────

-- profiles: משתמש רואה את שלו, מנהל רואה הכל
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- profiles: כל משתמש מעדכן את עצמו; מנהל מעדכן הכל
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- daily_nutrition
create policy "nutrition_all" on public.daily_nutrition
  for all using (auth.uid() = user_id or public.is_admin());

-- weight_history
create policy "weight_all" on public.weight_history
  for all using (auth.uid() = user_id or public.is_admin());

-- workout_progress
create policy "workout_all" on public.workout_progress
  for all using (auth.uid() = user_id or public.is_admin());

-- performance_metrics
create policy "performance_all" on public.performance_metrics
  for all using (auth.uid() = user_id or public.is_admin());

-- streaks
create policy "streaks_all" on public.streaks
  for all using (auth.uid() = user_id or public.is_admin());
