// ===== תזונה: סורק מזון, מאקרו, יומן אוכל, מנות =====

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
    // חלבון: אין מאכל שלם/מבושל שעובר 50% מהמשקל בחלבון (זה היה הבאג המקורי).
    // שומן/פחמימה: יכולים להגיע ל-100% מהמשקל באמת (שמן = שומן טהור, סוכר = פחמימה טהורה) -
    // התקרה עליהם היא רק הגבול הפיזי (לא ניתן שמאקרו יהיה יותר ממשקל המאכל עצמו).
    if (result.grams) {
        const proteinCap = result.grams * 0.5;
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

function renderScanDetails() {
    const detailsBox = document.getElementById('scan-details-box');
    const itemsHtml = scannedItems.map((item, i) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <button onclick="deleteScannedItem(${i})" style="background:none;border:none;color:#888;cursor:pointer;padding:0 6px;line-height:1;min-width:32px;display:inline-flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            <span style="flex:1;text-align:right;font-size:15px;">${_esc(item.name)} — <span onclick="editItemGrams(${i}, this)" style="color:#aaa;cursor:pointer;text-decoration:underline dotted;">${Math.round(item.grams)}g</span></span>
        </div>`
    ).join('');
    // כפתור "הוספת פריט" מוצג תמיד — גם כשאין עדיין פריטים (למשל אחרי מחיקת הפריט האחרון)
    detailsBox.innerHTML = itemsHtml + `<div id="add-item-row" style="margin-top:6px;">
        <button onclick="showAddItemForm()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוספת פריט</button>
    </div>`;
}

function showAddItemForm() {
    const row = document.getElementById('add-item-row');
    if (!row) return;
    row.innerHTML = `
        <div class="entry-pill">
            <button class="entry-pill-btn entry-pill-cancel" onclick="renderScanDetails()" aria-label="ביטול"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            <div class="entry-pill-div"></div>
            <input id="add-item-amount" type="number" placeholder="כמות" value="100" class="entry-pill-amt" />
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
    document.getElementById('add-item-amount').addEventListener('focus', function() { this.select(); });
    document.getElementById('add-item-amount').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddItem(); });
    document.getElementById('add-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') { document.getElementById('add-item-suggestions').innerHTML = ''; document.getElementById('add-item-amount').focus(); } });
    document.getElementById('add-item-name').addEventListener('input', function() { renderFoodSuggestions(this.value); });
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
    if (q.length < 2) { box.innerHTML = ''; return; }
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
            const kcal = Math.round((f.protein_g || 0) * 4 + (f.carbs_g || 0) * 4 + (f.fat_g || 0) * 9 + (f.alcohol_g || 0) * 7);
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
        `<div onclick="selectFoodSuggestion(${i})" data-sugg-idx="${i}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 6px;background:#2c2c2e;border-radius:4px;cursor:pointer;font-size:13.5px;">
            <span style="display:flex;align-items:center;gap:6px;min-width:0;"><span style="flex-shrink:0;display:flex;">${m.icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(m.label)}</span></span>
            <span style="color:#888;font-size:11.5px;flex-shrink:0;">${m.sub}</span>
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
        if (amountEl) amountEl.value = match.ref.unit_amount;
    } else if (match.type === 'barcode') {
        window._selectedFoodSource = match;
        if (unitEl) unitEl.value = 'גרם';
    } else {
        window._selectedFoodSource = null; // usda - ניתן לחפש בטבלה בזמן האישור, לא צריך לשמור הפניה
        if (unitEl) unitEl.value = 'גרם';
    }
    if (box) box.innerHTML = '';
    if (amountEl) { amountEl.focus(); amountEl.select(); }
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
            model: 'gemini-2.5-flash',
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
            name: `${name} (${amount} ${unit})`,
            grams: unit === 'גרם' ? amount : null,
            protein_g: macros.protein_g,
            fat_g: macros.fat_g,
            carbs_g: macros.carbs_g,
            alcohol_g: macros.alcohol_g || 0
        });
        updateScannedTotals();
        renderScanDetails();
        return;
    }

    // מוצר שנמצא במאגר הישראלי לפי שם - נשלף לפי ברקוד (יחסית ל-100 גרם)
    if (selSource && selSource.type === 'barcode' && selSource.label === name && unit === 'גרם') {
        const row = document.getElementById('add-item-row');
        if (row) row.innerHTML = `<span style="color:#888;font-size:12px;">מחפש מידע תזונתי...</span>`;
        const macros = await resolveBarcodeProductMacros(selSource.ref.barcode);
        if (macros) {
            const ratio = amount / 100;
            scannedItems.push({
                name: `${name} (${amount} ${unit})`,
                grams: amount,
                protein_g: Math.round(macros.protein_g * ratio * 10) / 10,
                fat_g: Math.round(macros.fat_g * ratio * 10) / 10,
                carbs_g: Math.round(macros.carbs_g * ratio * 10) / 10,
                alcohol_g: Math.round((macros.alcohol_g || 0) * ratio * 10) / 10
            });
            updateScannedTotals();
            renderScanDetails();
            return;
        }
        if (row) row.innerHTML = `<button onclick="showAddItemForm()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוספת פריט</button>`;
    }

    const isGrams = unit === 'גרם';

    // Try USDA first (only when unit is grams)
    if (isGrams) {
        const usdaItem = enrichItemMacros({ name, grams: amount, lookup_name: name });
        const foundInUSDA = usdaItem.protein_g > 0 || usdaItem.fat_g > 0 || usdaItem.carbs_g > 0;
        if (foundInUSDA) {
            usdaItem.name = `${name} (${amount} ${unit})`;
            scannedItems.push(usdaItem);
            updateScannedTotals();
            renderScanDetails();
            return;
        }
    }

    // Gemini + חיפוש באינטרנט — תומך בגרמים וביחידות אחרות
    const row = document.getElementById('add-item-row');
    if (row) row.innerHTML = `<span style="color:#888;font-size:12px;">מחפש מידע תזונתי...</span>`;

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
            name: `${name} (${amount} ${unit})`,
            grams: macros.grams || amount,
            protein_g: macros.protein_g || 0,
            fat_g: macros.fat_g || 0,
            carbs_g: macros.carbs_g || 0,
            alcohol_g: macros.alcohol_g || 0
        });
    } catch (e) {
        scannedItems.push({ name, grams: amount, protein_g: 0, fat_g: 0, carbs_g: 0, alcohol_g: 0 });
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
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.style.cssText = 'width:52px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:16px;padding:2px 4px;text-align:center;';
    el.replaceWith(input);
    input.focus();
    input.select();
    const save = () => {
        const val = parseInt(input.value);
        if (val > 0) {
            scannedItems[idx] = enrichItemMacros({ ...scannedItems[idx], grams: val });
            updateScannedTotals();
        }
        renderScanDetails();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { input.blur(); } });
}

