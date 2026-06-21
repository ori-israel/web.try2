// ===== תזונה: סורק מזון, מאקרו, יומן אוכל, מנות =====

function findInUSDA(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    // 1. חיפוש מדויק
    let found = USDA_TABLE.find(r => r.name === name || r.name_en.toLowerCase() === n);
    if (found) return found;
    // 2. חיפוש חלקי
    found = USDA_TABLE.find(r => r.name.includes(name) || name.includes(r.name) ||
        r.name_en.toLowerCase().includes(n) || n.includes(r.name_en.toLowerCase()));
    if (found) return found;
    // 3. חיפוש לפי מילים בודדות — מחלץ מילות מפתח ומחפש כל אחת
    const words = name.replace(/[()״׳,]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
        const wLow = word.toLowerCase();
        found = USDA_TABLE.find(r => r.name.includes(word) || r.name_en.toLowerCase().includes(wLow));
        if (found) return found;
    }
    return null;
}

// מחשב מאקרו לפריט לפי גרמים — מטבלה אם אפשר, אחרת מ-AI
function enrichItemMacros(item) {
    const usda = findInUSDA(item.lookup_name) || findInUSDA(item.name) || findInUSDA(item.name_en);
    if (usda && item.grams) {
        const ratio = item.grams / 100;
        return {
            ...item,
            protein_g: Math.round(usda.protein * ratio * 10) / 10,
            fat_g:     Math.round(usda.fat     * ratio * 10) / 10,
            carbs_g:   Math.round(usda.carbs   * ratio * 10) / 10,
            _fromTable: true
        };
    }
    return item;
}

let scannedPortions = { protein: 0, fat: 0, carbs: 0 };
let scannedGrams = { protein: 0, fat: 0, carbs: 0 };
let scannedItems = [];
let scannedImageBase64 = null;
let scannedImageMime = null;
let _deletedItem = null;
let _deletedIdx = null;
let _undoTimer = null;

function renderScanDetails() {
    const detailsBox = document.getElementById('scan-details-box');
    if (scannedItems.length > 0) {
        detailsBox.innerHTML = scannedItems.map((item, i) =>
            `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <button onclick="deleteScannedItem(${i})" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 6px;line-height:1;min-width:32px;">✕</button>
                <span style="flex:1;text-align:right;font-size:15px;">${_esc(item.name)} — <span onclick="editItemGrams(${i}, this)" style="color:#aaa;cursor:pointer;text-decoration:underline dotted;">${Math.round(item.grams)}g</span></span>
            </div>`
        ).join('') + `<div id="add-item-row" style="margin-top:6px;">
            <button onclick="showAddItemForm()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוסף פריט</button>
        </div>`;
    } else {
        detailsBox.innerHTML = '';
    }
}

