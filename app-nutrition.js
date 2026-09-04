// ===== תזונה: סורק מזון, מאקרו, הוספת פריט (חיפוש/AI מתמונה) =====
// יומן האוכל היומי (הצגה/עריכה/מחיקה/סנכרון) עבר ל-app-nutrition-journal.js

// מחפש במאגר בשתי רמות ביטחון: "גבוהה" (שם זהה/מוכל במלואו) ו"חלשה" (ביטוי מרכזי/מילה בודדת).
// ההבחנה חשובה כי רק התאמה בביטחון גבוה בטוחה להחליף ניחוש של AI בעיוורון (ר' enrichItemMacros).
function _findInUSDAConfident(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    let found = USDA_TABLE.find(r => r.name === name || r.name_en.toLowerCase() === n);
    if (found) return found;
    found = USDA_TABLE.find(r => r.name.includes(name) || name.includes(r.name) ||
        r.name_en.toLowerCase().includes(n) || n.includes(r.name_en.toLowerCase()));
    return found || null;
}

function _findInUSDAFuzzy(name) {
    if (!name) return null;
    // מילות הכנה/תיאור כלליות — לא שם מאכל אמיתי, אסור להתאים לפיהן במאגר
    // (לדוגמה: "בטטה בתנור עם שמן" לא אמור להתאים למוצר אקראי שיש בשמו "שמן")
    const allWords = name.replace(/[()״׳,]/g, ' ').split(/\s+/).filter(Boolean);
    let coreEnd = allWords.findIndex(w => _USDA_STOPWORDS.has(w));
    if (coreEnd === -1) coreEnd = allWords.length;
    const core = allWords.slice(0, coreEnd).join(' ');
    let found = null;
    if (core && core !== name) {
        found = USDA_TABLE.find(r => r.name.includes(core) || core.includes(r.name));
        if (found) return found;
    }
    const words = allWords.filter(w => w.length > 2 && !_USDA_STOPWORDS.has(w));
    for (const word of words) {
        const wLow = word.toLowerCase();
        found = USDA_TABLE.find(r => r.name.includes(word) || r.name_en.toLowerCase().includes(wLow));
        if (found) return found;
    }
    return null;
}

const _USDA_STOPWORDS = new Set([
    'עם', 'בלי', 'ללא', 'עוד', 'טרי', 'טריה', 'חי', 'חיה', 'קפוא', 'קפואה',
    'מבושל', 'מבושלת', 'צלוי', 'צלויה', 'קלוי', 'קלויה', 'מטוגן', 'מטוגנת',
    'אפוי', 'אפויה', 'מוקפץ', 'מוקפצת', 'בתנור', 'במחבת', 'בגריל', 'ברביקיו',
    'שמן', 'מלח', 'פלפל', 'תבלינים', 'עור', 'גרם', 'יחידות', 'יחידה', 'כוסות', 'כפות'
]);

// לשימוש כללי (חיפוש ידני, לא תלוי-AI) — כולל גם התאמות חלשות
function findInUSDA(name) {
    return _findInUSDAConfident(name) || _findInUSDAFuzzy(name);
}

// קלוריות משוערות ממאקרו — לצורך השוואת סבירות בלבד
function _roughKcal(p, c, f) { return (p || 0) * 4 + (c || 0) * 4 + (f || 0) * 9; }

// מחשב מאקרו לפריט לפי גרמים — מטבלה אם אפשר, אחרת מ-AI.
// הגנות מפני ערכים דפוקים (התאמה שגויה במאגר, או הזיה של ה-AI):
// 1. התאמה בביטחון נמוך (findInUSDAFuzzy) מתקבלת רק אם היא לא סותרת בצורה קיצונית
//    את ההערכה המקורית של ה-AI לאותו פריט — אחרת ה-AI כנראה יותר אמין ממנה.
// 2. תקרה קשיחה: שום פריט מזון לא יכול להכיל יותר מ-50% ממשקלו בחלבון/פחמימה/שומן בנפרד
//    (בלתי אפשרי כמעט פיזית למאכל אמיתי) — נחתך אוטומטית בלי קשר למקור הערך.
function enrichItemMacros(item) {
    const confident = _findInUSDAConfident(item.lookup_name) || _findInUSDAConfident(item.name) || _findInUSDAConfident(item.name_en);
    let usda = confident;

    if (!usda && item.grams) {
        const fuzzy = _findInUSDAFuzzy(item.lookup_name) || _findInUSDAFuzzy(item.name) || _findInUSDAFuzzy(item.name_en);
        if (fuzzy) {
            const ratio = item.grams / 100;
            const fuzzyKcal = _roughKcal(fuzzy.protein * ratio, fuzzy.carbs * ratio, fuzzy.fat * ratio);
            const aiKcal = _roughKcal(item.protein_g, item.carbs_g, item.fat_g);
            // אם ה-AI כבר נתן הערכה משלו לפריט הזה, ההתאמה החלשה מתקבלת רק אם היא לא רחוקה
            // ביותר מפי 2.5 מהערכת ה-AI (בשני הכיוונים) — אחרת כנראה טעות התאמה, לא שיפור
            const noAiEstimate = !aiKcal;
            const withinReason = aiKcal > 0 && fuzzyKcal <= aiKcal * 2.5 && fuzzyKcal >= aiKcal / 2.5;
            if (noAiEstimate || withinReason) usda = fuzzy;
        }
    }

    let result = item;
    if (usda && item.grams) {
        const ratio = item.grams / 100;
        result = {
            ...item,
            protein_g: Math.round(usda.protein * ratio * 10) / 10,
            fat_g:     Math.round(usda.fat     * ratio * 10) / 10,
            carbs_g:   Math.round(usda.carbs   * ratio * 10) / 10,
            alcohol_g: Math.round((usda.alcohol || 0) * ratio * 10) / 10,
            _fromTable: true
        };
    }

    // תקרה קשיחה — בלי קשר אם הערך הגיע מהמאגר או מה-AI.
    // חלבון: תקרה של 90% מהמשקל. מוצרים מרוכזים כמו אבקת חלבון מגיעים ל-80%+ ולכן מותרים,
    // אבל ערך מעל 90% כמעט תמיד טעות התאמה/הזיה של AI ולא מאכל אמיתי.
    // שומן/פחמימה: יכולים להגיע ל-100% מהמשקל באמת (שמן = שומן טהור, סוכר = פחמימה טהורה) -
    // התקרה עליהם היא רק הגבול הפיזי (לא ניתן שמאקרו יהיה יותר ממשקל המאכל עצמו).
    if (result.grams) {
        const proteinCap = result.grams * 0.9;
        if (result.protein_g > proteinCap) result = { ...result, protein_g: Math.round(proteinCap * 10) / 10 };
        ['carbs_g', 'fat_g'].forEach(key => {
            if (result[key] > result.grams) result = { ...result, [key]: Math.round(result.grams * 10) / 10 };
        });
    }

    return result;
}