function updateScannedTotals() {
    scannedGrams = {
        protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
        fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
        carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0)),
        alcohol: Math.round(scannedItems.reduce((s, i) => s + (i.alcohol_g || 0), 0))
    };
    renderScanGramsSummary();
}

// תצוגה משותפת של סיכום ארוחה בגרמים: קלוריות + חלבון/פחמימה/שומן בגרמים (ללא המרה למנות)
function renderScanGramsSummary() {
    const kcal = Math.round(scannedGrams.protein * 4 + scannedGrams.carbs * 4 + scannedGrams.fat * 9 + scannedGrams.alcohol * 7);
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

function openFoodScanner() {
    if (typeof USDA_TABLE === 'undefined' && !window._usdaLoading) {
        window._usdaLoading = true;
        const s = document.createElement('script');
        s.src = '/usda.js';
        document.head.appendChild(s);
    }
    if (typeof _loadMyFoodsData === 'function' && !_myFoodsLoaded) _loadMyFoodsData();
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    scannedImageBase64 = null;
    scannedImageMime = null;
    document.getElementById('food-preview').classList.add('hidden');
    // ברירת המחדל בפתיחה היא מסך החיפוש - אין צורך ללחוץ על טאב כדי לראות אותו
    openTextEntry();
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
    document.getElementById('scan-portions').innerHTML = '';
    document.getElementById('scan-details-box').innerHTML = '<div id="add-item-row"></div>';
    const _scanCorr = document.getElementById('scan-correction');
    if (_scanCorr) _scanCorr.value = '';
    document.getElementById('scan-undo-toast').classList.add('hidden');
    // "בקשת תיקון" ו"הערכה בלבד" רלוונטיים רק לזיהוי AI מתמונה - לא לחיפוש שבו המשתמש בוחר בעצמו
    document.getElementById('scan-correction-row').style.display = 'none'; // מוסתר בחיפוש - אין זיהוי AI לתקן
    document.getElementById('scan-disclaimer').style.display = 'none';
    document.getElementById('scanner-step-2').classList.remove('hidden');
    showAddItemForm();
}

function closeFoodScanner() {
    document.getElementById('food-scanner-modal').classList.add('hidden');
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

const SCAN_LOADING_MESSAGES = ['בודק את המרכיבים...', 'מזהה גדלי מנות...', 'מחשב ערכים תזונתיים...'];
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
        {
            const _foodNameEl = document.getElementById('scan-food-name');
            _foodNameEl.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M5.5 3v6M8 3v6M10.5 3v6"/><path d="M5.5 9c0 1.8 2.5 1.8 2.5 1.8S10.5 10.8 10.5 9"/><path d="M8 10.8v10.2"/><path d="M17 3l2 6-2 3"/><path d="M17 3v18"/></svg> ';
            _foodNameEl.appendChild(document.createTextNode(result.food));
        }
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

        {
            const _foodNameEl = document.getElementById('scan-food-name');
            _foodNameEl.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M5.5 3v6M8 3v6M10.5 3v6"/><path d="M5.5 9c0 1.8 2.5 1.8 2.5 1.8S10.5 10.8 10.5 9"/><path d="M8 10.8v10.2"/><path d="M17 3l2 6-2 3"/><path d="M17 3v18"/></svg> ';
            _foodNameEl.appendChild(document.createTextNode(result.food));
        }
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

// ── יומן אוכל יומי ──────────────────────────────────────────────────────────

function _foodLogKey() {
    const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    const today = typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0, 10);
    return 'food_log_' + (uid || 'default') + '_' + today;
}

function saveFoodLogEntries(entries) {
    localStorage.setItem(_foodLogKey(), JSON.stringify(entries));
}

// מוחק יומני אוכל של ימים שעברו — משאיר רק את היום
function cleanupOldFoodLogs() {
    const today = typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0, 10);
    const suffix = '_' + today;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('food_log_') && !k.endsWith(suffix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
}

// מקבץ פריטי יומן לארוחות לפי פערי זמן — פריטים שהוזנו בתוך 90 דקות זה מזה נחשבים אותה ארוחה
function _groupFoodLogByMeal(items, getTime) {
    const MEAL_GAP_MINUTES = 90;
    const toMinutes = t => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const groups = [];
    let current = null;
    items.forEach(item => {
        const mins = toMinutes(getTime(item));
        if (!current || mins == null || current.lastMinutes == null || mins - current.lastMinutes > MEAL_GAP_MINUTES) {
            current = { time: getTime(item), items: [], lastMinutes: mins };
            groups.push(current);
        }
        current.items.push(item);
        current.lastMinutes = mins;
    });
    return groups.map((g, i) => ({ time: g.time, mealNumber: i + 1, items: g.items }));
}

function loadFoodLogEntries() {
    try { return JSON.parse(localStorage.getItem(_foodLogKey()) || '[]'); } catch { return []; }
}

function addFoodLogEntry(entry) {
    const entries = loadFoodLogEntries();
    const now = new Date();
    const newEntry = {
        ...entry,
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
        time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    };
    entries.push(newEntry);
    saveFoodLogEntries(entries);
    renderFoodLog();
    // שמירה גם בסופאבייס (היסטוריה ל-AI) — לא חוסם, נכשל בשקט
    if (typeof sbAddFoodLog === 'function') sbAddFoodLog(newEntry).catch(() => {});
}

let _flDeletedEntry = null;
let _flDeletedIdx   = null;
let _flUndoTimer    = null;

async function deleteFoodLogEntry(idx) {
    const ok = await showConfirmDanger('למחוק פריט זה מהיומן?');
    if (!ok) return;

    const entries = loadFoodLogEntries();
    const removed = entries.splice(idx, 1)[0];
    saveFoodLogEntries(entries);
    if (removed) {
        if (typeof addFoodMacros === 'function') addFoodMacros();
        if (removed.id && typeof sbDeleteFoodLog === 'function') sbDeleteFoodLog(removed.id).catch(() => {});
    }
    renderFoodLog();

    _flDeletedEntry = removed;
    _flDeletedIdx   = idx;
    _flShowUndoToast();
}

function undoDeleteFoodLogEntry() {
    if (_flDeletedEntry === null) return;
    clearTimeout(_flUndoTimer);
    const entries = loadFoodLogEntries();
    const insertAt = Math.min(_flDeletedIdx, entries.length);
    entries.splice(insertAt, 0, _flDeletedEntry);
    saveFoodLogEntries(entries);
    if (typeof addFoodMacros === 'function') addFoodMacros();
    if (_flDeletedEntry.id && typeof sbAddFoodLog === 'function') sbAddFoodLog(_flDeletedEntry).catch(() => {});
    _flDeletedEntry = null;
    _flDeletedIdx   = null;
    const toast = document.getElementById('fl-undo-toast');
    if (toast) toast.remove();
    renderFoodLog();
}

function _flShowUndoToast() {
    const old = document.getElementById('fl-undo-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'fl-undo-toast';
    toast.innerHTML = `<span>הפריט נמחק</span><button onclick="undoDeleteFoodLogEntry()">↩ בטל</button>`;
    toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#2c2c2e;color:#fff;padding:10px 12px 10px 18px;border-radius:25px;font-size:13.5px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;white-space:nowrap;';
    toast.querySelector('button').style.cssText = 'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:20px;padding:5px 14px;font-size:12.5px;cursor:pointer;';
    document.body.appendChild(toast);
    _flUndoTimer = setTimeout(() => {
        toast.remove();
        _flDeletedEntry = null;
        _flDeletedIdx   = null;
    }, 4000);
}

let _flDate = null; // null = היום
let _flCalOpen = false;

function _flToday() { return typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0,10); }
function _flMinDate() { const d = new Date(_flToday() + 'T12:00:00'); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); }
function _flIsToday() { return !_flDate || _flDate === _flToday(); }

