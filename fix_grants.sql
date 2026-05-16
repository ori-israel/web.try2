-- ============================================================
-- GRANT הרשאות על כל הטבלאות + הפונקציה
-- הרץ ב-Supabase SQL Editor
-- ============================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles           to authenticated;
grant select, insert, update, delete on public.daily_nutrition     to authenticated;
grant select, insert, update, delete on public.weight_history      to authenticated;
grant select, insert, update, delete on public.workout_progress    to authenticated;
grant select, insert, update, delete on public.performance_metrics to authenticated;
grant select, insert, update, delete on public.streaks             to authenticated;
grant select, insert, update, delete on public.workout_performance_log to authenticated;

grant execute on function public.is_admin() to authenticated;
