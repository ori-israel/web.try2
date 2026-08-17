"""
סורק ברקודים — מושך קבצי מחירים רשמיים מרשתות המזון בישראל
(חוק שקיפות מחירים) ומעדכן טבלת barcode_products ב-Supabase.

רץ פעם בשבוע דרך GitHub Actions (.github/workflows/barcode-scraper.yml).
לא רץ באתר עצמו — סקריפט תחזוקה נפרד.

שימוש בספריית il-supermarket-scraper להורדת הקבצים הגולמיים (XML/GZ),
ואז פרסור עצמי לפי הסכמה הממשלתית הידועה (ItemCode/ItemName).

סינון לא-מזון בשתי שכבות:
1. NONFOOD_KEYWORDS (זול, מיידי) - מסנן לפני שבכלל בודקים מול סופאבייס.
2. AI (Gemini, gemini-2.5-flash-lite) - רק על ברקודים *חדשים* (לא קיימים
   עדיין ב-barcode_products) שעברו את שכבה 1. מוצרים שכבר במאגר לא
   עוברים סיווג AI מחדש כל שבוע - הם כבר אושרו (ר' scripts/barcode_classify_food.py
   שניקה את המאגר הקיים). ככה עלות ה-AI השבועית היא רק על החדשים בפועל
   (בדרך כלל עשרות-מאות), לא על כל הקטלוג - שיהיה יקר לחינם.
   מוצר חדש שה-AI לא בטוח לגביו (U) לא נכנס למאגר - מדלגים בשקט. אין בזה
   אובדן: אם זה בכל זאת מזון, הוא יתפוס שוב בשבוע הבא (הוא עדיין "חדש",
   כי לא נכנס למאגר) ויכול להיתפס נכון בסיווג הבא, או להתברר ידנית מאוחר יותר.
   דורש GEMINI_API_KEY כ-secret ב-GitHub Actions. אם חסר - הסקריפט מדלג על
   הוספת מוצרים חדשים לגמרי (רק מרענן שמות של קיימים), לא נכשל ולא מוסיף בלי בדיקה.
"""

import glob
import gzip
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET

import requests
from il_supermarket_scarper import ScarpingTask, ScraperFactory
from il_supermarket_scarper.utils.file_types import FileTypesFilters

DUMP_FOLDER = "barcode_dump"

# מחיר רשמי ל-gemini-2.5-flash-lite (ר' https://ai.google.dev/gemini-api/docs/pricing).
# בלם ביטחון קשיח כמו ב-barcode_classify_food.py, מותאם לנפח שבועי קטן בהרבה -
# אם חוצה, פשוט מפסיק לסווג חדשים בריצה הזו (הם יתפסו שוב בשבוע הבא, לא אובדן).
PRICE_PER_1M_INPUT_TOKENS = 0.10
PRICE_PER_1M_OUTPUT_TOKENS = 0.40
MAX_COST_USD = 1.00
MAX_REQUESTS = 100
CLASSIFY_BATCH_SIZE = 150

CLASSIFY_PROMPT_HEADER = """אתה מסווג שמות מוצרים ממאגר קמעונאי ישראלי למזון/משקה מול לא-מזון.

כלל: "מזון" (F) = כל דבר שבן אדם אוכל או שותה, בלי קשר לקלוריות
(למשל קולה זירו, סוכריה ללא סוכר - כן מזון). כלול כמזון גם:
תבלינים, מלח, סוכר, תוספי תזונה/ויטמינים, קפה, תה, כל סוג משקה כולל אלכוהול.

"לא מזון" (N): מסטיק, קרח (שקיות קרח/קוביות קרח), וכל מוצר ניקיון/טיפוח/בית/
חיות/טבק/משרד/תינוקות-לא-מזון (חיתולים, פודרה, מגבונים וכו').

אם אתה לא בטוח בוודאות גבוהה - סמן U (לא F ולא N). עדיף U מדי מדי מ-F/N שגוי.

עבור כל שורה ממוספרת למטה, החזר בדיוק שורה אחת בפורמט "מספר:אות"
(לדוגמה "1:F"), באותו סדר בדיוק, בלי שום טקסט נוסף, בלי הסברים, בלי כותרת.

המוצרים:
"""

