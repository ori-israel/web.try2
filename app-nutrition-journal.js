// ===== תזונה: יומן אוכל יומי (הצגה/עריכה/מחיקה/סנכרון) =====
// חיפוש/סריקה/הוספת פריט נמצאים ב-app-nutrition.js

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

async function addFoodLogEntry(entry) {
    const now = new Date();
    const newEntry = {
        ...entry,
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
        time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    };
    // אדמין שצופה בלקוח: מקור האמת הוא סופאבייס — לכתוב ולחכות לפני רינדור (שקורא מהשרת)
    const _adminOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
    if (_adminOther) {
        try { if (typeof sbAddFoodLog === 'function') await sbAddFoodLog(newEntry); } catch (e) {}
        renderFoodLog();
        return;
    }
    const entries = loadFoodLogEntries();
    entries.push(newEntry);
    saveFoodLogEntries(entries);
    renderFoodLog();
    // שמירה גם בסופאבייס (היסטוריה ל-AI) — לא חוסם, נכשל בשקט
    if (typeof sbAddFoodLog === 'function') sbAddFoodLog(newEntry).catch(() => {});
}

let _flDeletedEntry = null;
let _flDeletedIdx   = null;
let _flUndoTimer    = null;
let _flDeletePromise = null; // מחזיק את מחיקת השרת האחרונה, כדי שביטול לא יריץ הוספה שתתחרה במחיקה

async function deleteFoodLogEntry(idx) {
    const scrollY = window.scrollY;
    const ok = await showConfirmDanger('למחוק פריט זה מהיומן?');
    if (!ok) return;

    const entries = loadFoodLogEntries();
    const removed = entries.splice(idx, 1)[0];
    saveFoodLogEntries(entries);
    if (removed) {
        if (typeof addFoodMacros === 'function') addFoodMacros();
        _flDeletePromise = (removed.id && typeof sbDeleteFoodLog === 'function')
            ? sbDeleteFoodLog(removed.id).catch(() => {})
            : null;
    }
    renderFoodLog();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));

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
    // מחכים שמחיקת השרת (אם רצה) תסתיים לפני ההוספה מחדש, אחרת אם ה-DELETE יגיע אחרי ה-INSERT
    // הוא ימחק בשרת שורה שקיימת מקומית → פער בין הזיכרון המקומי לשרת
    const _restore = _flDeletedEntry;
    if (_restore.id && typeof sbAddFoodLog === 'function') {
        Promise.resolve(_flDeletePromise).finally(() => { sbAddFoodLog(_restore).catch(() => {}); });
    }
    _flDeletePromise = null;
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
    toast.innerHTML = `<span>הפריט נמחק</span><button onclick="undoDeleteFoodLogEntry()">ביטול</button>`;
    toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:10px 12px 10px 18px;border-radius:25px;font-size:13.5px;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;white-space:nowrap;';
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
    const btnStyle = 'background:var(--accent);color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;font-family:inherit;';

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

// רק ליום הנוכחי: הטבעות למעלה בדשבורד מחושבות פה ישירות (לא מקומי - אין יומן מקומי לצד אדמין).
// נקרא גם כשהיומן ריק (0 בכל מקום), לא רק כשיש בו פריטים
function _pdRefreshTodayTotals(dateStr, userId, totalP, totalC, totalF, totalA) {
    if (dateStr !== (typeof localDateStr === 'function' ? localDateStr() : dateStr)) return;
    const totalKcal = Math.round(totalP*4 + totalC*4 + totalF*9 + totalA*7);
    const pv = document.getElementById('protein-val'); if (pv) pv.innerText = Math.round(totalP*10)/10;
    const cv = document.getElementById('carbs-val');   if (cv) cv.innerText = Math.round(totalC*10)/10;
    const fv = document.getElementById('fat-val');     if (fv) fv.innerText = Math.round(totalF*10)/10;
    const kv = document.getElementById('kcal-val');    if (kv) kv.innerText = totalKcal;
    if (typeof updateAllMacroProgress === 'function') updateAllMacroProgress();
    // חיווי הקלוריות הצבעוני (מתחת/בטווח/חריגה) — לרענן גם בתצוגת אדמין, אחרת נשאר ישן/מוסתר
    if (typeof updateKcalStatus === 'function') updateKcalStatus(totalKcal);
    if (typeof sbSaveNutrition === 'function') sbSaveNutrition(userId, totalP, totalC, totalF, totalA).catch(() => {});
}

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
            _pdRefreshTodayTotals(dateStr, userId, 0, 0, 0, 0);
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

        _pdRefreshTodayTotals(dateStr, userId, totalP, totalC, totalF, totalA);
    } catch(e) {
        el.innerHTML = '<div style="text-align:center;color:#e55;padding:12px;">שגיאה בטעינה</div>';
    }
}