function _renderFoodLogNav() {
    const nav = document.getElementById('food-log-nav');
    if (!nav) return;
    const today = _flToday();
    const isToday = _flIsToday();
    const dateStr = _flDate || today;
    const minDate = _flMinDate();
    const atMin = dateStr <= minDate;
    const d = new Date(dateStr + 'T12:00:00');
    const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const dateLabel = isToday ? 'היום' : `יום ${dayNames[d.getDay()]} · ${d.toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})}`;
    const btnStyle = 'background:#5b7cfa;color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;font-family:inherit;';

    // 7 ימים לבחירה
    let days = '';
    for (let i = 6; i >= 0; i--) {
        const dd = new Date(today + 'T12:00:00'); dd.setDate(dd.getDate() - i);
        const ds = dd.toISOString().slice(0,10);
        const lbl = i === 0 ? 'היום' : `${dayNames[dd.getDay()]} ${dd.getDate()}/${dd.getMonth()+1}`;
        const sel = ds === dateStr;
        days += `<div onclick="_flSelectDate('${ds}')" style="padding:7px 12px;cursor:pointer;font-size:13px;background:${sel?'var(--accent)':'transparent'};color:${sel?'#fff':'var(--text-primary)'};border-radius:8px;">${lbl}</div>`;
    }

    nav.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">
        <button onclick="_flPrev()" ${atMin?'disabled':''} style="${btnStyle}opacity:${atMin?'.35':'1'}">▶</button>
        <div style="flex:1;text-align:center;">
            <span style="font-size:14px;font-weight:bold;color:var(--text-primary);">${dateLabel}</span>
        </div>
        <button onclick="_flNext()" ${isToday?'disabled':''} style="${btnStyle}opacity:${isToday?'.35':'1'}">◀</button>
    </div>
    ${!isToday ? `<div style="text-align:center;margin-bottom:8px;"><button onclick="_flGoToday()" style="${btnStyle}font-size:12px;">חזרה להיום</button></div>` : ''}`;

    const cal = document.getElementById('fl-cal');
    if (cal) {
        cal.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', function _flOutside(e) {
            if (!cal.contains(e.target) && !e.target.closest('[onclick*="_flToggleCal"]')) {
                cal.style.display = 'none'; _flCalOpen = false;
            }
        }, { once: true });
    }
}

function _flToggleCal() {
    _flCalOpen = !_flCalOpen;
    const cal = document.getElementById('fl-cal');
    if (cal) cal.style.display = _flCalOpen ? 'block' : 'none';
}

function _flSelectDate(ds) {
    _flDate = ds === _flToday() ? null : ds;
    _flCalOpen = false;
    const cal = document.getElementById('fl-cal');
    if (cal) cal.style.display = 'none';
    if (_flIsToday()) { renderFoodLog(); } else { _renderFoodLogPastDay(ds); }
}

function _flPrev() {
    const d = new Date((_flDate || _flToday()) + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const ds = d.toISOString().slice(0,10);
    if (ds < _flMinDate()) return;
    _flSelectDate(ds);
}

function _flNext() {
    if (_flIsToday()) return;
    const d = new Date(_flDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    _flSelectDate(d.toISOString().slice(0,10));
}

function _flGoToday() { _flSelectDate(_flToday()); }

async function _renderFoodLogPastDay(dateStr) {
    _renderFoodLogNav();
    const el = document.getElementById('food-log-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px 0;font-size:13px;">טוען...</div>';
    try {
        const userId = getActiveUserId();
        const rows = await sbFetchFoodLogRange(userId, dateStr);
        const items = (rows || []).filter(r => r.date === dateStr);
        if (!items.length) {
            el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px 0;font-size:13px;">אין רישומים ביום זה</div>';
            return;
        }
        let totalP=0,totalC=0,totalF=0,totalA=0;
        items.forEach(r => { totalP+=r.protein_g||0; totalC+=r.carbs_g||0; totalF+=r.fat_g||0; totalA+=r.alcohol_g||0; });
        const meals = _groupFoodLogByMeal(items, r => r.time);
        let html='<div class="fl-timeline"><div class="fl-timeline-line"></div>';
        meals.forEach(meal => {
            html+=`<div class="fl-meal"><div class="fl-dot"></div><div class="fl-time">${meal.time||''} · ארוחה ${meal.mealNumber}</div>`;
            meal.items.forEach((r, ri) => {
                const hasRecipe = r.recipe_items && r.recipe_items.length;
                const detId = `fld-past-${meal.mealNumber}-${ri}`;
                html+=`<div class="fl-card"><div class="fl-card-body"${hasRecipe ? ` onclick="toggleFoodLogRecipeDetails('${detId}')" style="cursor:pointer;"` : ''}>
                    <div class="fl-card-name">${_esc(r.food)}${hasRecipe ? ' <span style="color:var(--text-muted);font-size:11px;">(פרטים ›)</span>' : ''}</div>
                    <div class="fl-card-macros">${r.grams?`<span class="g">${r.grams}g</span>`:''}${r.protein_g?`<span class="fl-m-p">${r.protein_g}g חלבון</span>`:''}${r.carbs_g?`<span class="fl-m-c">${r.carbs_g}g פחמימה</span>`:''}${r.fat_g?`<span class="fl-m-f">${r.fat_g}g שומן</span>`:''}${r.alcohol_g?`<span class="fl-m-a">${r.alcohol_g}g אלכוהול</span>`:''}
                    </div>
                    ${hasRecipe ? `<div id="${detId}" style="display:none;margin-top:6px;font-size:11.5px;color:var(--text-secondary);">${r.recipe_items.map(ing => `${_esc(ing.name)} — ${ing.amount} ${_esc(ing.unit)}`).join('<br>')}</div>` : ''}
                </div>
                <div class="fl-card-actions">
                    <button onclick="deletePastDayFoodLogEntry('${r.id}', '${dateStr}')" title="מחיקה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div></div>`;
            });
            html+='</div>';
        });
        html+='</div>';
        const totalKcal = Math.round(totalP*4 + totalC*4 + totalF*9 + totalA*7);
        el.innerHTML = html + `<div class="fl-summary">
            <div class="fl-summary-kcal">${totalKcal}<span>קלוריות</span></div>
            <div class="fl-summary-macros">${totalP?`<b class="fl-m-p">${Math.round(totalP)}g</b>`:''}${totalC?`<b class="fl-m-c">${Math.round(totalC)}g</b>`:''}${totalF?`<b class="fl-m-f">${Math.round(totalF)}g</b>`:''}${totalA?`<b class="fl-m-a">${Math.round(totalA)}g</b>`:''}</div>
        </div>`;

        // רק ליום הנוכחי: הטבעות למעלה בדשבורד מחושבות פה ישירות (לא מקומי - אין יומן מקומי לצד אדמין)
        if (dateStr === (typeof localDateStr === 'function' ? localDateStr() : dateStr)) {
            const pv = document.getElementById('protein-val'); if (pv) pv.innerText = Math.round(totalP*10)/10;
            const cv = document.getElementById('carbs-val');   if (cv) cv.innerText = Math.round(totalC*10)/10;
            const fv = document.getElementById('fat-val');     if (fv) fv.innerText = Math.round(totalF*10)/10;
            const kv = document.getElementById('kcal-val');    if (kv) kv.innerText = totalKcal;
            if (typeof updateAllMacroProgress === 'function') updateAllMacroProgress();
            if (typeof sbSaveNutrition === 'function') sbSaveNutrition(userId, totalP, totalC, totalF, totalA).catch(() => {});
        }
    } catch(e) {
        el.innerHTML = '<div style="text-align:center;color:#e55;padding:12px;">שגיאה בטעינה</div>';
    }
}