# מוצרים שאינם מזון (ניקיון, טיפוח, כלי בית חד-פעמי, מוצרי חיות, טבק, משרד) —
# לא נכנסים ל-barcode_products מלכתחילה. אלכוהול לשתייה לא ברשימה, הוא מזון באפליקציה.
# אותה רשימה בדיוק כמו בניקוי החד-פעמי שנעשה ב-scripts/barcode_cleanup_nonfood.sql —
# אם מעדכנים כאן, לעדכן שם גם (או להפך).
NONFOOD_KEYWORDS = [
    "אקונומיקה", "מרכך כביסה", "אבקת כביסה", "סבון כלים",
    "נוזל כלים", "מגבון", "מגבונים", "מגבוני", "ספוג ניקוי",
    "סמרטוט", "שקית זבל", "שקיות זבל", "שקית אשפה", "שקיות אשפה",
    "נייר טואלט", "מגבת נייר", "מגבות נייר", "חומר חיטוי",
    "מטהר אוויר", "מרכך רצפות", "ניקוי אסלה", "ניקוי רצפות",
    "אבקת כלור", "כלור לבריכה", "מגב לרצפה", "מברשת רצפה",
    "דלי ניקיון",
    "שמפו", "מרכך שיער", "סבון גוף", "משחת שיניים",
    "מברשת שיניים", "מברשות שיניים", "קיסמי שיניים", "מי פה", "דאודורנט",
    "קרם גוף", "קרם פנים", "קרם ידיים", "תחליב גוף",
    "קרם שיזוף", "קרם הגנה", "בושם", "בושמים", "אפטר שייב", "מייק אפ",
    "איפור", "לק ציפורניים", "מסיר לק", "מכונת גילוח",
    "סכיני גילוח", "קצף גילוח", "תחבושת היגיינית", "פד היגייני",
    "טמפון", "טמפונים", "חיתול", "קרם החתלה", "פודרת תינוקות",
    "צלחות חד פעמי", "כוסות חד פעמי", "כוסות פלסטיק",
    "סכום חד פעמי", "מפיות נייר", "נייר כסף", "נייר אפייה",
    "ניילון נצמד", "שקית הקפאה", "שקיות הקפאה", "נרות",
    "גפרורים", "מצית", "מציתים", "סוללות",
    "מזון לכלב", "מזון לחתול", "חול לחתולים", "חטיף לכלב",
    "חטיף לחתול", "מזון לציפורים", "מזון לדגים",
    "סיגריות", "טבק לגלגול", "נייר גלגול", "מקטרת",
    "נרגילה", "פחמי נרגילה",
    "עטים", "עיפרונות", "מחברת", "מחברות", "דבק",
    "מספריים", "סרט הדבקה",
]
# אחרי כל מונח מותר סיומת ריבוי עברית (ים/ות) לפני גבול המילה, כי שמות מוצרים
# בקמעונאות כמעט תמיד ברבים ("חיתולים" ולא "חיתול") — בלי זה מונחים ביחיד היו מפספסים
_NONFOOD_PATTERN = re.compile(
    r"(?:^|[^א-ת])(?:" +
    "|".join(re.escape(w) + r"(?:ים|ות)?" for w in NONFOOD_KEYWORDS) +
    r")(?:$|[^א-ת])"
)


def is_nonfood(name):
    return bool(_NONFOOD_PATTERN.search(name))