let scannedGrams = { protein: 0, fat: 0, carbs: 0, alcohol: 0 };
let scannedItems = [];
let scannedImageBase64 = null;
let scannedImageMime = null;
let _deletedItem = null;
let _deletedIdx = null;
let _undoTimer = null;

// מצב שימוש נוכחי של מודל "הוספת אוכל" - נקבע לפני openFoodScanner() על ידי נקודת הכניסה:
// 'journal' (הוספה ליומן, ברירת מחדל) | 'new-food' (מאכל אישי חדש) | 'recipe-ingredient' (הוספת מרכיב למתכון)
let _scannerMode = 'journal';

// מתאים את כותרת המודל, טקסט כפתורי הפעולה ושורות "לשמור גם..." למצב הנוכחי -
// כדי שאותו מודל (5 שיטות) ישרת גם יומן, גם מאכל אישי חדש וגם הוספת מרכיב למתכון
function _applyScannerModeUI() {
    const titleEl = document.getElementById('scanner-modal-title');
    const nameInput = document.getElementById('scan-food-name');
    const searchBtn = document.querySelector('#scanner-step-2 .scan-action-btn.primary');
    const bcBtn = document.querySelector('#bc-confirm-step .bc-add-btn');
    const labelBtn = document.querySelector('#label-confirm-modal .bc-add-btn');
    const saveRecipeRow = document.getElementById('scan-save-recipe-row');
    const bcSaveRow = document.getElementById('bc-save-myfoods-row');
    const labelSaveRow = document.getElementById('label-save-myfoods-row');

    const isJournal = _scannerMode === 'journal';
    const titleTexts = {
        'journal': ' הוספת אוכל',
        'new-food': ' מאכל אישי חדש',
        'recipe-ingredient': ' הוספת מרכיב למתכון'
    };
    const btnTexts = {
        'journal': 'הוספה ליומן',
        'new-food': 'שמירה כמאכל אישי',
        'recipe-ingredient': 'הוספת המרכיב למתכון'
    };
    if (titleEl) {
        const icon = titleEl.querySelector('svg');
        titleEl.textContent = titleTexts[_scannerMode] || titleTexts.journal;
        if (icon) titleEl.prepend(icon);
    }
    const checkIcon = '<span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:#22c55e;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>';
    [searchBtn, bcBtn, labelBtn].forEach(btn => {
        if (btn) btn.innerHTML = (btnTexts[_scannerMode] || btnTexts.journal) + ' ' + checkIcon;
    });
    if (saveRecipeRow) saveRecipeRow.style.display = isJournal ? '' : 'none';
    if (bcSaveRow) bcSaveRow.style.display = isJournal ? '' : 'none';
    if (labelSaveRow) labelSaveRow.style.display = isJournal ? '' : 'none';
    if (nameInput) {
        nameInput.readOnly = isJournal;
        nameInput.style.border = isJournal ? 'none' : '1px solid var(--border)';
        nameInput.style.background = isJournal ? 'none' : 'var(--bg-card-alt)';
        nameInput.style.borderRadius = isJournal ? '0' : '8px';
        nameInput.style.padding = isJournal ? '0' : '4px 8px';
    }
}