async function deletePastDayFoodLogEntry(id, dateStr) {
    const ok = await showConfirmDanger('למחוק פריט זה מהיומן?');
    if (!ok) return;
    if (typeof sbDeleteFoodLog === 'function') await sbDeleteFoodLog(id).catch(() => {});
    await _renderFoodLogPastDay(dateStr);
}

function toggleFoodLogRecipeDetails(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function renderFoodLog() {
    const el = document.getElementById('food-log-list');
    if (!el) return;
    _flDate = null; // תמיד מאפס להיום כשנקרא ישירות
    // אדמין שצופה בלקוח (לא בעצמו): אין נתון מקומי במכשיר האדמין, לכן טוענים את היום מסופאבייס (קריאה בלבד).
    // אדמין שצופה בנתונים של עצמו ממשיך ליומן הרגיל, הניתן לעריכה/מחיקה כמו כל משתמש
    const _isViewingOtherUser = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
    if (typeof SB_IS_ADMIN !== 'undefined' && SB_IS_ADMIN && _isViewingOtherUser) {
        _renderFoodLogPastDay(_flToday());
        return;
    }
    _renderFoodLogNav();
    cleanupOldFoodLogs();
    const entries = loadFoodLogEntries();
    if (!entries.length) {
        el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px 0;font-size:13px;">עוד לא הוזן אוכל היום</div>';
        return;
    }
    let totalProtein = 0, totalCarbs = 0, totalFat = 0, totalAlcohol = 0;
    entries.forEach(e => {
        totalProtein += e.protein_g || 0;
        totalCarbs   += e.carbs_g   || 0;
        totalFat     += e.fat_g     || 0;
        totalAlcohol += e.alcohol_g || 0;
    });
    // קיבוץ לארוחות לפי פערי זמן (90 דקות) — לא רק פריטים באותה דקה בדיוק
    entries.forEach((e, i) => { e._idx = i; });
    const meals = _groupFoodLogByMeal(entries, e => e.time);
    let html = '<div class="fl-timeline"><div class="fl-timeline-line"></div>';
    meals.forEach(meal => {
        html += `<div class="fl-meal"><div class="fl-dot"></div><div class="fl-time">${meal.time || ''} · ארוחה ${meal.mealNumber}</div>`;
        meal.items.forEach(e => {
            const hasRecipe = e.recipe_items && e.recipe_items.length;
            html += `<div class="fl-card">
                <div class="fl-card-body"${hasRecipe ? ` onclick="toggleFoodLogRecipeDetails('fld-${e._idx}')" style="cursor:pointer;"` : ''}>
                    <div class="fl-card-name">${_esc(e.name)}${hasRecipe ? ' <span style="color:var(--text-muted);font-size:11px;">(פרטים ›)</span>' : ''}</div>
                    <div class="fl-card-macros">${e.grams ? `<span class="g">${e.grams}g</span>` : ''}${e.protein_g ? `<span class="fl-m-p">${e.protein_g}g חלבון</span>` : ''}${e.carbs_g ? `<span class="fl-m-c">${e.carbs_g}g פחמימה</span>` : ''}${e.fat_g ? `<span class="fl-m-f">${e.fat_g}g שומן</span>` : ''}${e.alcohol_g ? `<span class="fl-m-a">${e.alcohol_g}g אלכוהול</span>` : ''}
                    </div>
                    ${hasRecipe ? `<div id="fld-${e._idx}" style="display:none;margin-top:6px;font-size:11.5px;color:var(--text-secondary);">${e.recipe_items.map(ing => `${_esc(ing.name)} — ${ing.amount} ${_esc(ing.unit)}`).join('<br>')}</div>` : ''}
                </div>
                <div class="fl-card-actions">
                    <button class="edit" onclick="openFoodLogEdit(${e._idx})" title="עריכה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                    <button onclick="deleteFoodLogEntry(${e._idx})" title="מחיקה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div>
            </div>`;
        });
        html += '</div>';
    });
    html += '</div>';

    const totalKcal = Math.round(totalProtein * 4 + totalCarbs * 4 + totalFat * 9 + totalAlcohol * 7);
    el.innerHTML = html +
        `<div class="fl-summary">
            <div class="fl-summary-kcal">${totalKcal}<span>קלוריות</span></div>
            <div class="fl-summary-macros">${totalProtein ? `<b class="fl-m-p">${Math.round(totalProtein)}g</b>` : ''}${totalCarbs ? `<b class="fl-m-c">${Math.round(totalCarbs)}g</b>` : ''}${totalFat ? `<b class="fl-m-f">${Math.round(totalFat)}g</b>` : ''}${totalAlcohol ? `<b class="fl-m-a">${Math.round(totalAlcohol)}g</b>` : ''}</div>
        </div>`;
}

// ── עריכת פריט ביומן ────────────────────────────────────────────────────────

let _editFoodLogIdx = null;

function openFoodLogEdit(idx) {
    const entries = loadFoodLogEntries();
    const entry = entries[idx];
    if (!entry) return;
    _editFoodLogIdx = idx;

    // פרסר שם + כמות + יחידה מהשם השמור — נסה לחלץ (X יחידות) בסוף
    let name = entry.name;
    let amount = entry.grams || 100;
    let unit = 'גרם';
    const match = name.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\s*(גרם|יחידות|כוסות|כפות)\)$/);
    if (match) { name = match[1].trim(); amount = parseFloat(match[2]); unit = match[3]; }

    document.getElementById('edit-food-name').value   = name;
    document.getElementById('edit-food-amount').value = amount;
    document.getElementById('edit-food-unit').value   = unit;
    document.getElementById('edit-food-loading').style.display = 'none';
    document.getElementById('edit-food-error').style.display   = 'none';

    const modal = document.getElementById('food-log-edit-modal');
    modal.classList.remove('hidden');
    modal.style.display = '';
    document.getElementById('edit-food-name').focus();
}