function showAddItemForm() {
    const row = document.getElementById('add-item-row');
    if (!row) return;
    row.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <input id="add-item-name" type="text" placeholder="שם המאכל" style="flex:1;min-width:100px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:16px;padding:4px 8px;" />
            <input id="add-item-amount" type="number" placeholder="כמות" value="100" style="width:60px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:16px;padding:4px 6px;text-align:center;" />
            <select id="add-item-unit" style="background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:16px;padding:4px 6px;">
                <option value="גרם">גרם</option>
                <option value="יחידות">יחידות</option>
                <option value="כוסות">כוסות</option>
                <option value="כפות">כפות</option>
            </select>
            <button onclick="confirmAddItem()" style="background:#fff;color:#000;border:none;border-radius:4px;padding:4px 10px;font-size:13px;cursor:pointer;">✓</button>
            <button onclick="renderScanDetails()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:0 2px;">✕</button>
        </div>`;
    document.getElementById('add-item-name').focus();
    document.getElementById('add-item-amount').addEventListener('focus', function() { this.select(); });
    document.getElementById('add-item-amount').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddItem(); });
    document.getElementById('add-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-item-amount').focus(); });
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
            ? `מהם ערכי המאקרו של ${amount} גרם ${name}? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. החזר JSON בלבד ללא הסברים: {"grams": ${amount}, "protein_g": X, "fat_g": X, "carbs_g": X}`
            : `${amount} ${unit} של ${name} — כמה גרם זה וערכי מאקרו? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. החזר JSON בלבד ללא הסברים: {"grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}`;
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
            carbs_g: macros.carbs_g || 0
        });
    } catch (e) {
        scannedItems.push({ name, grams: amount, protein_g: 0, fat_g: 0, carbs_g: 0 });
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
    const round = v => Math.round(v * 2) / 2;
    scannedGrams = {
        protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
        fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
        carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0))
    };
    scannedPortions = {
        protein: round(Math.max(0, scannedGrams.protein / 27.5)),
        fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
        carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
    };
    document.getElementById('scan-portions').innerHTML =
        `<div style="display:flex; flex-direction:column; gap:6px;">` +
        `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
        `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
        `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
        `</div>`;
}

function openFoodScanner() {
    if (typeof USDA_TABLE === 'undefined' && !window._usdaLoading) {
        window._usdaLoading = true;
        const s = document.createElement('script');
        s.src = '/usda.js';
        document.head.appendChild(s);
    }
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-modal-title').textContent = '🍽️ הוספת מנות';
    document.getElementById('scanner-step-1').classList.remove('hidden');
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('food-preview').classList.add('hidden');
    const _scanCorr = document.getElementById('scan-correction');
    if (_scanCorr) _scanCorr.value = '';
    document.getElementById('scan-food-label').style.display = '';
    document.getElementById('scan-food-name').style.display = '';
    scannedImageBase64 = null;
    scannedImageMime = null;
    scannedItems = [];
    scannedPortions = { protein: 0, fat: 0, carbs: 0 };
}

function openTextEntry() {
    scannedItems = [];
    scannedPortions = { protein: 0, fat: 0, carbs: 0 };
    scannedGrams = { protein: 0, fat: 0, carbs: 0 };
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-modal-title').textContent = '✍️ הזנת ארוחה בכתב';
    document.getElementById('scanner-step-1').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('scanner-error').classList.add('hidden');
    document.getElementById('scan-food-label').style.display = 'none';
    document.getElementById('scan-food-name').style.display = 'none';
    document.getElementById('scan-portions').innerHTML = '';
    document.getElementById('scan-details-box').innerHTML = '<div id="add-item-row"></div>';
    document.getElementById('scan-undo-toast').classList.add('hidden');
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

async function analyzeFood(base64, mimeType, correction) {
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.remove('hidden');
    document.getElementById('scanner-error').classList.add('hidden');

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
החזר JSON בלבד, ללא טקסט נוסף:
{"food": "שם האוכל בעברית", "protein_g": X, "fat_g": X, "carbs_g": X, "items": [{"name": "שם מאכל מלא", "lookup_name": "שם קצר לחיפוש (מילה אחת או שתיים, ללא תוספות)", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}, ...]}`;

    try {
        const { data: { session: _scanSession } } = await db.auth.getSession();
        if (!_scanSession) throw new Error('לא מחובר');
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_scanSession.access_token}` },
            body: JSON.stringify({ prompt, imageBase64: base64, imageMime: mimeType })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'claude error'); }
        const { text: fullText } = await response.json();
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const result = JSON.parse(jsonMatch[0]);

        const round = v => Math.round(v * 2) / 2;
        scannedGrams = {
            protein: Math.round(result.protein_g || 0),
            fat:     Math.round(result.fat_g     || 0),
            carbs:   Math.round(result.carbs_g   || 0)
        };
        scannedPortions = {
            protein: round(Math.max(0, scannedGrams.protein / 27.5)),
            fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
            carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
        };
        scannedItems = (Array.isArray(result.items) ? result.items : []).map(enrichItemMacros);

        document.getElementById('scan-food-name').textContent = `🍽️ ${result.food}`;
        document.getElementById('scan-portions').innerHTML =
            `<div style="display:flex; flex-direction:column; gap:6px;">` +
            `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
            `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
            `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
            `</div>`;

        renderScanDetails();
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    } catch (err) {
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
        const errMsg = err.message.includes('מגבלת') ? err.message : 'לא הצלחתי לזהות את האוכל';
        const errEl = document.getElementById('scanner-error');
        errEl.textContent = '⛔ ' + errMsg;
        errEl.classList.remove('hidden');
        document.getElementById('scan-portions').innerHTML = '';
        scannedPortions = { protein: 0, fat: 0, carbs: 0 };
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

    const itemsList = scannedItems.map((it, i) => `${i + 1}. ${it.name} — ${Math.round(it.grams)}g`).join('\n');
    const prompt = `אתה עוזר לניתוח תזונה. להלן רשימת המאכלים שזוהו בצלחת:
${itemsList}

המשתמש אומר: "${correction}"

עדכן את הרשימה לפי הוראות המשתמש בדיוק. שנה/הסר/הוסף רק את מה שצוין במפורש. אל תשנה גרמים או פרטים של פריטים שלא הוזכרו — שמור אותם זהים לחלוטין.
החזר JSON בלבד:
{"food": "תיאור קצר", "protein_g": X, "fat_g": X, "carbs_g": X, "items": [{"name": "שם", "lookup_name": "שם קצר", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}]}`;

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
        const round = v => Math.round(v * 2) / 2;
        scannedGrams = {
            protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
            fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
            carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0))
        };
        scannedPortions = {
            protein: round(Math.max(0, scannedGrams.protein / 27.5)),
            fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
            carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
        };

        document.getElementById('scan-food-name').textContent = `🍽️ ${result.food}`;
        document.getElementById('scan-portions').innerHTML =
            `<div style="display:flex; flex-direction:column; gap:6px;">` +
            `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
            `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
            `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
            `</div>`;
        renderScanDetails();
        const _sc = document.getElementById('scan-correction');
        if (_sc) _sc.value = '';
    } catch (err) {
        const errMsg2 = err.message?.includes('מגבלת') ? err.message : 'שגיאה בחישוב מחדש';
        const errEl2 = document.getElementById('scanner-error');
        errEl2.textContent = '⛔ ' + errMsg2;
        errEl2.classList.remove('hidden');
    } finally {
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

function deleteFoodLogEntry(idx) {
    const entries = loadFoodLogEntries();
    const removed = entries.splice(idx, 1)[0];
    saveFoodLogEntries(entries);
    // הפחת מהמונים
    if (removed) {
        if (removed.portions_protein) modifyPortion('protein', -removed.portions_protein);
        if (removed.portions_carbs)   modifyPortion('carbs',   -removed.portions_carbs);
        if (removed.portions_fat)     modifyPortion('fat',     -removed.portions_fat);
        // מחיקה גם בסופאבייס
        if (removed.id && typeof sbDeleteFoodLog === 'function') sbDeleteFoodLog(removed.id).catch(() => {});
    }
    renderFoodLog();
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
        let totalP=0,totalC=0,totalF=0;
        let html='', lastTime=null;
        items.forEach(r => {
            totalP+=r.portions_protein||0; totalC+=r.portions_carbs||0; totalF+=r.portions_fat||0;
            if (r.time !== lastTime) {
                if (lastTime!==null) html+=`</div><hr style="border:none;border-top:2px solid var(--border);margin:4px 0 10px;">`;
                html+=`<div style="margin-bottom:6px;"><div style="font-size:11px;font-weight:700;color:var(--accent);padding:8px 4px 4px;text-align:right;">🕐 ${r.time||''}</div>`;
                lastTime=r.time;
            }
            html+=`<div style="padding:7px 4px;border-bottom:1px solid var(--border-light);font-size:13px;text-align:right;">
                <div>${_esc(r.food)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${r.portions_protein?`🥩${r.portions_protein} `:''}${r.portions_carbs?`🍚${r.portions_carbs} `:''}${r.portions_fat?`🥑${r.portions_fat}`:''}
                </div></div>`;
        });
        if (lastTime!==null) html+='</div>';
        el.innerHTML = html + `<div style="padding:10px 4px 4px;font-size:12px;color:var(--text-secondary);display:flex;gap:12px;">
            <span>סה"כ:</span>${totalP?`<span>🥩 ${totalP} מנות</span>`:''}${totalC?`<span>🍚 ${totalC} מנות</span>`:''}${totalF?`<span>🥑 ${totalF} מנות</span>`:''}
        </div>`;
    } catch(e) {
        el.innerHTML = '<div style="text-align:center;color:#e55;padding:12px;">שגיאה בטעינה</div>';
    }
}

function renderFoodLog() {
    const el = document.getElementById('food-log-list');
    if (!el) return;
    _flDate = null; // תמיד מאפס להיום כשנקרא ישירות
    // אדמין שצופה בלקוח: אין נתון מקומי במכשיר האדמין, לכן טוענים את היום מסופאבייס (קריאה בלבד)
    if (typeof SB_IS_ADMIN !== 'undefined' && SB_IS_ADMIN) {
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
    let totalProtein = 0, totalCarbs = 0, totalFat = 0;
    entries.forEach(e => {
        totalProtein += e.portions_protein || 0;
        totalCarbs   += e.portions_carbs   || 0;
        totalFat     += e.portions_fat     || 0;
    });
    // קיבוץ לפי דקה — כל פריטים באותה דקה = ארוחה אחת
    let html = '';
    let lastTime = null;
    entries.forEach((e, i) => {
        const isNewMeal = e.time !== lastTime;
        if (isNewMeal) {
            if (lastTime !== null) html += `</div><hr style="border:none;border-top:2px solid var(--border);margin:4px 0 10px;">`; // קו מפריד בין ארוחות
            html += `<div style="margin-bottom:6px;">
                <div style="font-size:11px;font-weight:700;color:var(--accent);padding:8px 4px 4px;text-align:right;letter-spacing:0.3px;">🕐 ${e.time}</div>`;
            lastTime = e.time;
        }
        html += `
        <div style="display:flex;align-items:center;gap:0;padding:7px 0;border-bottom:1px solid var(--border-light);direction:rtl;">
            <div style="flex:1;min-width:0;text-align:right;padding-right:4px;">
                <div style="font-size:13px;line-height:1.4;word-break:break-word;">${e.name}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                    ${e.grams ? `${e.grams}g` : ''}${e.portions_protein ? ` · 🥩${e.portions_protein}` : ''}${e.portions_carbs ? ` · 🍚${e.portions_carbs}` : ''}${e.portions_fat ? ` · 🥑${e.portions_fat}` : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;border-right:1px solid var(--border-light);padding-right:8px;margin-right:8px;">
                <button onclick="openFoodLogEdit(${i})" style="background:none;border:none;color:var(--accent);font-size:15px;cursor:pointer;padding:4px 6px;border-radius:6px;" title="עריכה">✏️</button>
                <button onclick="deleteFoodLogEntry(${i})" style="background:none;border:none;color:var(--text-muted);font-size:15px;cursor:pointer;padding:4px 6px;border-radius:6px;" title="מחיקה">✕</button>
            </div>
        </div>`;
    });
    if (lastTime !== null) html += `</div>`;

    el.innerHTML = html +
        `<div style="padding:10px 4px 4px;font-size:12px;color:var(--text-secondary);display:flex;gap:12px;">
            <span>סה"כ:</span>
            ${totalProtein ? `<span>🥩 ${totalProtein} מנות</span>` : ''}
            ${totalCarbs   ? `<span>🍚 ${totalCarbs} מנות</span>`   : ''}
            ${totalFat     ? `<span>🥑 ${totalFat} מנות</span>`     : ''}
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

        // בדיקת USDA לפני Gemini — חינם ומדויק
        if (isGrams) {
            const usdaItem = enrichItemMacros({ name, grams: amount, lookup_name: name });
            if (usdaItem.protein_g > 0 || usdaItem.fat_g > 0 || usdaItem.carbs_g > 0) {
                const newPortions = _calcPortionsFromMacros(usdaItem.protein_g, usdaItem.carbs_g, usdaItem.fat_g);
                const entries = loadFoodLogEntries();
                const oldEntry = entries[idx];
                if (oldEntry.portions_protein) modifyPortion('protein', -oldEntry.portions_protein);
                if (oldEntry.portions_carbs)   modifyPortion('carbs',   -oldEntry.portions_carbs);
                if (oldEntry.portions_fat)     modifyPortion('fat',     -oldEntry.portions_fat);
                entries[idx] = { ...oldEntry, name: `${name} (${amount} ${unit})`, grams: amount, portions_protein: newPortions.protein || null, portions_carbs: newPortions.carbs || null, portions_fat: newPortions.fat || null };
                saveFoodLogEntries(entries);
                if (entries[idx].id && typeof sbUpdateFoodLog === 'function') {
                    sbUpdateFoodLog(entries[idx].id, { food: entries[idx].name, portions_protein: entries[idx].portions_protein || 0, portions_carbs: entries[idx].portions_carbs || 0, portions_fat: entries[idx].portions_fat || 0 }).catch(() => {});
                }
                if (newPortions.protein) modifyPortion('protein', newPortions.protein);
                if (newPortions.carbs)   modifyPortion('carbs',   newPortions.carbs);
                if (newPortions.fat)     modifyPortion('fat',     newPortions.fat);
                renderFoodLog();
                closeFoodLogEdit();
                return;
            }
        }

        const prompt  = isGrams
            ? `מהם ערכי המאקרו של ${amount} גרם ${name}? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. החזר JSON בלבד: {"grams":${amount},"protein_g":X,"fat_g":X,"carbs_g":X}`
            : `${amount} ${unit} של ${name} — כמה גרם וערכי מאקרו? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. החזר JSON בלבד: {"grams":X,"protein_g":X,"fat_g":X,"carbs_g":X}`;

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

        // חשב מנות לפי היעדים הקיימים
        const newPortions = _calcPortionsFromMacros(macros.protein_g || 0, macros.carbs_g || 0, macros.fat_g || 0);

        // הסר ישן, הוסף חדש
        const entries = loadFoodLogEntries();
        const oldEntry = entries[idx];
        if (oldEntry.portions_protein) modifyPortion('protein', -oldEntry.portions_protein);
        if (oldEntry.portions_carbs)   modifyPortion('carbs',   -oldEntry.portions_carbs);
        if (oldEntry.portions_fat)     modifyPortion('fat',     -oldEntry.portions_fat);

        entries[idx] = {
            ...oldEntry,
            name: `${name} (${amount} ${unit})`,
            grams: Math.round(macros.grams || amount),
            portions_protein: newPortions.protein || null,
            portions_carbs:   newPortions.carbs   || null,
            portions_fat:     newPortions.fat     || null
        };
        saveFoodLogEntries(entries);

        // עדכון גם בסופאבייס
        if (entries[idx].id && typeof sbUpdateFoodLog === 'function') {
            sbUpdateFoodLog(entries[idx].id, {
                food:             entries[idx].name,
                portions_protein: entries[idx].portions_protein || 0,
                portions_carbs:   entries[idx].portions_carbs   || 0,
                portions_fat:     entries[idx].portions_fat     || 0
            }).catch(() => {});
        }

        if (newPortions.protein) modifyPortion('protein', newPortions.protein);
        if (newPortions.carbs)   modifyPortion('carbs',   newPortions.carbs);
        if (newPortions.fat)     modifyPortion('fat',     newPortions.fat);

        renderFoodLog();
        closeFoodLogEdit();
    } catch (e) {
        errEl.textContent    = e.message || 'שגיאה, נסה שוב';
        errEl.style.display  = 'block';
    } finally {
        loadEl.style.display = 'none';
    }
}