function renderScanDetails() {
    const detailsBox = document.getElementById('scan-details-box');
    const itemsHtml = scannedItems.map((item, i) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <button onclick="deleteScannedItem(${i})" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0 6px;line-height:1;min-width:32px;display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            <span style="flex:1;text-align:right;font-size:15px;">${_esc(item.name)} · <span onclick="editItemGrams(${i}, this)" style="color:var(--text-secondary);cursor:pointer;text-decoration:underline dotted;">${Math.round(item.grams)}g</span></span>
        </div>`
    ).join('');
    // כפתור "הוספת פריט" מוצג תמיד — גם כשאין עדיין פריטים (למשל אחרי מחיקת הפריט האחרון)
    detailsBox.innerHTML = itemsHtml + `<div id="add-item-row" style="margin-top:6px;">
        <button onclick="showAddItemForm()" style="background:none;border:none;color:var(--text-secondary);font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוספת פריט</button>
    </div>`;

    // בהקשר "מאכל אישי חדש"/"הוספת מרכיב" (לא יומן) - מציגים שם ניתן לעריכה גם כשההוספה
    // הייתה דרך חיפוש (לא רק צילום AI), כדי שתמיד אפשר לתת שם למאכל/למרכיב לפני השמירה
    if (typeof _scannerMode !== 'undefined' && _scannerMode !== 'journal' && scannedItems.length) {
        const nameEl = document.getElementById('scan-food-name');
        const labelEl = document.getElementById('scan-food-label');
        if (nameEl && !nameEl.value.trim()) nameEl.value = scannedItems[0].name;
        if (nameEl) nameEl.style.display = '';
        if (labelEl) labelEl.style.display = '';
    }
}

function showAddItemForm() {
    const row = document.getElementById('add-item-row');
    if (!row) return;
    row.innerHTML = `
        <div class="entry-pill">
            <button class="entry-pill-btn entry-pill-cancel" onclick="renderScanDetails()" aria-label="ביטול"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            <div class="entry-pill-div"></div>
            <span class="entry-pill-amt-tap" id="add-item-amount-tap" onclick="openAddItemAmountSheet()">100 גרם</span>
            <input id="add-item-amount" type="hidden" value="100" />
            <select id="add-item-unit" class="entry-pill-unit">
                <option value="גרם">גרם</option>
                <option value="יחידות">יחידות</option>
                <option value="כוסות">כוסות</option>
                <option value="כפות">כפות</option>
            </select>
            <div class="entry-pill-div"></div>
            <input id="add-item-name" type="text" placeholder="חיפוש מאכל..." autocomplete="off" class="entry-pill-search" />
            <button class="entry-pill-btn entry-pill-confirm" onclick="confirmAddItem()" aria-label="אישור"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></button>
        </div>
        <div id="add-item-suggestions" style="display:flex;flex-direction:column;gap:1px;margin-top:6px;"></div>`;
    document.getElementById('add-item-name').focus();
    document.getElementById('add-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') { document.getElementById('add-item-suggestions').innerHTML = ''; openAddItemAmountSheet(); } });
    document.getElementById('add-item-name').addEventListener('input', function() { renderFoodSuggestions(this.value); });
    if (typeof renderQuickPicks === 'function') renderQuickPicks();
}

// אייקונים לפי מקור התוצאה בחיפוש המאוחד (מאגר האפליקציה / מאכל אישי / מתכון)
const _SUGG_ICON_USDA   = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M3 8l2-4h14l2 4"/><path d="M9 12h6"/></svg>';
const _SUGG_ICON_CUSTOM = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#34d399" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-1.2 2.8-4.5 5-4.5 8.3a4.5 4.5 0 0 0 9 0C16.5 8 13.2 5.8 12 3z"/></svg>';
const _SUGG_ICON_RECIPE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#60a5fa" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';

// חיפוש חי מאוחד: מאגר האפליקציה + מאכלים אישיים + מתכונים אישיים - עד 8 תוצאות
function renderFoodSuggestions(query) {
    const box = document.getElementById('add-item-suggestions');
    if (!box) return;
    const q = (query || '').trim();
    window._selectedFoodSource = null; // מתאפס בכל הקלדה - נקבע מחדש רק בבחירה מהרשימה
    if (q.length < 2) { if (typeof renderQuickPicks === 'function') renderQuickPicks(); else box.innerHTML = ''; return; }
    const qLow = q.toLowerCase();

    const recipeMatches = (typeof _myRecipes !== 'undefined' ? _myRecipes : [])
        .filter(r => r.name.includes(q))
        .slice(0, 3)
        .map(r => {
            const kcal = Math.round((r.ingredients || []).reduce((s, i) => s + (i.protein_g || 0) * 4 + (i.carbs_g || 0) * 4 + (i.fat_g || 0) * 9 + (i.alcohol_g || 0) * 7, 0));
            return { type: 'recipe', ref: r, label: r.name, sub: `מתכון · ${kcal} קל'`, icon: _SUGG_ICON_RECIPE };
        });

    const foodMatches = (typeof _myFoods !== 'undefined' ? _myFoods : [])
        .filter(f => f.name.includes(q))
        .slice(0, 3)
        .map(f => {
            const kcal = (f.kcal_g != null) ? Math.round(f.kcal_g) : Math.round((f.protein_g || 0) * 4 + (f.carbs_g || 0) * 4 + (f.fat_g || 0) * 9 + (f.alcohol_g || 0) * 7);
            return { type: 'custom', ref: f, label: f.name, sub: `${kcal} קל' ל-${f.unit_amount} ${f.unit}`, icon: _SUGG_ICON_CUSTOM };
        });

    const usdaMatches = (typeof USDA_TABLE !== 'undefined' ? USDA_TABLE : [])
        .filter(r => r.name.includes(q) || r.name_en.toLowerCase().includes(qLow))
        .slice(0, 6)
        .map(r => {
            const kcal = Math.round((r.protein || 0) * 4 + (r.carbs || 0) * 4 + (r.fat || 0) * 9 + (r.alcohol || 0) * 7);
            return { type: 'usda', ref: r, label: r.name, sub: `${kcal} קל' / 100g`, icon: _SUGG_ICON_USDA };
        });

    const matches = [...recipeMatches, ...foodMatches, ...usdaMatches].slice(0, 8);
    window._foodSuggQuery = q;
    _renderFoodSuggestionMatches(matches, box);
    if (matches.length < 8 && typeof searchBarcodeProductsByName === 'function') {
        searchBarcodeProductsByName(q).then(barcodeMatches => {
            if (window._foodSuggQuery !== q || !barcodeMatches.length) return;
            const merged = [...matches, ...barcodeMatches].slice(0, 8);
            _renderFoodSuggestionMatches(merged, box);
        }).catch(() => {});
    }
}

function _renderFoodSuggestionMatches(matches, box) {
    if (!matches.length) { box.innerHTML = ''; window._currentFoodSuggestions = []; return; }
    box.innerHTML = matches.map((m, i) =>
        `<div onclick="selectFoodSuggestion(${i})" data-sugg-idx="${i}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 6px;background:var(--bg-card-alt);border-radius:4px;cursor:pointer;font-size:13.5px;">
            <span style="display:flex;align-items:center;gap:6px;min-width:0;"><span style="flex-shrink:0;display:flex;">${m.icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(m.label)}</span></span>
            <span style="color:var(--text-secondary);font-size:11.5px;flex-shrink:0;">${m.sub}</span>
        </div>`
    ).join('');
    window._currentFoodSuggestions = matches;
}

function selectFoodSuggestion(i) {
    const match = (window._currentFoodSuggestions || [])[i];
    if (!match) return;
    const box = document.getElementById('add-item-suggestions');

    if (match.type === 'recipe') {
        if (box) box.innerHTML = '';
        document.getElementById('add-item-name').value = '';
        if (typeof openRecipeLogAdjust === 'function') openRecipeLogAdjust(match.ref.id);
        return;
    }

    const nameEl = document.getElementById('add-item-name');
    const unitEl = document.getElementById('add-item-unit');
    const amountEl = document.getElementById('add-item-amount');
    if (nameEl) nameEl.value = match.label;
    if (match.type === 'custom') {
        window._selectedFoodSource = match;
        if (unitEl) unitEl.value = match.ref.unit;
        if (amountEl) amountEl.value = match._displayAmount || match.ref.unit_amount;
    } else if (match.type === 'barcode') {
        window._selectedFoodSource = match;
        if (unitEl) unitEl.value = 'גרם';
    } else {
        window._selectedFoodSource = null; // usda - ניתן לחפש בטבלה בזמן האישור, לא צריך לשמור הפניה
        if (unitEl) unitEl.value = 'גרם';
    }
    if (box) box.innerHTML = '';
    const tapEl = document.getElementById('add-item-amount-tap');
    if (tapEl && amountEl && unitEl) tapEl.textContent = amountEl.value + ' ' + unitEl.value;
    openAddItemAmountSheet();
}