# כל הרשתות הנתמכות בספרייה, חוץ מויקטורי — laibcatalog.co.il (המקור שלה)
# חוסם IP-ים של שרתי GitHub Actions באופן עקבי (נבדק, לא זמני). לטפל בנפרד.
ENABLED_CHAINS = [
    ScraperFactory.BAREKET.name,
    ScraperFactory.YAYNO_BITAN_AND_CARREFOUR.name,
    # ScraperFactory.CITY_MARKET_KIRYATGAT.name,  # קורס בעקביות בספרייה עצמה (מסומן "לא יציב"), לטפל בנפרד
    ScraperFactory.CITY_MARKET_SHOPS.name,
    ScraperFactory.DOR_ALON.name,
    ScraperFactory.GOOD_PHARM.name,
    ScraperFactory.HAZI_HINAM.name,
    ScraperFactory.HET_COHEN_NEW_SOURCE.name,
    ScraperFactory.KESHET.name,
    ScraperFactory.KING_STORE.name,
    ScraperFactory.MAAYAN_2000.name,
    ScraperFactory.MAHSANI_ASHUK_NEW_SOURCE.name,
    # ScraperFactory.NETIV_HASED.name,  # קורס בעקביות בספרייה עצמה (מסומן "לא יציב"), לטפל בנפרד
    ScraperFactory.MESHMAT_YOSEF_1.name,
    ScraperFactory.MESHMAT_YOSEF_2.name,
    ScraperFactory.OSHER_AD.name,
    ScraperFactory.POLIZER.name,
    ScraperFactory.RAMI_LEVY.name,
    ScraperFactory.SALACH_DABACH.name,
    ScraperFactory.SHEFA_BARCART_ASHEM.name,
    ScraperFactory.SHUFERSAL.name,
    ScraperFactory.SHUK_AHIR.name,
    ScraperFactory.STOP_MARKET.name,
    ScraperFactory.SUPER_PHARM.name,
    ScraperFactory.SUPER_YUDA.name,
    ScraperFactory.SUPER_SAPIR.name,
    ScraperFactory.FRESH_MARKET_AND_SUPER_DOSH.name,
    ScraperFactory.TIV_TAAM.name,
    ScraperFactory.YELLOW.name,
    ScraperFactory.YOHANANOF.name,
    ScraperFactory.ZOL_VEBEGADOL.name,
    ScraperFactory.WOLT.name,
    # ScraperFactory.VICTORY_NEW_SOURCE.name,  # חסום מ-GitHub Actions, לטפל בנפרד
]

# רק קבצי "מחיר מלא" (כל המוצרים בסניף) — לא מבצעים/עדכונים חלקיים
FILES_TYPES = [FileTypesFilters.PRICE_FULL_FILE.name]


def download_price_files():
    print(f"מוריד קבצי מחירים מ: {ENABLED_CHAINS}")
    scraper = ScarpingTask(
        enabled_scrapers=ENABLED_CHAINS,
        files_types=FILES_TYPES,
        output_configuration={"output_mode": "disk", "base_storage_path": DUMP_FOLDER},
    )
    scraper.start(limit=5)  # עד 5 קבצי PriceFull (סניפים שונים) לכל רשת
    scraper.join()  # start() רץ ברקע ב-thread נפרד — בלי join הפרסור ירוץ על תיקייה ריקה


def _local_tag(elem):
    # מסיר namespace prefix אם קיים ({http://...}ItemCode -> ItemCode)
    return elem.tag.rsplit("}", 1)[-1]


def _read_xml_bytes(path):
    if path.endswith(".gz"):
        with gzip.open(path, "rb") as f:
            return f.read()
    with open(path, "rb") as f:
        return f.read()


def parse_barcode_names():
    products = {}  # barcode -> name
    skipped_nonfood = 0
    files = glob.glob(f"{DUMP_FOLDER}/**/*.xml", recursive=True) + \
        glob.glob(f"{DUMP_FOLDER}/**/*.gz", recursive=True)
    print(f"נמצאו {len(files)} קבצים לפרסור")

    for path in files:
        try:
            xml_bytes = _read_xml_bytes(path)
            root = ET.fromstring(xml_bytes)
        except Exception as e:
            print(f"  דילוג על {path}: {e}")
            continue

        for item in root.iter():
            if _local_tag(item) != "Item":
                continue
            code, name = None, None
            for child in item:
                tag = _local_tag(child)
                if tag == "ItemCode":
                    code = (child.text or "").strip()
                elif tag == "ItemName":
                    name = (child.text or "").strip()
            if code and name:
                if is_nonfood(name):
                    skipped_nonfood += 1
                    continue
                products[code] = name

    print(f"נמצאו {len(products)} ברקודים ייחודיים (דילוג על {skipped_nonfood} מוצרים שאינם מזון)")
    return products


def upsert_to_supabase(products):
    if not products:
        return
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    endpoint = f"{url}/rest/v1/barcode_products"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    items = [{"barcode": b, "name": n} for b, n in products.items()]
    batch_size = 500
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        if resp.status_code >= 300:
            print(f"  שגיאה בבאצ' {i}: {resp.status_code} {resp.text[:300]}")
        else:
            print(f"  נשמר באצ' {i}-{i+len(batch)}")


