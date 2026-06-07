-- ============================================================
-- Normalize weekly_scores — יישור כל הרשומות ליום ראשון + מחיקת כפילויות
-- הרץ ב-SQL Editor של Supabase. בטוח להריץ פעם אחת.
-- ============================================================
-- הרקע: בטבלה היו רשומות עם תאריכי תחילת שבוע לא עקביים
-- (ראשון/שני/שלישי) וגם כפילויות לאותו שבוע.
-- ההחלטה: שבוע מתחיל תמיד ביום ראשון (00:00) ומסתיים בשבת (23:59).
-- ============================================================

begin;

-- 1. מחיקת כפילויות: לכל (לקוח + שבוע מנורמל ליום ראשון) משאירים רשומה אחת
--    בוחרים את הציון הגבוה ביותר; בתיקו — את ה-id הקטן ביותר.
with norm as (
    select
        id,
        row_number() over (
            partition by
                client_id,
                (week_start - (extract(dow from week_start)::int))::date
            order by score desc, id asc
        ) as rn
    from weekly_scores
)
delete from weekly_scores
where id in (select id from norm where rn > 1);

-- 2. הזזת כל רשומה שלא מתחילה בראשון, אחורה ליום ראשון של אותו שבוע
--    (שני → -1 יום, שלישי → -2 ימים וכו')
update weekly_scores
set week_start = (week_start - (extract(dow from week_start)::int))::date
where extract(dow from week_start) <> 0;

commit;

-- בדיקה אחרי הרצה — אמור להחזיר רק 0 בעמודה day_0sun, בלי כפילויות:
-- select week_start, extract(dow from week_start) as day_0sun, count(*)
-- from weekly_scores group by week_start order by week_start;
