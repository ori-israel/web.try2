-- ============================================================
-- Consent Log Migration — תיעוד אישור תנאי שימוש ומדיניות פרטיות
-- הרץ את הקוד הזה ב-SQL Editor של Supabase
-- ============================================================

-- ── consent_log (יומן אישורי תנאים — ראיה משפטית) ──────────
create table public.consent_log (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users on delete cascade not null,
  email         text,
  terms_version text not null default 'v1.0',
  agreed_at     timestamptz default now(),
  unique(user_id, terms_version)
);

alter table public.consent_log enable row level security;

-- משתמש יכול להוסיף רק רשומה משלו
create policy "consent_insert" on public.consent_log
  for insert with check (auth.uid() = user_id);

-- משתמש רואה את שלו; מנהל רואה הכל
create policy "consent_select" on public.consent_log
  for select using (auth.uid() = user_id or public.is_admin());

-- אין policy ל-update/delete למשתמש רגיל — הרשומה היא ראיה משפטית ולא ניתנת לשינוי

-- ── GRANT הרשאות ────────────────────────────────────────────
-- רק select + insert. בלי update/delete = הרשומה לא ניתנת לשינוי
grant select, insert on public.consent_log to authenticated;
