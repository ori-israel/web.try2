"""
מסווג את כל מוצרי barcode_products למזון/לא-מזון באמצעות Gemini (gemini-2.5-flash-lite,
אותו מודל זול שכבר בשימוש באתר), וכותב את התוצאה ל-CSV. לא מריץ אוטומטית ב-GitHub
Actions - עבודה חד-פעמית, מריצים ידנית.

שני מצבים:
    python3 barcode_classify_food.py              # מסווג בלבד, כותב CSV, לא מוחק כלום
    python3 barcode_classify_food.py --delete      # מוחק מסופאבייס את מה שסווג "לא-מזון" ב-CSV הקיים

התוצאה נכתבת ל-barcode_ai_classification.csv (barcode, name, label) עם label אחד מ-3:
    F = מזון/משקה (כולל אלכוהול, תבלינים, מלח, סוכר, תוספי תזונה/ויטמינים)
    N = לא מזון (כולל מסטיק, קרח, פודרת תינוקות, ומה שכבר מכוסה ע"י NONFOOD_KEYWORDS)
    U = לא בטוח - לא נמחק אוטומטית, מיועד לבדיקה ידנית שלך

עמיד לניתוק: אם רץ שוב, מדלג על ברקודים שכבר סווגו ב-CSV הקיים וממשיך מאיפה שהפסיק.

בלם עלות קשיח: הסקריפט סופר עלות אמיתית (לא הערכה) מתוך usageMetadata שגוגל
מחזיר בכל תשובה, לפי מחיר רשמי (gemini-2.5-flash-lite: $0.10/מיליון טוקן קלט,
$0.40/מיליון טוקן פלט - https://ai.google.dev/gemini-api/docs/pricing). אם העלות
המצטברת עוברת את MAX_COST_USD - הסקריפט עוצר מיד, לפני הקריאה הבאה, ולא ממשיך.
יש גם תקרת מספר קריאות (MAX_REQUESTS) כגיבוי בלתי-תלוי, למקרה שה-usageMetadata
עצמו חסר/פגום ומעקב העלות לא מתעדכן. עבודה על 133 אלף מוצרים אמורה לעלות
כחצי דולר; ברירת המחדל $3 נותנת מרווח ביטחון בלי לאפשר חריגה משמעותית.

דורש משתני סביבה: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
(שלושתם כבר קיימים ב-Vercel של הפרויקט - להעתיק לטרמינל לפני ההרצה)
"""

import argparse
import csv
import json
import os
import sys
import time

import requests

BATCH_SIZE = 150
OUT_CSV = "barcode_ai_classification.csv"

# מחיר רשמי ל-gemini-2.5-flash-lite (ר' https://ai.google.dev/gemini-api/docs/pricing)
PRICE_PER_1M_INPUT_TOKENS = 0.10
PRICE_PER_1M_OUTPUT_TOKENS = 0.40
MAX_COST_USD = 3.00      # עצירה קשיחה - הסקריפט לא ימשיך מעבר לזה
MAX_REQUESTS = 1200      # גיבוי בלתי-תלוי בעלות (887 קריאות צפויות ל-133 אלף מוצרים)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