function closeFoodLogEdit() {
    document.getElementById('food-log-edit-modal').classList.add('hidden');
    _editFoodLogIdx = null;
}

async function saveFoodLogEdit() {
    const idx    = _editFoodLogIdx;
    const nameEl = document.getElementById('edit-food-name');
    const amtEl  = document.getElementById('edit-food-amount');
    const unitEl = document.getElementById('edit-food-unit');
    const loadEl = document.getElementById('edit-food-loading');
    const errEl  = document.getElementById('edit-food-error');
    if (idx === null || !nameEl) return;

    const name   = nameEl.value.trim();
    const amount = parseFloat(amtEl.value) || 100;
    const unit   = unitEl.value;
    if (!name) { nameEl.focus(); return; }

    loadEl.style.display = 'block';
    errEl.style.display  = 'none';

    try {
        const isGrams = unit === 'גרם';
        let newMacros = null;

        // בדיקת USDA לפני Gemini — חינם ומדויק
        if (isGrams) {
            const usdaItem = enrichItemMacros({ name, grams: amount, lookup_name: name });
            if (usdaItem.protein_g > 0 || usdaItem.fat_g > 0 || usdaItem.carbs_g > 0) {
                newMacros = { grams: amount, protein_g: usdaItem.protein_g, carbs_g: usdaItem.carbs_g, fat_g: usdaItem.fat_g, alcohol_g: usdaItem.alcohol_g || 0 };
            }
        }

        if (!newMacros) {
            const prompt = isGrams
                ? `מהם ערכי המאקרו של ${amount} גרם ${name}? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם מכיל אלכוהול טהור — כלול alcohol_g, אחרת 0. החזר JSON בלבד: {"grams":${amount},"protein_g":X,"fat_g":X,"carbs_g":X,"alcohol_g":X}`
                : `${amount} ${unit} של ${name} — כמה גרם וערכי מאקרו? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם מכיל אלכוהול טהור — כלול alcohol_g, אחרת 0. החזר JSON בלבד: {"grams":X,"protein_g":X,"fat_g":X,"carbs_g":X,"alcohol_g":X}`;

            let text;
            try {
                text = await geminiMacroLookup(prompt);
            } catch (e) {
                if (e.code === 429) throw new Error(e.message);
                throw new Error('שגיאה בחישוב');
            }
            const jsonMatch = text.match(/\{[\s\S]*?\}/);
            if (!jsonMatch) throw new Error('שגיאה בניתוח');
            const macros = JSON.parse(jsonMatch[0]);
            newMacros = { grams: Math.round(macros.grams || amount), protein_g: macros.protein_g || 0, carbs_g: macros.carbs_g || 0, fat_g: macros.fat_g || 0, alcohol_g: macros.alcohol_g || 0 };
        }

        const entries = loadFoodLogEntries();
        const oldEntry = entries[idx];

        entries[idx] = {
            ...oldEntry,
            name:      `${name} (${amount} ${unit})`,
            grams:     newMacros.grams,
            protein_g: Math.round(newMacros.protein_g * 10) / 10 || null,
            carbs_g:   Math.round(newMacros.carbs_g   * 10) / 10 || null,
            fat_g:     Math.round(newMacros.fat_g     * 10) / 10 || null,
            alcohol_g: Math.round(newMacros.alcohol_g * 10) / 10 || null
        };
        saveFoodLogEntries(entries);

        // עדכון גם בסופאבייס
        if (entries[idx].id && typeof sbUpdateFoodLog === 'function') {
            sbUpdateFoodLog(entries[idx].id, {
                food:      entries[idx].name,
                grams:     entries[idx].grams     || 0,
                protein_g: entries[idx].protein_g || 0,
                carbs_g:   entries[idx].carbs_g   || 0,
                fat_g:     entries[idx].fat_g     || 0,
                alcohol_g: entries[idx].alcohol_g || 0
            }).catch(() => {});
        }

        if (typeof addFoodMacros === 'function') addFoodMacros();

        renderFoodLog();
        closeFoodLogEdit();
    } catch (e) {
        errEl.textContent    = e.message || 'שגיאה, נסה שוב';
        errEl.style.display  = 'block';
    } finally {
        loadEl.style.display = 'none';
    }
}

