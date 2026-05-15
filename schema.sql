-- ============================================================
-- Supabase Schema — Personal Coaching Portal
-- הרץ את הקוד הזה ב-SQL Editor של Supabase
-- ============================================================

-- ── profiles (מחליף את profile_data_v1) ────────────────────
create table public.profiles (
  id              uuid references auth.users on delete cascade not null primary key,
  nickname        text,
  name            text,
  email           text,
  current_weight  numeric,
  start_weight    numeric,
  goal_weight     numeric,
  height          numeric,
  birth_date      date,
  start_date      date,
  gender          text check (gender in ('male', 'female')),
  goal            text check (goal in ('bulk', 'cut')),
  activity_level  numeric default 1.465,
  protein_ratio   numeric default 2.0,
  allergies       text    default '',
  liked_foods     text    default '',
  disliked_foods  text    default '',
  coaching_goal   text    default '',
  coach_pin       text    default '1234',
  is_admin        boolean default false,
  workout_a       jsonb   default '[]',
  workout_b       jsonb   default '[]',
  workout_c       jsonb   default '[]',
  workout_days    jsonb   default '{"A":[0],"B":[2],"C":[4]}',
  portion_values  jsonb   default '{"protein":27.5,"carbs":37.5,"fat":12.5}',
  theme           text    default 'dark',
  gemini_api_key  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.profiles enable row level security;

-- משתמש רואה את הפרופיל שלו
create policy "users_select_own_profile" on public.profiles
  for select using (auth.uid() = id);

create policy "users_update_own_profile" on public.profiles
  for update using (auth.uid() = id);

-- מאמן (admin) רואה ויכול לערוך את כל הפרופילים
create policy "admin_select_all_profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "admin_update_all_profiles" on public.profiles
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── daily_nutrition (מעקב מנות יומי) ───────────────────────
create table public.daily_nutrition (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  date       date not null default current_date,
  protein    numeric default 0,
  carbs      numeric default 0,
  fat        numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

alter table public.daily_nutrition enable row level security;

create policy "users_all_own_nutrition" on public.daily_nutrition
  for all using (auth.uid() = user_id);

create policy "admin_select_all_nutrition" on public.daily_nutrition
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── weight_history (היסטוריית משקל) ────────────────────────
create table public.weight_history (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  date       date not null,
  weight     numeric not null,
  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table public.weight_history enable row level security;

create policy "users_all_own_weight" on public.weight_history
  for all using (auth.uid() = user_id);

create policy "admin_select_all_weight" on public.weight_history
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── workout_progress (התקדמות אימונים יומית) ───────────────
create table public.workout_progress (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users on delete cascade not null,
  date             date not null default current_date,
  exercises        jsonb default '{}',
  tasks            jsonb default '[]',
  exercise_weights jsonb default '{}',
  updated_at       timestamptz default now(),
  unique(user_id, date)
);

alter table public.workout_progress enable row level security;

create policy "users_all_own_workout" on public.workout_progress
  for all using (auth.uid() = user_id);

create policy "admin_select_all_workout" on public.workout_progress
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── performance_metrics (ביצועים — סקוואט / לחיצה / דדליפט) ─
create table public.performance_metrics (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  exercise     text not null,
  start_kg     numeric,
  start_reps   integer,
  current_kg   numeric,
  current_reps integer,
  updated_at   timestamptz default now(),
  unique(user_id, exercise)
);

alter table public.performance_metrics enable row level security;

create policy "users_all_own_performance" on public.performance_metrics
  for all using (auth.uid() = user_id);

create policy "admin_select_all_performance" on public.performance_metrics
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── streaks (רצפים) ─────────────────────────────────────────
create table public.streaks (
  id                       uuid default gen_random_uuid() primary key,
  user_id                  uuid references auth.users on delete cascade not null unique,
  workout_streak           integer default 0,
  nutrition_streak         integer default 0,
  workout_completed_date   date,
  nutrition_completed_date date,
  updated_at               timestamptz default now()
);

alter table public.streaks enable row level security;

create policy "users_all_own_streaks" on public.streaks
  for all using (auth.uid() = user_id);

create policy "admin_select_all_streaks" on public.streaks
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── Trigger: יצירת פרופיל אוטומטית עם רישום ────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;

  insert into public.streaks (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- יצירת חשבון מנהל (מאמן)
-- אחרי שתיצור את חשבון המאמן דרך Supabase Auth Dashboard,
-- הרץ את הפקודה הבאה עם ה-UUID שלו:
--
--   update public.profiles
--   set is_admin = true
--   where email = 'your-coach-email@example.com';
--
-- ============================================================