// חישוב מנות מגרמי מאקרו — אותה נוסחה כמו הסורק
function _calcPortionsFromMacros(protein_g, carbs_g, fat_g) {
    const round = v => Math.round(v * 2) / 2;
    return {
        protein: round(Math.max(0, (protein_g || 0) / 27.5)) || null,
        carbs:   round(Math.max(0, (carbs_g   || 0) / 37.5)) || null,
        fat:     round(Math.max(0, (fat_g     || 0) / 12.5)) || null
    };
}

async function addScannedPortions() {
    const btn = document.querySelector('.scan-action-btn.primary');
    if (btn && btn.disabled) return;

    const pendingInput = document.getElementById('add-item-name');
    if (pendingInput && pendingInput.value.trim()) {
        if (btn) { btn.disabled = true; btn.textContent = 'מחשב...'; }
        await confirmAddItem();
        if (btn) { btn.disabled = false; btn.textContent = 'הוספת מנות ✅'; }
    }

    const protein = scannedPortions.protein || 0;
    const carbs   = scannedPortions.carbs   || 0;
    const fat     = scannedPortions.fat     || 0;
    const added = [];
    if (protein > 0) { modifyPortion('protein', protein); added.push(`חלבון +${protein}`); }
    if (carbs   > 0) { modifyPortion('carbs',   carbs);   added.push(`פחמימה +${carbs}`); }
    if (fat     > 0) { modifyPortion('fat',     fat);     added.push(`שומן +${fat}`); }

    // שמור ליומן — כל מאכל בנפרד
    if (scannedItems && scannedItems.length > 0) {
        const round = v => Math.round(v * 2) / 2;
        scannedItems.forEach(item => {
            const p = round(Math.max(0, (item.protein_g || 0) / 27.5)) || null;
            const c = round(Math.max(0, (item.carbs_g   || 0) / 37.5)) || null;
            const f = round(Math.max(0, (item.fat_g     || 0) / 12.5)) || null;
            addFoodLogEntry({
                name: item.name,
                grams: Math.round(item.grams || 0) || null,
                portions_protein: p,
                portions_carbs:   c,
                portions_fat:     f
            });
        });
    } else if (protein || carbs || fat) {
        addFoodLogEntry({
            name: 'ארוחה',
            grams: null,
            portions_protein: protein || null,
            portions_carbs:   carbs   || null,
            portions_fat:     fat     || null
        });
    }

    closeFoodScanner();
    const toast = document.createElement('div');
    toast.innerText = added.length ? '✅ נוסף: ' + added.join(' | ') : '⚠️ לא נוספו מנות';
    toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:fadeIn 0.3s ease;white-space:nowrap;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