function openAddItemAmountSheet() {
    const amountEl = document.getElementById('add-item-amount');
    const unitEl = document.getElementById('add-item-unit');
    if (!amountEl || !unitEl) return;
    openAmountUnitSheet({
        amount: parseFloat(amountEl.value) || 100,
        unit: unitEl.value,
        onSave: (amt, unit) => {
            amountEl.value = amt;
            unitEl.value = unit;
            document.getElementById('add-item-amount-tap').textContent = amt + ' ' + unit;
        }
    });
}

// בירור מאקרו דרך Gemini + חיפוש באינטרנט (להזנה בכתב בלבד).
// מחזיר את הטקסט המלא (מכיל JSON). זורק שגיאה אם נכשל / חריגה ממגבלה.
async function geminiMacroLookup(prompt) {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('לא מחובר');

    const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            model: 'gemini-3.5-flash',
            kind: 'macro',
            payload: {
                generation_config: { response_modalities: ["TEXT"] },
                tools: [{ google_search: {} }],
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            }
        })
    });
    if (resp.status === 429) {
        const e = await resp.json().catch(() => ({}));
        const err = new Error(e.error || 'הגעת למגבלת הבירורים בשעה');
        err.code = 429;
        throw err;
    }
    if (!resp.ok) throw new Error('שגיאה בחישוב');

    // קריאת ה-stream והרכבת הטקסט המלא
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
                const parsed = JSON.parse(jsonStr);
                const t = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (t) fullText += t;
            } catch {}
        }
    }
    return fullText;
}

