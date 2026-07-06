-- הוספת טלפון לטבלת profiles + עדכון הטריגר של הרשמה חדשה
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, name, phone, birth_date, start_date, start_weight, current_weight, goal_weight, height, gender, goal)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'birth_date')::date,
    now()::date,
    (new.raw_user_meta_data->>'start_weight')::numeric,
    (new.raw_user_meta_data->>'start_weight')::numeric,
    (new.raw_user_meta_data->>'goal_weight')::numeric,
    (new.raw_user_meta_data->>'height')::numeric,
    new.raw_user_meta_data->>'gender',
    new.raw_user_meta_data->>'goal'
  )
  on conflict (id) do nothing;

  insert into public.streaks (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;
