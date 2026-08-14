-- ============================================================
-- סורק ברקודים — מאגר ברקוד → שם מוצר מרשתות המזון בישראל
-- הרץ ב-Supabase SQL Editor
-- ============================================================
-- מטרה: מאגר ציבורי (לא per-user) של ברקוד→שם מוצר, ממולא ע"י
--       סקריפט חיצוני שמושך מקבצי שקיפות המחירים של הרשתות.
--       בזמן סריקה: מחפשים ברקוד כאן, ואם נמצא שם מוצר מדויק,
--       מעבירים אותו לבירור המאקרו הקיים (AI + חיפוש אינטרנט).
-- ============================================================

create table if not exists public.barcode_products (
    barcode      text primary key,
    name         text not null,
    updated_at   timestamptz default now()
);

alter table public.barcode_products enable row level security;

drop policy if exists "barcode_products_read_all" on public.barcode_products;

-- מאגר ציבורי לקריאה בלבד עבור כל משתמש מחובר — אין כתיבה מהאתר,
-- רק הסקריפט החיצוני כותב (עם service_role key, עוקף RLS)
create policy "barcode_products_read_all" on public.barcode_products
    for select using (true);

grant select on public.barcode_products to authenticated, anon;