async function confirmAddItem() {
    const nameEl   = document.getElementById('add-item-name');
    const amountEl = document.getElementById('add-item-amount');
    const unitEl   = document.getElementById('add-item-unit');
    if (!nameEl || !amountEl) return;
    const name   = nameEl.value.trim();
    const amount = parseFloat(amountEl.value) || 100;
    const unit   = unitEl ? unitEl.value : 'גרם';
    if (!name) { nameEl.focus(); return; }

    // מאכל אישי שנבחר מהחיפוש - מאקרו לפי היחידה שהוגדרה לו
    const selSource = window._selectedFoodSource;
    if (selSource && selSource.type === 'custom' && selSource.label === name) {
        const macros = _customFoodMacrosForAmount(selSource.ref, amount);
        scannedItems.push({
            name,
            unit_amount: amount,
            unit,
            grams: unit === 'גרם' ? amount : null,
            protein_g: macros.protein_g,
            fat_g: macros.fat_g,
            carbs_g: macros.carbs_g,
            alcohol_g: macros.alcohol_g || 0,
            kcal_g: macros.kcal_g
        });
        updateScannedTotals();
        renderScanDetails();
        return;
    }

    // מוצר שנמצא במאגר הישראלי לפי שם - נשלף לפי ברקוד (יחסית ל-100 גרם)
    if (selSource && selSource.type === 'barcode' && selSource.label === name && unit === 'גרם') {
        const row = document.getElementById('add-item-row');
        if (row) row.innerHTML = `<span style="color:var(--text-secondary);font-size:12px;">מחפשים מידע תזונתי...</span>`;
        const macros = await resolveBarcodeProductMacros(selSource.ref.barcode);
        if (macros) {
            const ratio = amount / 100;
            scannedItems.push({
                name,
                unit_amount: amount,
                unit,
                grams: amount,
                protein_g: Math.round(macros.protein_g * ratio * 10) / 10,
                fat_g: Math.round(macros.fat_g * ratio * 10) / 10,
                carbs_g: Math.round(macros.carbs_g * ratio * 10) / 10,
                alcohol_g: Math.round((macros.alcohol_g || 0) * ratio * 10) / 10,
                kcal_g: macros.kcal_g != null ? Math.round(macros.kcal_g * ratio) : null
            });
            updateScannedTotals();
            renderScanDetails();
            return;
        }
        if (row) row.innerHTML = `<button onclick="showAddItemForm()" style="background:none;border:none;color:var(--text-secondary);font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוספת פריט</button>`;
    }

    const isGrams = unit === 'גרם';

    // Try USDA first (only when unit is grams)
    if (isGrams) {
        const usdaItem = enrichItemMacros({ name, grams: amount, lookup_name: name });
        const foundInUSDA = usdaItem.protein_g > 0 || usdaItem.fat_g > 0 || usdaItem.carbs_g > 0;
        if (foundInUSDA) {
            usdaItem.name = name;
            usdaItem.unit_amount = amount;
            usdaItem.unit = unit;
            scannedItems.push(usdaItem);
            updateScannedTotals();
            renderScanDetails();
            return;
        }
    }

    // Gemini + חיפוש באינטרנט — תומך בגרמים וביחידות אחרות
    const row = document.getElementById('add-item-row');
    if (row) row.innerHTML = `<span style="color:var(--text-secondary);font-size:12px;">מחפשים מידע תזונתי...</span>`;

    try {
        const prompt = isGrams
            ? `מהם ערכי המאקרו של ${amount} גרם ${name}? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם המאכל/משקה מכיל אלכוהול טהור — כלול גם alcohol_g (גרם אלכוהול טהור), אחרת 0. החזר JSON בלבד ללא הסברים: {"grams": ${amount}, "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}`
            : `${amount} ${unit} של ${name} — כמה גרם זה וערכי מאקרו? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם המאכל/משקה מכיל אלכוהול טהור — כלול גם alcohol_g (גרם אלכוהול טהור), אחרת 0. החזר JSON בלבד ללא הסברים: {"grams": X, "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}`;
        let text;
        try {
            text = await geminiMacroLookup(prompt);
        } catch (e) {
            if (e.code === 429) {
                const row2 = document.getElementById('add-item-row');
                if (row2) row2.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${e.message}</span>`;
                return;
            }
            throw e;
        }
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error('no json');
        const macros = JSON.parse(match[0]);
        scannedItems.push({
            name,
            unit_amount: amount,
            unit,
            grams: macros.grams || amount,
            protein_g: macros.protein_g || 0,
            fat_g: macros.fat_g || 0,
            carbs_g: macros.carbs_g || 0,
            alcohol_g: macros.alcohol_g || 0
        });
    } catch (e) {
        scannedItems.push({ name, unit_amount: amount, unit, grams: amount, protein_g: 0, fat_g: 0, carbs_g: 0, alcohol_g: 0 });
    }
    updateScannedTotals();
    renderScanDetails();
}

function deleteScannedItem(idx) {
    _deletedItem = scannedItems[idx];
    _deletedIdx = idx;
    scannedItems.splice(idx, 1);
    updateScannedTotals();
    renderScanDetails();
    // הצג toast
    const toast = document.getElementById('scan-undo-toast');
    toast.classList.remove('hidden');
    if (_undoTimer) clearTimeout(_undoTimer);
    _undoTimer = setTimeout(() => {
        toast.classList.add('hidden');
        _deletedItem = null;
        _deletedIdx = null;
    }, 2000);
}

function undoDeleteItem() {
    if (_deletedItem === null) return;
    clearTimeout(_undoTimer);
    scannedItems.splice(_deletedIdx, 0, _deletedItem);
    _deletedItem = null;
    _deletedIdx = null;
    updateScannedTotals();
    renderScanDetails();
    document.getElementById('scan-undo-toast').classList.add('hidden');
}

function editItemGrams(idx, el) {
    const current = Math.round(scannedItems[idx].grams);
    openNumberRulerSheet({
        min: 1, max: 1000, step: 1, labelStep: 100,
        title: 'כמות', unit: 'גרם',
        value: current,
        onSave: (val) => {
            if (val > 0) {
                // שינוי גרמים לא אמור לחפש מחדש את המאכל (בברקוד/AI/USDA) — רק להכפיל את המאקרו
                // שכבר נמצא לפריט הזה ביחס לגרמים החדשים. חיפוש מחדש (enrichItemMacros) עלול להתאים
                // בטעות למוצר אחר לגמרי בטבלת USDA ולזרוק מאקרו מדויק שכבר היה קיים.
                const item = scannedItems[idx];
                const ratio = val / item.grams;
                let updated = {
                    ...item,
                    grams: val,
                    protein_g: Math.round((item.protein_g || 0) * ratio * 10) / 10,
                    fat_g: Math.round((item.fat_g || 0) * ratio * 10) / 10,
                    carbs_g: Math.round((item.carbs_g || 0) * ratio * 10) / 10,
                    alcohol_g: Math.round((item.alcohol_g || 0) * ratio * 10) / 10,
                    kcal_g: item.kcal_g != null ? Math.round(item.kcal_g * ratio) : null
                };
                // אותה תקרת בטיחות פיזית כמו ב-enrichItemMacros — לא תלוית מקור
                const proteinCap = updated.grams * 0.9;
                if (updated.protein_g > proteinCap) updated.protein_g = Math.round(proteinCap * 10) / 10;
                ['carbs_g', 'fat_g'].forEach(key => {
                    if (updated[key] > updated.grams) updated[key] = Math.round(updated.grams * 10) / 10;
                });
                scannedItems[idx] = updated;
                updateScannedTotals();
            }
            renderScanDetails();
        }
    });
}

function updateScannedTotals() {
    scannedGrams = {
        protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
        fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
        carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0)),
        alcohol: Math.round(scannedItems.reduce((s, i) => s + (i.alcohol_g || 0), 0)),
        kcal:    Math.round(scannedItems.reduce((s, i) => s + (typeof entryKcal === 'function' ? entryKcal(i) : ((i.protein_g||0)*4 + (i.carbs_g||0)*4 + (i.fat_g||0)*9 + (i.alcohol_g||0)*7)), 0))
    };
    renderScanGramsSummary();
}

// תצוגה משותפת של סיכום ארוחה בגרמים: קלוריות + חלבון/פחמימה/שומן בגרמים (ללא המרה למנות)
function renderScanGramsSummary() {
    const kcal = (scannedGrams.kcal != null)
        ? Math.round(scannedGrams.kcal)
        : Math.round(scannedGrams.protein * 4 + scannedGrams.carbs * 4 + scannedGrams.fat * 9 + scannedGrams.alcohol * 7);
    document.getElementById('scan-portions').innerHTML =
        `<div style="text-align:center;margin-bottom:10px;">
            <div style="font-size:26px;font-weight:800;color:var(--accent-dark);">${kcal}</div>
            <div style="font-size:12px;color:var(--text-secondary);">קלוריות בארוחה</div>
        </div>` +
        `<div style="display:flex; flex-direction:column; gap:6px;">` +
        `<div><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 10c0-3 3-6 8-6s9 2 9 6-3 5-4 7-1 5-5 5-6-2-7-5-1-4-1-7z"/><path d="M9 9l2 2M13 8l2 3M8 13l2 2"/></svg> חלבון: <b>${scannedGrams.protein} גרם</b></div>` +
        `<div><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 12c0 4 3.6 7 8 7s8-3 8-7"/><path d="M4 12h16"/><ellipse cx="12" cy="12" rx="8" ry="2.5"/></svg> פחמימה: <b>${scannedGrams.carbs} גרם</b></div>` +
        `<div><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><ellipse cx="12" cy="13" rx="7" ry="8.5"/><circle cx="12" cy="14" r="3"/></svg> שומן: <b>${scannedGrams.fat} גרם</b></div>` +
        (scannedGrams.alcohol > 0 ? `<div style="color:var(--alcohol);"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M8 3h8l-1.5 8.5a2.5 2.5 0 0 1-2.47 2.07l-.03 0a2.5 2.5 0 0 1-2.47-2.07L8 3z"/><path d="M12 13.5V21"/><path d="M8.5 21h7"/></svg> אלכוהול: <b>${scannedGrams.alcohol} גרם</b></div>` : '') +
        `</div>`;
}

// ── מאכלים מוצעים בפתיחת החיפוש (לפני הקלדה): מיקס של מאכלים ששמרת + מאכלים שאתה אוכל הרבה ─────

const _SUGG_ICON_FREQUENT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#f59e0b" stroke="#f59e0b" stroke-width="1" stroke-linejoin="round"><path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.7l7.1-.6z"/></svg>';

let _quickPickFoodMatches = null; // מטמון לתדירות אכילה (14 יום) — נשלף פעם אחת לפתיחה
let _quickPickLoadedForUid = null;

// מקבץ שורות יומן מ-14 הימים האחרונים לפי שם מדויק (אחרי ניקוי רווחים), ובונה
// "מאכל" מוצע לכל מאכל שנאכל לפחות פעמיים: הכמות שחוזרת הכי הרבה (שכיח), או ממוצע אם כל הכמויות שונות
function _buildFrequentFoodMatches(rows) {
    const groups = {};
    (rows || []).forEach(r => {
        const name = (r.food || '').trim();
        if (!name) return;
        (groups[name] = groups[name] || []).push(r);
    });
    return Object.entries(groups)
        .filter(([, entries]) => entries.length >= 2)
        .map(([name, entries]) => {
            entries.sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
            const latest = entries[entries.length - 1];
            const gramsCounts = {};
            entries.forEach(e => { const g = Math.round(e.grams || 0); gramsCounts[g] = (gramsCounts[g] || 0) + 1; });
            const [modeGrams, modeCount] = Object.entries(gramsCounts).sort((a, b) => b[1] - a[1])[0];
            const typicalAmount = modeCount > 1
                ? parseInt(modeGrams)
                : Math.round(entries.reduce((s, e) => s + (e.grams || 0), 0) / entries.length);
            return {
                type: 'custom',
                ref: {
                    unit_amount: latest.grams || typicalAmount || 100,
                    unit: 'גרם',
                    protein_g: latest.protein_g || 0,
                    carbs_g:   latest.carbs_g   || 0,
                    fat_g:     latest.fat_g     || 0,
                    alcohol_g: latest.alcohol_g || 0
                },
                label: name,
                sub: `נאכל ${entries.length} פעמים לאחרונה`,
                icon: _SUGG_ICON_FREQUENT,
                _displayAmount: typicalAmount || latest.grams || 100,
                _count: entries.length
            };
        })
        .sort((a, b) => b._count - a._count);
}

async function _loadQuickPickFoods() {
    const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    if (!uid || typeof sbFetchFoodLogRange !== 'function') return;
    const since = new Date(); since.setDate(since.getDate() - 14);
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    try {
        const rows = await sbFetchFoodLogRange(uid, sinceStr);
        _quickPickFoodMatches = _buildFrequentFoodMatches(rows);
        _quickPickLoadedForUid = uid;
    } catch (_) { _quickPickFoodMatches = []; }
    renderQuickPicks();
}

// מציג עד 8 מאכלים כשהחיפוש עדיין ריק: קודם עד 3 מהמאכלים האישיים ששמרת, ואז מהנפוצים בהיסטוריה.
// נקרא גם באופן א-סינכרוני אחרי טעינת נתונים - לכן בודק בעצמו שהחיפוש עדיין ריק לפני שהוא דורס תוצאות
function renderQuickPicks() {
    const box = document.getElementById('add-item-suggestions');
    if (!box) return;
    const nameEl = document.getElementById('add-item-name');
    if (nameEl && nameEl.value.trim()) return; // המשתמש כבר מקליד חיפוש - לא לדרוס
    const customPicks = (typeof _myFoods !== 'undefined' ? _myFoods : []).slice(0, 3).map(f => {
        const kcal = (f.kcal_g != null) ? Math.round(f.kcal_g) : Math.round((f.protein_g || 0) * 4 + (f.carbs_g || 0) * 4 + (f.fat_g || 0) * 9 + (f.alcohol_g || 0) * 7);
        return { type: 'custom', ref: f, label: f.name, sub: `${kcal} קל' ל-${f.unit_amount} ${f.unit}`, icon: _SUGG_ICON_CUSTOM };
    });
    const usedNames = new Set(customPicks.map(m => m.label));
    const frequentPicks = (_quickPickFoodMatches || [])
        .filter(m => !usedNames.has(m.label))
        .slice(0, 8 - customPicks.length);
    const matches = [...customPicks, ...frequentPicks];
    if (!matches.length) { box.innerHTML = ''; window._currentFoodSuggestions = []; return; }
    _renderFoodSuggestionMatches(matches, box);
}

function openFoodScanner() {
    if (typeof USDA_TABLE === 'undefined' && !window._usdaLoading) {
        window._usdaLoading = true;
        const s = document.createElement('script');
        s.src = '/usda.js';
        document.head.appendChild(s);
    }
    if (typeof _loadMyFoodsData === 'function' && !_myFoodsLoaded) {
        _loadMyFoodsData().then(() => { if (typeof renderQuickPicks === 'function') renderQuickPicks(); });
    }
    const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    if (uid && uid !== _quickPickLoadedForUid) _loadQuickPickFoods();
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    scannedImageBase64 = null;
    scannedImageMime = null;
    document.getElementById('food-preview').classList.add('hidden');
    // ברירת המחדל בפתיחה היא מסך החיפוש - אין צורך ללחוץ על טאב כדי לראות אותו
    openTextEntry();
    _applyScannerModeUI();
}

// פותח את הצ'אט עם המאמן AI ושולח אוטומטית בקשה לרעיון לארוחה
function openMealIdeaChat() {
    openAIChat();
    const input = document.getElementById('ai-chat-input');
    input.value = 'רוצה רעיון לארוחה? אפשר להחליט ביחד.';
    sendAIMessage();
}

// חזרה למסך החיפוש - נקרא גם בפתיחת המודל וגם בלחיצה על טאב "חיפוש" (למשל כשחוזרים מתוצאת צילום)
function openTextEntry() {
    scannedItems = [];
    scannedGrams = { protein: 0, fat: 0, carbs: 0, alcohol: 0 };
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-step-1').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('scanner-error').classList.add('hidden');
    document.getElementById('scan-food-label').style.display = 'none';
    document.getElementById('scan-food-name').style.display = 'none';
    document.getElementById('scan-food-name').value = '';
    document.getElementById('scan-portions').innerHTML = '';
    document.getElementById('scan-details-box').innerHTML = '<div id="add-item-row"></div>';
    const _scanCorr = document.getElementById('scan-correction');
    if (_scanCorr) _scanCorr.value = '';
    document.getElementById('scan-undo-toast').classList.add('hidden');
    // "בקשת תיקון" ו"הערכה בלבד" רלוונטיים רק לזיהוי AI מתמונה - לא לחיפוש שבו המשתמש בוחר בעצמו
    document.getElementById('scan-correction-row').style.display = 'none'; // מוסתר בחיפוש - אין זיהוי AI לתקן
    document.getElementById('scan-disclaimer').style.display = 'none';
    const _scanSaveRecipe = document.getElementById('scan-save-recipe');
    if (_scanSaveRecipe) _scanSaveRecipe.checked = false;
    const _scanRecipeName = document.getElementById('scan-recipe-name');
    if (_scanRecipeName) _scanRecipeName.value = '';
    document.getElementById('scan-recipe-name-row')?.classList.add('hidden');
    document.getElementById('scanner-step-2').classList.remove('hidden');
    showAddItemForm();
}

function closeFoodScanner() {
    document.getElementById('food-scanner-modal').classList.add('hidden');
    // ביטול לפני שסיימו (X / קליק בחוץ) בהקשר "מאכל אישי חדש"/"הוספת מרכיב" - חוזרים למסך המקור
    if (_scannerMode === 'new-food') {
        const m = document.getElementById('myfoods-modal');
        if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
    } else if (_scannerMode === 'recipe-ingredient') {
        const m = document.getElementById('custom-recipe-modal');
        if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
    }
    _scannerMode = 'journal';
}

function handleFoodImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        scannedImageMime = file.type;
        scannedImageBase64 = dataUrl.split(',')[1];
        const preview = document.getElementById('food-preview');
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        analyzeFood(scannedImageBase64, scannedImageMime, '');
    };
    reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('food-image-input').addEventListener('change', function(e) {
        handleFoodImageFile(e.target.files[0]);
        e.target.value = '';
    });
    document.getElementById('food-gallery-input').addEventListener('change', function(e) {
        handleFoodImageFile(e.target.files[0]);
        e.target.value = '';
    });
});

