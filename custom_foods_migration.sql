-- ============================================================
-- "המזונות שלי" — מאכלים ומתכונים אישיים לכל משתמש
-- הרץ ב-Supabase SQL Editor
-- ============================================================
-- מטרה: לתת לכל משתמש לשמור מאכלים אישיים ומתכונים (שילוב של
--       כמה מאכלים), פרטי לגמרי לכל משתמש, לשימוש חוזר מהיר
--       בהוספת אוכל. מגבלה: 60 מאכלים / 30 מתכונים למשתמש
--       (נאכפת בקוד לפני שמירה, לא ב-DB).
-- ============================================================

-- 1. טבלת מאכלים אישיים
create table if not exists public.custom_foods (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users not null,
    name        text not null,
    unit        text not null default 'גרם',      -- גרם / כוס / כף / יחידה
    unit_amount numeric not null default 100,      -- הכמות שאליה מתייחס המאקרו (למשל 100 לגרם, 1 לכוס)
    protein_g   numeric not null default 0,
    carbs_g     numeric not null default 0,
    fat_g       numeric not null default 0,
    created_at  timestamptz default now()
);

create index if not exists custom_foods_user_idx on public.custom_foods (user_id);

alter table public.custom_foods enable row level security;

drop policy if exists "custom_foods_user_all"     on public.custom_foods;
drop policy if exists "custom_foods_admin_select" on public.custom_foods;

create policy "custom_foods_user_all" on public.custom_foods
    for all using (auth.uid() = user_id);

create policy "custom_foods_admin_select" on public.custom_foods
    for select using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

grant all on public.custom_foods to authenticated;

-- 2. טבלת מתכונים אישיים
-- ingredients: מערך JSON, כל איבר {name, amount, unit, protein_g, carbs_g, fat_g}
--              (המאקרו כבר מחושב לכמות הזו, לא צריך המרה נוספת)
create table if not exists public.custom_recipes (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users not null,
    name        text not null,
    ingredients jsonb not null default '[]',
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

create index if not exists custom_recipes_user_idx on public.custom_recipes (user_id);

alter table public.custom_recipes enable row level security;

drop policy if exists "custom_recipes_user_all"     on public.custom_recipes;
drop policy if exists "custom_recipes_admin_select" on public.custom_recipes;

create policy "custom_recipes_user_all" on public.custom_recipes
    for all using (auth.uid() = user_id);

create policy "custom_recipes_admin_select" on public.custom_recipes
    for select using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

grant all on public.custom_recipes to authenticated;

-- 3. עמודה חדשה ב-food_log — תמונת מצב של מרכיבי המתכון בזמן הרישום
--    (רק כשנרשם ממתכון; ריק לכל שאר הרישומים). מאפשרת "פרטים" ליומן
--    בלי להיפגע משינוי/מחיקה עתידית של המתכון השמור.
alter table public.food_log
    add column if not exists recipe_items jsonb;
