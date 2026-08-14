"""
סורק ברקודים — מושך קבצי מחירים רשמיים מרשתות המזון בישראל
(חוק שקיפות מחירים) ומעדכן טבלת barcode_products ב-Supabase.

רץ פעם בשבוע דרך GitHub Actions (.github/workflows/barcode-scraper.yml).
לא רץ באתר עצמו — סקריפט תחזוקה נפרד.

שימוש בספריית il-supermarket-scraper להורדת הקבצים הגולמיים (XML/GZ),
ואז פרסור עצמי לפי הסכמה הממשלתית הידועה (ItemCode/ItemName).
"""

import glob
import gzip
import os
import sys
import xml.etree.ElementTree as ET

import requests
from il_supermarket_scarper import ScarpingTask, ScraperFactory
from il_supermarket_scarper.utils.file_types import FileTypesFilters

DUMP_FOLDER = "barcode_dump"

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
                products[code] = name

    print(f"נמצאו {len(products)} ברקודים ייחודיים")
    return products


def upsert_to_supabase(products):
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


if __name__ == "__main__":
    download_price_files()
    products = parse_barcode_names()
    if not products:
        print("לא נמצאו מוצרים — לא מעדכן את Supabase")
        sys.exit(1)
    upsert_to_supabase(products)
    print("הסתיים בהצלחה")