def fetch_existing_barcodes():
    """מושך רק את עמודת הברקוד (לא השם) של כל מה שכבר במאגר - לזיהוי מה חדש."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    existing = set()
    page_size = 1000
    offset = 0
    while True:
        resp = requests.get(
            f"{url}/rest/v1/barcode_products",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            params={"select": "barcode", "limit": page_size, "offset": offset},
            timeout=30,
        )
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        existing.update(row["barcode"] for row in page)
        offset += page_size
    return existing


def _gemini_classify_batch(names, api_key):
    """מחזיר (text, input_tokens, output_tokens) לבאצ' אחד. None אם נכשל אחרי 3 ניסיונות."""
    numbered = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names))
    prompt = CLASSIFY_PROMPT_HEADER + numbered
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={api_key}"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generation_config": {"temperature": 0},
    }
    for attempt in range(3):
        try:
            resp = requests.post(url, json=body, timeout=60)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            usage = data.get("usageMetadata", {})
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return text, usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0)
        except Exception as e:
            print(f"    שגיאה בקריאה ל-Gemini (ניסיון {attempt + 1}): {e}")
            time.sleep(2 ** attempt)
    return None, 0, 0


def _parse_classify_response(text, expected_count):
    result = {}
    for line in (text or "").strip().splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        idx_str, label = line.split(":", 1)
        try:
            idx = int(idx_str.strip())
        except ValueError:
            continue
        label = label.strip().upper()[:1]
        if label in ("F", "N", "U"):
            result[idx] = label
    if len(result) != expected_count:
        return None  # תגובה לא תואמת בכמות - כל הבאצ' יטופל כ-U (לא ייכנס) ליתר בטחון
    return result


def classify_new_items(new_items):
    """מסווג ברקודים חדשים (לא קיימים עדיין ב-Supabase) דרך Gemini. מחזיר dict
    barcode->name רק למה שסווג F בבירור. עוצר אם עובר את תקרת העלות/הקריאות -
    השאר נשארים "חדשים" ויתפסו שוב בריצה הבאה, בלי אובדן."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("אין GEMINI_API_KEY - מדלג על הוספת מוצרים חדשים בריצה הזו (רק מרענן קיימים)")
        return {}
    if not new_items:
        return {}

    items = list(new_items.items())
    print(f"מסווג {len(items)} ברקודים חדשים דרך Gemini...")

    accepted = {}
    cumulative_cost = 0.0
    requests_made = 0
    for i in range(0, len(items), CLASSIFY_BATCH_SIZE):
        if cumulative_cost >= MAX_COST_USD:
            print(f"  עצירה: העלות המצטברת (${cumulative_cost:.4f}) הגיעה לתקרה (${MAX_COST_USD:.2f})")
            break
        if requests_made >= MAX_REQUESTS:
            print(f"  עצירה: הגיע לתקרת {MAX_REQUESTS} קריאות")
            break

        batch = items[i:i + CLASSIFY_BATCH_SIZE]
        names = [n for _, n in batch]
        text, in_tok, out_tok = _gemini_classify_batch(names, api_key)
        requests_made += 1
        cumulative_cost += (in_tok / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS + (out_tok / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS

        parsed = _parse_classify_response(text, len(batch))
        if parsed is not None:
            for idx, (barcode, name) in enumerate(batch, start=1):
                if parsed.get(idx) == "F":
                    accepted[barcode] = name

    print(f"  {len(accepted)}/{len(items)} סווגו כמזון בבירור ויתווספו | עלות: ${cumulative_cost:.4f} ({requests_made} קריאות)")
    return accepted


if __name__ == "__main__":
    download_price_files()
    scraped = parse_barcode_names()
    if not scraped:
        print("לא נמצאו מוצרים — לא מעדכן את Supabase")
        sys.exit(1)

    existing_barcodes = fetch_existing_barcodes()
    print(f"{len(existing_barcodes)} ברקודים כבר קיימים במאגר")

    existing_items = {b: n for b, n in scraped.items() if b in existing_barcodes}
    new_items = {b: n for b, n in scraped.items() if b not in existing_barcodes}
    print(f"{len(existing_items)} מהסריקה כבר קיימים (מרענן שם בלבד), {len(new_items)} חדשים (עוברים סיווג AI)")

    upsert_to_supabase(existing_items)
    food_new_items = classify_new_items(new_items)
    upsert_to_supabase(food_new_items)

    print("הסתיים בהצלחה")