async function compressImage(base64, mimeType) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = function() {
            const MAX = 800;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                else                { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.src = `data:${mimeType};base64,${base64}`;
    });
}

const SCAN_LOADING_MESSAGES = ['בודקים את המרכיבים...', 'מזהים גדלי מנות...', 'מחשבים ערכים תזונתיים...'];
let _scanLoadingInterval = null;

function startScanLoadingAnimation() {
    const textEl = document.getElementById('scanner-loading-text');
    const barEl = document.getElementById('scanner-loading-bar');
    if (!textEl || !barEl) return;
    let msgIndex = 0;
    let pct = 12;
    textEl.textContent = SCAN_LOADING_MESSAGES[0];
    barEl.style.transition = 'width 1.7s cubic-bezier(0.16, 1, 0.3, 1)';
    barEl.style.width = pct + '%';
    _scanLoadingInterval = setInterval(() => {
        // מתקדם רק קדימה, לעולם לא חוזר אחורה, ולא מגיע ל-100% עד שהתשובה באמת חזרה
        pct = pct + (90 - pct) * 0.3;
        barEl.style.width = pct + '%';
        if (msgIndex < SCAN_LOADING_MESSAGES.length - 1) {
            msgIndex++;
            textEl.style.opacity = '0';
            setTimeout(() => {
                textEl.textContent = SCAN_LOADING_MESSAGES[msgIndex];
                textEl.style.opacity = '1';
            }, 300);
        }
    }, 1900);
}

