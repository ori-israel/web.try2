-- ============================================================
-- fix_security.sql
-- מוסיף RLS לטבלאות weekly_scores ו-weekly_questionnaire
-- להריץ ב-Supabase Dashboard → SQL Editor
-- ============================================================

-- ── weekly_scores ────────────────────────────────────────────
alter table public.weekly_scores enable row level security;

drop policy if exists "weekly_scores_all" on public.weekly_scores;
create policy "weekly_scores_all"
  on public.weekly_scores for all
  using (auth.uid() = client_id or public.is_admin());

grant select, insert, update, delete on public.weekly_scores to authenticated;

-- ── weekly_questionnaire ─────────────────────────────────────
alter table public.weekly_questionnaire enable row level security;

drop policy if exists "weekly_questionnaire_all" on public.weekly_questionnaire;
create policy "weekly_questionnaire_all"
  on public.weekly_questionnaire for all
  using (auth.uid() = client_id or public.is_admin());

grant select, insert, update, delete on public.weekly_questionnaire to authenticated;
