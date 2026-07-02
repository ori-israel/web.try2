-- הוספת סוג מנוי (בונוס ליווי / בתשלום) לטבלת profiles
-- להריץ ב-Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_type text CHECK (subscription_type IN ('paid','bonus'));