PROMPT_HEADER = """אתה מסווג שמות מוצרים ממאגר קמעונאי ישראלי למזון/משקה מול לא-מזון.

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


def load_already_classified():
    done = {}
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                done[row["barcode"]] = (row["name"], row["label"])
    return done


def append_results(rows):
    is_new = not os.path.exists(OUT_CSV)
    with open(OUT_CSV, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if is_new:
            w.writerow(["barcode", "name", "label"])
        w.writerows(rows)


def fetch_all_products():
    products = []
    page_size = 1000
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/barcode_products",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            params={"select": "barcode,name", "order": "barcode", "limit": page_size, "offset": offset},
            timeout=30,
        )
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        products.extend(page)
        offset += page_size
        print(f"  נטענו {len(products)} מוצרים...")
    return products


def gemini_classify(names):
    """מחזיר (text, input_tokens, output_tokens). input_tokens/output_tokens הם 0 אם
    usageMetadata לא הוחזר מסיבה כלשהי - הקורא צריך להתייחס לזה כמידע חסר, לא כ-0 אמיתי."""
    numbered = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names))
    prompt = PROMPT_HEADER + numbered
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}"
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
            in_tok = usage.get("promptTokenCount", 0)
            out_tok = usage.get("candidatesTokenCount", 0)
            return data["candidates"][0]["content"]["parts"][0]["text"], in_tok, out_tok
        except Exception as e:
            print(f"    שגיאה בקריאה ל-Gemini (ניסיון {attempt + 1}): {e}")
            time.sleep(2 ** attempt)
    return None, 0, 0
    return None


def parse_classification(text, expected_count):
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
        return None  # תגובה לא תואמת בכמות - כל הבאצ' יסומן U ליתר בטחון
    return result


def run_classify():
    if not (SUPABASE_URL and SERVICE_KEY and GEMINI_API_KEY):
        print("חסר משתנה סביבה (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY)")
        sys.exit(1)

    print("טוען מוצרים מסופאבייס...")
    products = fetch_all_products()
    print(f"סה\"כ {len(products)} מוצרים")

    already = load_already_classified()
    if already:
        print(f"נמצאו {len(already)} מוצרים שכבר סווגו בריצה קודמת - מדלג עליהם")
    todo = [p for p in products if p["barcode"] not in already]
    print(f"נשארו {len(todo)} לסיווג")

    counts = {"F": 0, "N": 0, "U": 0}
    for label, _ in already.values():
        counts[label] = counts.get(label, 0) + 1

    total_batches = (len(todo) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"צפויות כ-{total_batches} קריאות ל-Gemini | תקרת עלות: ${MAX_COST_USD:.2f} | תקרת קריאות: {MAX_REQUESTS}\n")

    cumulative_cost = 0.0
    requests_made = 0

    for i in range(0, len(todo), BATCH_SIZE):
        # בלם ביטחון - נבדק *לפני* כל קריאה, לא אחריה, כדי שלא תיעשה עוד קריאה מעבר לתקרה
        if cumulative_cost >= MAX_COST_USD:
            print(f"\n⛔ עצירה: העלות המצטברת (${cumulative_cost:.4f}) הגיעה לתקרה (${MAX_COST_USD:.2f}).")
            print(f"   {i}/{len(todo)} סווגו עד כה. הרץ שוב את הסקריפט כדי להמשיך מאיפה שהפסיק.")
            break
        if requests_made >= MAX_REQUESTS:
            print(f"\n⛔ עצירה: הגיע לתקרת {MAX_REQUESTS} קריאות (גיבוי בלתי-תלוי בעלות).")
            print(f"   {i}/{len(todo)} סווגו עד כה. הרץ שוב את הסקריפט כדי להמשיך מאיפה שהפסיק.")
            break

        batch = todo[i:i + BATCH_SIZE]
        names = [b["name"] for b in batch]
        text, in_tok, out_tok = gemini_classify(names)
        requests_made += 1
        batch_cost = (in_tok / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS + (out_tok / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS
        cumulative_cost += batch_cost

        parsed = parse_classification(text, len(batch))
        rows = []
        if parsed is None:
            print(f"  באצ' {i}-{i + len(batch)}: תגובה לא תקינה, מסומן U ליתר בטחון")
            for b in batch:
                rows.append([b["barcode"], b["name"], "U"])
                counts["U"] += 1
        else:
            for idx, b in enumerate(batch, start=1):
                label = parsed.get(idx, "U")
                rows.append([b["barcode"], b["name"], label])
                counts[label] += 1
        append_results(rows)
        print(f"  {i + len(batch)}/{len(todo)} סווגו | F={counts['F']} N={counts['N']} U={counts['U']} | עלות מצטברת: ${cumulative_cost:.4f}")

    print("\nסיכום סופי:")
    print(f"  מזון (F): {counts['F']}")
    print(f"  לא מזון (N): {counts['N']}")
    print(f"  לא בטוח (U) - לבדיקה ידנית שלך: {counts['U']}")
    print(f"  עלות בפועל בריצה הזו: ${cumulative_cost:.4f} ({requests_made} קריאות)")
    print(f"\nהתוצאה המלאה ב-{OUT_CSV}")
    print("לרשימת ה'לא בטוח' לבדיקה שלך, סנן את השורות עם label=U בקובץ.")
    print(f"כשתאשר - הרץ שוב עם --delete כדי למחוק בפועל את מה שסומן N.")


def run_delete():
    if not (SUPABASE_URL and SERVICE_KEY):
        print("חסר משתנה סביבה (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
        sys.exit(1)
    if not os.path.exists(OUT_CSV):
        print(f"לא נמצא {OUT_CSV} - צריך להריץ קודם בלי --delete")
        sys.exit(1)

    to_delete = []
    with open(OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["label"] == "N":
                to_delete.append(row["barcode"])

    if not to_delete:
        print("אין רשומות מסומנות N למחיקה")
        return

    print(f"מוחק {len(to_delete)} מוצרים שסווגו כלא-מזון...")
    batch = 200
    deleted = 0
    for i in range(0, len(to_delete), batch):
        chunk = to_delete[i:i + batch]
        in_list = ",".join(chunk)
        resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/barcode_products",
            headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Prefer": "return=minimal",
            },
            params={"barcode": f"in.({in_list})"},
            timeout=30,
        )
        if resp.status_code >= 300:
            print(f"  שגיאה במחיקת באצ' {i}: {resp.status_code} {resp.text[:300]}")
        else:
            deleted += len(chunk)
            print(f"  נמחקו {deleted}/{len(to_delete)}")

    print(f"\nהסתיים. נמחקו {deleted} מוצרים.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="למחוק בפועל את מה שסומן N (אחרי בדיקה)")
    args = parser.parse_args()

    if args.delete:
        run_delete()
    else:
        run_classify()
