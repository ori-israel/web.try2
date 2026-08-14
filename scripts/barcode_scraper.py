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

DUMP_FOLDER = "barcode_dump"

# רשתות ההתחלה (שלב בדיקה) — להרחיב לכל 33 הרשתות אחרי שזה עובד נקי
ENABLED_CHAINS = [
    ScraperFactory.SHUFERSAL.name,
    ScraperFactory.RAMI_LEVY.name,
    ScraperFactory.VICTORY_NEW_SOURCE.name,
]


def download_price_files():
    print(f"מוריד קבצי מחירים מ: {ENABLED_CHAINS}")
    scraper = ScarpingTask(
        enabled_scrapers=ENABLED_CHAINS,
        output_configuration={"output_mode": "disk", "base_storage_path": DUMP_FOLDER},
    )
    scraper.start(limit=1)  # limit=1 = הקובץ העדכני האחרון בלבד לכל רשת/סניף
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