function finishScanLoadingAnimation() {
    const barEl = document.getElementById('scanner-loading-bar');
    if (!barEl) return;
    barEl.style.transition = 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    barEl.style.width = '100%';
}

function stopScanLoadingAnimation() {
    if (_scanLoadingInterval) { clearInterval(_scanLoadingInterval); _scanLoadingInterval = null; }
}

async function analyzeFood(base64, mimeType, correction) {
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.remove('hidden');
    document.getElementById('scanner-error').classList.add('hidden');
    startScanLoadingAnimation();

    const compressed = await compressImage(base64, mimeType);
    base64 = compressed.base64;
    mimeType = compressed.mimeType;

    const prevList = scannedItems.length > 0
        ? `\nהפריטים שזוהו עד כה:\n${scannedItems.map(i => `- ${i.name} (${Math.round(i.grams)}g)`).join('\n')}\n`
        : '';
    const correctionNote = correction
        ? `תיקון מהמשתמש: "${correction}"\nשמור על כל הפריטים שנכונים. שנה/הסר/הוסף רק את מה שהמשתמש ציין במפורש.${prevList}\n`
        : '';
    const prompt = `${correctionNote}זהה את האוכל בתמונה והעריך כמויות בצורה מדויקת ככל האפשר.
הנחיות:
- העריך לפי גודל המנה הנראה בתמונה ביחס לצלחת/כלי
- השתמש בערכי מאגר USDA לחישוב מאקרו לפי גרמים
- זהה לפי מה שאתה רואה בתמונה בלבד — צבע, צורה, מרקם. אל תניח סוג מאכל לפי הקשר
- כדורים חומים יכולים להיות קציצות בשר, פלאפל, כדורי עוף — זהה לפי מרקם ומראה
- ירוק כהה וקרמי = כנראה אבוקדו, לא חסה
- אל תניח שהמנה טבעונית או צמחונית
- אם לא ניתן לזהות בוודאות — אל תכלול. עדיף פחות פריטים נכונים מאשר פריטים שגויים
- items חייב לכלול כל רכיב בנפרד (לדוגמה: אורז, חזה עוף, שמן)
- אסור לאחד שני מאכלים שונים לפריט אחד
- עבור כל פריט ב-items: חשב מאקרו לאותו פריט בלבד לפי USDA
- protein_g/fat_g/carbs_g ברמת ה-food = סכום כל הפריטים
- אם פריט הוא משקה אלכוהולי (יין, בירה, קוקטייל וכו') — כלול גם alcohol_g (גרם אלכוהול טהור באותו פריט), אחרת 0
החזר JSON בלבד, ללא טקסט נוסף:
{"food": "שם האוכל בעברית", "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X, "items": [{"name": "שם מאכל מלא", "lookup_name": "שם המאכל הגולמי בלבד ביחיד, בלי תוספות הכנה/תיבול/צורת בישול (למשל 'תפוח אדמה' לא 'תפוחי אדמה בתנור עם שמן', 'עוף' לא 'חזה עוף צלוי')", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}, ...]}`;

    try {
        const { data: { session: _scanSession } } = await db.auth.getSession();
        if (!_scanSession) throw new Error('לא מחובר');
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_scanSession.access_token}` },
            body: JSON.stringify({
                model: 'gemini-3.5-flash',
                payload: {
                    contents: [{ role: 'user', parts: [
                        { inline_data: { mime_type: mimeType, data: base64 } },
                        { text: prompt }
                    ] }],
                    generation_config: { response_mime_type: 'application/json' }
                }
            })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'gemini error'); }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) fullText += text;
                } catch {}
            }
        }

        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const result = JSON.parse(jsonMatch[0]);

        scannedItems = (Array.isArray(result.items) ? result.items : []).map(enrichItemMacros);
        // הסכום היומי תמיד מחושב מסכימת הפריטים בפועל (אחרי enrichItemMacros) —
        // לא מהערכה כוללת נפרדת של ה-AI, כדי שלא ייווצר פער בין הכרטיס ליומן לבין הסכום היומי
        scannedGrams = {
            protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
            fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
            carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0)),
            alcohol: Math.round(scannedItems.reduce((s, i) => s + (i.alcohol_g || 0), 0))
        };

        document.getElementById('scan-food-label').style.display = '';
        document.getElementById('scan-food-name').style.display = '';
        document.getElementById('scan-food-name').value = result.food;
        renderScanGramsSummary();

        renderScanDetails();
        // "בקשת תיקון" ו"הערכה בלבד" רלוונטיים כאן - זה זיהוי AI שיכול לטעות
        document.getElementById('scan-correction-row').style.display = 'block';
        document.getElementById('scan-disclaimer').style.display = '';
        stopScanLoadingAnimation();
        finishScanLoadingAnimation();
        await new Promise(r => setTimeout(r, 350));
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    } catch (err) {
        stopScanLoadingAnimation();
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
        const errMsg = err.message.includes('מגבלת') ? err.message : 'לא הצלחתי לזהות את האוכל';
        const errEl = document.getElementById('scanner-error');
        errEl.innerHTML = '<span style="display:inline-flex;color:#f59e0b;vertical-align:-3px;flex-shrink:0;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg></span> ';
        errEl.appendChild(document.createTextNode(errMsg));
        errEl.classList.remove('hidden');
        document.getElementById('scan-portions').innerHTML = '';
        scannedGrams = { protein: 0, fat: 0, carbs: 0, alcohol: 0 };
    }
}

function toggleScanDetails() {
    const box = document.getElementById('scan-details-box');
    const btn = document.getElementById('scan-details-btn');
    const open = box.classList.toggle('hidden');
    btn.textContent = open ? '▼ פרטים נוספים' : '▲ הסתר פרטים';
}

async function recalculate() {
    const correction = document.getElementById('scan-correction')?.value.trim() || '';
    if (!correction) return;

    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.remove('hidden');
    document.getElementById('scanner-error').classList.add('hidden');
    startScanLoadingAnimation();

    const itemsList = scannedItems.map((it, i) => `${i + 1}. ${it.name} — ${Math.round(it.grams)}g`).join('\n');
    const prompt = `אתה עוזר לניתוח תזונה. להלן רשימת המאכלים שזוהו בצלחת:
${itemsList}

המשתמש אומר: "${correction}"

עדכן את הרשימה לפי הוראות המשתמש בדיוק. שנה/הסר/הוסף רק את מה שצוין במפורש. אל תשנה גרמים או פרטים של פריטים שלא הוזכרו — שמור אותם זהים לחלוטין.
החזר JSON בלבד:
אם פריט מכיל אלכוהול טהור — כלול גם alcohol_g, אחרת 0.
{"food": "תיאור קצר", "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X, "items": [{"name": "שם", "lookup_name": "שם המאכל הגולמי בלבד ביחיד, בלי תוספות הכנה/תיבול/צורת בישול", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}]}`;

    try {
        const { data: { session: _s } } = await db.auth.getSession();
        if (!_s) throw new Error('לא מחובר');
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s.access_token}` },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'claude error'); }
        const { text: fullText } = await response.json();
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const result = JSON.parse(jsonMatch[0]);

        scannedItems = (Array.isArray(result.items) ? result.items : []).map(enrichItemMacros);
        scannedGrams = {
            protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
            fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
            carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0)),
            alcohol: Math.round(scannedItems.reduce((s, i) => s + (i.alcohol_g || 0), 0))
        };

        document.getElementById('scan-food-name').value = result.food;
        renderScanGramsSummary();
        renderScanDetails();
        const _sc = document.getElementById('scan-correction');
        if (_sc) _sc.value = '';
    } catch (err) {
        const errMsg2 = err.message?.includes('מגבלת') ? err.message : 'שגיאה בחישוב מחדש';
        const errEl2 = document.getElementById('scanner-error');
        errEl2.innerHTML = '<span style="display:inline-flex;color:#f59e0b;vertical-align:-3px;flex-shrink:0;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg></span> ';
        errEl2.appendChild(document.createTextNode(errMsg2));
        errEl2.classList.remove('hidden');
    } finally {
        stopScanLoadingAnimation();
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    }
}