async function addScannedPortions() {
    const btn = document.querySelector('.scan-action-btn.primary');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true; // חוסם לחיצה כפולה על כל הפונקציה, לא רק בזמן חיפוש טקסט פתוח

    const pendingInput = document.getElementById('add-item-name');
    if (pendingInput && pendingInput.value.trim()) {
        if (btn) btn.textContent = 'מחשב...';
        await confirmAddItem();
        if (btn) btn.innerHTML = 'הוספה ליומן <span style="display:inline-flex;width:16px;height:16px;border-radius:50%;background:#22c55e;align-items:center;justify-content:center;vertical-align:-3px;flex-shrink:0;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>';
    }

    const protein = scannedGrams.protein || 0;
    const carbs   = scannedGrams.carbs   || 0;
    const fat     = scannedGrams.fat     || 0;
    const alcohol = scannedGrams.alcohol || 0;

    // שמור ליומן - כתיבה אטומית אחת של כל הפריטים ביחד (לא לולאה של כתיבות נפרדות
    // שיכולות להתערבב זו בזו), כדי שלעולם לא יתכן שפריט שאושר לא יגיע ליומן
    const _failedItemNames = [];
    const _itemsToSave = (scannedItems && scannedItems.length > 0)
        ? scannedItems
        : ((protein || carbs || fat || alcohol) ? [{ name: 'ארוחה', grams: null, protein_g: protein, carbs_g: carbs, fat_g: fat, alcohol_g: alcohol }] : []);

    if (_itemsToSave.length > 0) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const existingEntries = loadFoodLogEntries();
        const newEntries = [];
        _itemsToSave.forEach(item => {
            try {
                newEntries.push({
                    name:      item.name,
                    grams:     Math.round(item.grams || 0) || null,
                    protein_g: Math.round((item.protein_g || 0) * 10) / 10 || null,
                    carbs_g:   Math.round((item.carbs_g   || 0) * 10) / 10 || null,
                    fat_g:     Math.round((item.fat_g     || 0) * 10) / 10 || null,
                    alcohol_g: Math.round((item.alcohol_g || 0) * 10) / 10 || null,
                    id:        (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
                    time:      timeStr
                });
            } catch (e) {
                console.warn('פריט לא עובד לשמירה:', item.name, e);
                _failedItemNames.push(item.name);
            }
        });
        saveFoodLogEntries(existingEntries.concat(newEntries));
        renderFoodLog();
        newEntries.forEach(entry => { if (typeof sbAddFoodLog === 'function') sbAddFoodLog(entry).catch(() => {}); });
    }

    // מחשב מחדש את הסכום היומי מהיומן בפועל, אחרי שכל הפריטים כבר נשמרו
    if (typeof addFoodMacros === 'function') addFoodMacros();

    if (btn) btn.disabled = false;
    closeFoodScanner();
    if (_failedItemNames.length && typeof showAlert === 'function') {
        showAlert('הפריטים הבאים לא נשמרו ביומן, כדאי להוסיף אותם ידנית: ' + _failedItemNames.join(', '));
    }
    const kcal = Math.round(protein * 4 + carbs * 4 + fat * 9 + alcohol * 7);
    const toast = document.createElement('div');
    toast.innerHTML = (protein || carbs || fat || alcohol)
        ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg> נוסף ליומן: ${kcal} קלוריות`
        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg> לא נוסף מזון';
    toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:fadeIn 0.3s ease;white-space:nowrap;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