async function deletePastDayFoodLogEntry(id, dateStr) {
    const scrollY = window.scrollY;
    const ok = await showConfirmDanger('למחוק פריט זה מהיומן?');
    if (!ok) return;
    if (typeof sbDeleteFoodLog === 'function') await sbDeleteFoodLog(id).catch(() => {});
    await _renderFoodLogPastDay(dateStr);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

function toggleFoodLogRecipeDetails(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// מסנכרן את יומן היום מול סופאבייס בכניסה לאפליקציה — מקור האמת המקומי (localStorage)
// יכול להיות ריק/ישן אם המשתמש עבר מכשיר, ואז הסכום היומי (ורצף התזונה שמסתמך עליו) שגוי.
// מיזוג לפי id ולא דריסה: פריטים מקומיים שעוד לא הגיעו לשרת (למשל נוספו במצב לא מקוון) לא נמחקים.
async function _syncTodayFoodLogFromServer() {
    const isAdminViewingOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
    if (isAdminViewingOther) return; // ליומן של לקוח אחר כבר יש נתיב תצוגה נפרד ישירות מהשרת
    const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    if (!uid || typeof sbFetchFoodLogRange !== 'function') return;

    const today = typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0, 10);
    let serverRows;
    try { serverRows = await sbFetchFoodLogRange(uid, today); } catch (_) { return; }
    if (!serverRows) return;

    const localEntries = loadFoodLogEntries();
    const localIds = new Set(localEntries.map(e => e.id));
    const merged = localEntries.slice();
    serverRows.forEach(row => {
        if (row.date !== today || localIds.has(row.id)) return;
        merged.push({
            id: row.id,
            name: row.food,
            unit_amount: row.grams,
            unit: 'גרם',
            grams: row.grams,
            protein_g: row.protein_g,
            carbs_g: row.carbs_g,
            fat_g: row.fat_g,
            alcohol_g: row.alcohol_g,
            time: row.time,
            recipe_items: row.recipe_items
        });
    });
    if (merged.length === localEntries.length) return; // אין חדש מהשרת, אין צורך לרענן

    merged.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    saveFoodLogEntries(merged);
    if (typeof addFoodMacros === 'function') addFoodMacros();
    renderFoodLog();
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
let _editFoodLogOriginal = null; // שם/כמות/יחידה/מאקרו בפתיחת העריכה — לזיהוי "רק כמות השתנתה" (ר' saveFoodLogEdit)

function openFoodLogEdit(idx) {
    const entries = loadFoodLogEntries();
    const entry = entries[idx];
    if (!entry) return;
    _editFoodLogIdx = idx;

    // כמות + יחידה: פריטים חדשים שומרים אותן בשדות נפרדים. פריטים ישנים שנשמרו
    // לפני התיקון עדיין מכילים אותן בתוך השם ("שם (X יחידות)") — פרסר לאחור לשם תאימות
    let name = entry.name;
    let amount = entry.unit_amount || entry.grams || 100;
    let unit = entry.unit || 'גרם';
    if (!entry.unit_amount) {
        const match = name.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\s*(גרם|יחידות|כוסות|כפות)\)$/);
        if (match) { name = match[1].trim(); amount = parseFloat(match[2]); unit = match[3]; }
    }

    _editFoodLogOriginal = {
        name, amount, unit,
        grams:     entry.grams     || null,
        protein_g: entry.protein_g || 0,
        carbs_g:   entry.carbs_g   || 0,
        fat_g:     entry.fat_g     || 0,
        alcohol_g: entry.alcohol_g || 0
    };

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

        // רק הכמות השתנתה (שם ויחידה זהים) — מכפילים את הערכים המקוריים ביחס, בלי לחפש מחדש.
        // כך לא דורסים ערך מדויק שהגיע במקור מזיהוי תמונה/הזנה ידנית בערך כללי ממאגר/AI
        const orig = _editFoodLogOriginal;
        if (orig && orig.name === name && orig.unit === unit && orig.amount > 0) {
            const ratio = amount / orig.amount;
            newMacros = {
                grams:     isGrams ? amount : (orig.grams ? Math.round(orig.grams * ratio) : null),
                protein_g: Math.round(orig.protein_g * ratio * 10) / 10,
                carbs_g:   Math.round(orig.carbs_g   * ratio * 10) / 10,
                fat_g:     Math.round(orig.fat_g     * ratio * 10) / 10,
                alcohol_g: Math.round(orig.alcohol_g * ratio * 10) / 10
            };
        }

        // בדיקת USDA לפני Gemini — חינם ומדויק
        if (!newMacros && isGrams) {
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
            name:        name,
            unit_amount: amount,
            unit:        unit,
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

    // אדמין שצופה בלקוח: מקור האמת הוא סופאבייס (לא הזיכרון המקומי של מכשיר האדמין).
    // חייבים לחכות שהכתיבה לשרת תסתיים לפני שמרנדרים, אחרת הרינדור (שקורא מהשרת) יקבל נתון ישן וריק.
    const _adminOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;

    if (_itemsToSave.length > 0) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const existingEntries = loadFoodLogEntries();
        const newEntries = [];
        _itemsToSave.forEach(item => {
            try {
                newEntries.push({
                    name:        item.name,
                    unit_amount: item.unit_amount || item.grams || null,
                    unit:        item.unit || 'גרם',
                    grams:       Math.round(item.grams || 0) || null,
                    protein_g:   Math.round((item.protein_g || 0) * 10) / 10 || null,
                    carbs_g:     Math.round((item.carbs_g   || 0) * 10) / 10 || null,
                    fat_g:       Math.round((item.fat_g     || 0) * 10) / 10 || null,
                    alcohol_g:   Math.round((item.alcohol_g || 0) * 10) / 10 || null,
                    id:          (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
                    time:        timeStr
                });
            } catch (e) {
                console.warn('פריט לא עובד לשמירה:', item.name, e);
                _failedItemNames.push(item.name);
            }
        });

        if (_adminOther) {
            // כותבים לשרת וממתינים לסיום, ואז מרנדרים מהשרת (מקור האמת ללקוח שצופים בו)
            for (const entry of newEntries) {
                try { if (typeof sbAddFoodLog === 'function') await sbAddFoodLog(entry); }
                catch (e) { _failedItemNames.push(entry.name); }
            }
            renderFoodLog(); // במצב אדמין: קורא מהשרת (שכבר מעודכן) ומעדכן גם את המאקרו למעלה דרך _pdRefreshTodayTotals
        } else {
            // משתמש רגיל: הזיכרון המקומי הוא מקור האמת — כתיבה מיידית, סנכרון לשרת ברקע
            saveFoodLogEntries(existingEntries.concat(newEntries));
            renderFoodLog();
            newEntries.forEach(entry => { if (typeof sbAddFoodLog === 'function') sbAddFoodLog(entry).catch(() => {}); });
        }
    }

    // מחשב מחדש את הסכום היומי מהיומן המקומי (רק למשתמש רגיל — לאדמין הצופה בלקוח
    // המאקרו כבר עודכן מהשרת בתוך renderFoodLog, וקריאה מקומית כאן רק תדרוס באפס)
    if (!_adminOther && typeof addFoodMacros === 'function') addFoodMacros();

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
    toast.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:fadeIn 0.3s ease;white-space:nowrap;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

