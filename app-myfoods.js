// ===== המזונות שלי: מאכלים ומתכונים אישיים =====

const MYFOODS_MAX_FOODS   = 60;
const MYFOODS_MAX_RECIPES = 30;

let _myFoods = [];
let _myRecipes = [];
let _myFoodsLoaded = false;

let _cfEditId = null;   // מאכל אישי בעריכה, null = חדש
let _crEditId = null;   // מתכון בעריכה, null = חדש
let _crIngredients = []; // מרכיבי המתכון הנבנה כרגע

let _rlRecipe = null;    // המתכון שנבחר לרישום
let _rlItems = [];       // מרכיבי המתכון עם כמויות מכווננות לרישום הנוכחי
let _rlTotalWeight = 0;  // משקל המתכון המלא בגרם (סכום מרכיבים שנמדדים בגרם)
let _rlPortionMode = 'גרם';   // מצב תצוגה של "כמה אכלת" - גרם, או יחידות (עשיריות מהמתכון)
let _rlPortionGrams = 0;      // כמה גרם נבחרו לאכילה (המקור לחישוב היחס שמוחל על כל המרכיבים)

async function _loadMyFoodsData() {
    const uid = getActiveUserId();
    if (!uid) return;
    const [foods, recipes] = await Promise.all([
        sbFetchCustomFoods(uid),
        sbFetchCustomRecipes(uid)
    ]);
    _myFoods = foods;
    _myRecipes = recipes;
    _myFoodsLoaded = true;
}

// מאקרו למאכל אישי לפי כמות מבוקשת (יחסית ליחידת הבסיס שהוגדרה)
function _customFoodMacrosForAmount(food, amount) {
    const ratio = (parseFloat(amount) || 0) / (food.unit_amount || 1);
    return {
        protein_g: Math.round(food.protein_g * ratio * 10) / 10,
        carbs_g:   Math.round(food.carbs_g   * ratio * 10) / 10,
        fat_g:     Math.round(food.fat_g     * ratio * 10) / 10,
        alcohol_g: Math.round((food.alcohol_g || 0) * ratio * 10) / 10,
        kcal_g:    food.kcal_g != null ? Math.round(food.kcal_g * ratio) : null
    };
}

// ── מסך ניהול ─────────────────────────────────────────

let _myFoodsTab = 'foods';

async function openMyFoods() {
    document.querySelector('.hamburger-menu')?.classList.remove('open');
    await _loadMyFoodsData();
    _myFoodsTab = 'foods';
    document.querySelectorAll('.myfoods-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'foods'));
    renderMyFoodsList();
    document.getElementById('myfoods-modal').classList.remove('hidden');
    document.getElementById('myfoods-modal').style.display = 'flex';
}

function closeMyFoods() {
    const m = document.getElementById('myfoods-modal');
    m.classList.add('hidden');
    m.style.display = 'none';
}

function selectMyFoodsTab(tab, btnEl) {
    _myFoodsTab = tab;
    document.querySelectorAll('.myfoods-tab').forEach(t => t.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderMyFoodsList();
}

function renderMyFoodsList() {
    document.getElementById('myfoods-count-foods').textContent = `${_myFoods.length}/${MYFOODS_MAX_FOODS}`;
    document.getElementById('myfoods-count-recipes').textContent = `${_myRecipes.length}/${MYFOODS_MAX_RECIPES}`;

    const list = document.getElementById('myfoods-list');
    const fab = document.getElementById('myfoods-fab');

    if (_myFoodsTab === 'foods') {
        fab.setAttribute('onclick', 'openFoodScannerForNewFood()');
        if (!_myFoods.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:16px 0;font-size:13px;">עוד לא נוספו מאכלים אישיים</div>`;
            return;
        }
        list.innerHTML = _myFoods.map(f => {
            const kcal = (f.kcal_g != null) ? Math.round(f.kcal_g) : Math.round((f.protein_g || 0) * 4 + (f.carbs_g || 0) * 4 + (f.fat_g || 0) * 9 + (f.alcohol_g || 0) * 7);
            return `<div class="myfoods-item">
                <div class="myfoods-item-ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-1.2 2.8-4.5 5-4.5 8.3a4.5 4.5 0 0 0 9 0C16.5 8 13.2 5.8 12 3z"/></svg></div>
                <div class="myfoods-item-body">
                    <div class="myfoods-item-name">${_esc(f.name)}</div>
                    <div class="myfoods-item-sub">${kcal} קל' ל-${f.unit_amount} ${_esc(f.unit)}</div>
                </div>
                <button class="myfoods-item-edit" onclick="openCustomFoodForm('${f.id}')" aria-label="עריכה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                <button class="myfoods-item-edit" onclick="deleteCustomFood('${f.id}')" aria-label="מחיקה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            </div>`;
        }).join('');
    } else {
        fab.setAttribute('onclick', 'openCustomRecipeForm()');
        if (!_myRecipes.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:16px 0;font-size:13px;">עוד לא נוספו מתכונים</div>`;
            return;
        }
        list.innerHTML = _myRecipes.map(r => {
            const ings = r.ingredients || [];
            const kcal = Math.round(ings.reduce((s, i) => s + (i.protein_g || 0) * 4 + (i.carbs_g || 0) * 4 + (i.fat_g || 0) * 9 + (i.alcohol_g || 0) * 7, 0));
            return `<div class="myfoods-item">
                <div class="myfoods-item-ic recipe"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
                <div class="myfoods-item-body">
                    <div class="myfoods-item-name">${_esc(r.name)}</div>
                    <div class="myfoods-item-sub">${ings.length} מרכיבים · ${kcal} קל'</div>
                </div>
                <button class="myfoods-item-edit" onclick="openCustomRecipeForm('${r.id}')" aria-label="עריכה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                <button class="myfoods-item-edit" onclick="deleteCustomRecipe('${r.id}')" aria-label="מחיקה"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            </div>`;
        }).join('');
    }
}

// ── מאכל אישי — יצירה/עריכה ──────────────────────────

function openCustomFoodForm(id = null) {
    _cfEditId = id;
    const food = id ? _myFoods.find(f => f.id === id) : null;
    document.getElementById('cf-modal-title').textContent = food ? 'עריכת מאכל אישי' : 'מאכל אישי חדש';
    document.getElementById('cf-name').value    = food ? food.name : '';
    document.getElementById('cf-amount').value  = food ? food.unit_amount : 100;
    document.getElementById('cf-unit').value    = food ? food.unit : 'גרם';
    document.getElementById('cf-amount-tap').textContent = (food ? food.unit_amount : 100) + ' ' + (food ? food.unit : 'גרם');
    _setCfMacro('cf-protein', food ? food.protein_g : 0);
    _setCfMacro('cf-carbs',   food ? food.carbs_g   : 0);
    _setCfMacro('cf-fat',     food ? food.fat_g     : 0);
    _setCfMacro('cf-alcohol', food ? (food.alcohol_g || 0) : 0);
    _setCfAlcoholOn(!!(food && food.alcohol_g));
    document.getElementById('cf-error').style.display = 'none';

    document.getElementById('myfoods-modal').style.display = 'none';
    const m = document.getElementById('custom-food-modal');
    m.classList.remove('hidden');
    m.style.display = 'flex';
    document.getElementById('cf-name').focus();
}

function openCfAmountSheet() {
    openAmountUnitSheet({
        amount: parseFloat(document.getElementById('cf-amount').value) || 100,
        unit: document.getElementById('cf-unit').value,
        onSave: (amt, unit) => {
            document.getElementById('cf-amount').value = amt;
            document.getElementById('cf-unit').value = unit;
            document.getElementById('cf-amount-tap').textContent = amt + ' ' + unit;
        }
    });
}

function _setCfAlcoholOn(on) {
    document.getElementById('cf-alc-capsule').classList.toggle('off', !on);
    document.getElementById('cf-alc-switch').classList.toggle('on', on);
    document.getElementById('cf-alc-spacer').style.display = on ? '' : 'none';
    document.getElementById('cf-alc-box').style.display = on ? '' : 'none';
    if (!on) _setCfMacro('cf-alcohol', 0);
}

function _setCfMacro(id, val) {
    const v = Math.round((val || 0) * 10) / 10;
    const input = document.getElementById(id);
    input.value = v;
    const box = input.closest('.cf-macro-box');
    const tap = box && box.querySelector('.cf-macro-tap');
    if (tap) tap.textContent = v;
}

function openCfMacroSheet(inputId, title) {
    openNumberRulerSheet({
        min: 0, max: 200, step: 1, labelStep: 25,
        title, unit: 'גרם',
        value: parseFloat(document.getElementById(inputId).value) || 0,
        onSave: (val) => _setCfMacro(inputId, val)
    });
}

function toggleCfAlcohol() {
    const isOn = document.getElementById('cf-alc-switch').classList.contains('on');
    _setCfAlcoholOn(!isOn);
}

function closeCustomFoodForm() {
    const m = document.getElementById('custom-food-modal');
    m.classList.add('hidden');
    m.style.display = 'none';
    document.getElementById('myfoods-modal').style.display = 'flex';
    renderMyFoodsList();
}

async function aiEstimateCustomFood() {
    const name = document.getElementById('cf-name').value.trim();
    const amount = parseFloat(document.getElementById('cf-amount').value) || 100;
    const unit = document.getElementById('cf-unit').value;
    if (!name) { document.getElementById('cf-name').focus(); return; }
    const btn = document.getElementById('cf-ai-btn');
    const prevText = btn.innerHTML;
    btn.innerHTML = 'מעריך...';
    try {
        const prompt = `מהם ערכי המאקרו של ${amount} ${unit} ${name}? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם המאכל/משקה מכיל אלכוהול טהור — כלול גם alcohol_g, אחרת 0. החזר JSON בלבד ללא הסברים: {"protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}`;
        const text = await geminiMacroLookup(prompt);
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error('no json');
        const macros = JSON.parse(match[0]);
        _setCfMacro('cf-protein', macros.protein_g);
        _setCfMacro('cf-carbs',   macros.carbs_g);
        _setCfMacro('cf-fat',     macros.fat_g);
        _setCfMacro('cf-alcohol', macros.alcohol_g);
        if (macros.alcohol_g > 0) _setCfAlcoholOn(true);
    } catch (e) {
        const err = document.getElementById('cf-error');
        err.textContent = 'לא הצלחנו להעריך, נסה למלא ידנית.';
        err.style.display = 'block';
    }
    btn.innerHTML = prevText;
}

async function saveCustomFood() {
    const name = document.getElementById('cf-name').value.trim();
    const unit_amount = parseFloat(document.getElementById('cf-amount').value);
    const unit = document.getElementById('cf-unit').value;
    const protein_g = parseFloat(document.getElementById('cf-protein').value) || 0;
    const carbs_g   = parseFloat(document.getElementById('cf-carbs').value) || 0;
    const fat_g     = parseFloat(document.getElementById('cf-fat').value) || 0;
    const alcOn     = document.getElementById('cf-alc-switch').classList.contains('on');
    const alcohol_g = alcOn ? (parseFloat(document.getElementById('cf-alcohol').value) || 0) : 0;
    const err = document.getElementById('cf-error');
    err.style.display = 'none';

    if (!name || !unit_amount) {
        err.textContent = 'צריך למלא שם וכמות.';
        err.style.display = 'block';
        return;
    }

    if (unit === 'גרם' && (protein_g + carbs_g + fat_g + alcohol_g) > unit_amount) {
        err.textContent = 'הסכום גדול מדי ביחס לכמות שהזנת.';
        err.style.display = 'block';
        return;
    }

    if (!_cfEditId && _myFoods.length >= MYFOODS_MAX_FOODS) {
        closeCustomFoodForm();
        showAlert('הגעת למגבלה של 60 מאכלים אישיים שמורים. כדי לשמור מאכל חדש, אפשר למחוק אחד ישן קודם.');
        return;
    }

    // עריכה ידנית של מאכל: המאקרו נקבע כעת בעצמו, לכן קלוריות מדויקות שהגיעו בעבר מתווית
    // (kcal_g) כבר לא רלוונטיות — מאפסים כדי שהתצוגה תחזור לחישוב מהמאקרו
    const payload = { name, unit, unit_amount, protein_g, carbs_g, fat_g, alcohol_g, kcal_g: null };
    if (_cfEditId) {
        await sbUpdateCustomFood(_cfEditId, payload);
    } else {
        await sbAddCustomFood(payload);
    }
    await _loadMyFoodsData();
    closeCustomFoodForm();
}

async function deleteCustomFood(id) {
    const ok = await showConfirmDanger('למחוק את המאכל האישי הזה?');
    if (!ok) return;
    await sbDeleteCustomFood(id);
    await _loadMyFoodsData();
    renderMyFoodsList();
}

// ── מתכון אישי — יצירה/עריכה ─────────────────────────

function openCustomRecipeForm(id = null) {
    _crEditId = id;
    const recipe = id ? _myRecipes.find(r => r.id === id) : null;
    document.getElementById('cr-modal-title').textContent = recipe ? 'עריכת מתכון' : 'מתכון חדש';
    document.getElementById('cr-name').value = recipe ? recipe.name : '';
    _crIngredients = recipe ? JSON.parse(JSON.stringify(recipe.ingredients || [])) : [];
    document.getElementById('cr-error').style.display = 'none';
    renderRecipeIngredientsList();

    document.getElementById('myfoods-modal').style.display = 'none';
    const m = document.getElementById('custom-recipe-modal');
    m.classList.remove('hidden');
    m.style.display = 'flex';
}

function closeCustomRecipeForm() {
    const m = document.getElementById('custom-recipe-modal');
    m.classList.add('hidden');
    m.style.display = 'none';
    document.getElementById('myfoods-modal').style.display = 'flex';
    renderMyFoodsList();
}

function renderRecipeIngredientsList() {
    const box = document.getElementById('cr-ingredients-list');
    box.innerHTML = _crIngredients.map((ing, i) => `
        <div class="recipe-ing-pill">
            <span class="ing-name">${_esc(ing.name)}</span>
            <span class="ing-amt entry-pill-amt-tap" onclick="editRecipeIngredientAmount(${i})">${ing.amount} ${_esc(ing.unit)}</span>
            <button class="ing-remove" onclick="removeRecipeIngredient(${i})" aria-label="הסרה">×</button>
        </div>`).join('');

    let p = 0, c = 0, f = 0, a = 0;
    _crIngredients.forEach(ing => { p += ing.protein_g || 0; c += ing.carbs_g || 0; f += ing.fat_g || 0; a += ing.alcohol_g || 0; });
    document.getElementById('cr-sum-protein').textContent = Math.round(p);
    document.getElementById('cr-sum-carbs').textContent   = Math.round(c);
    document.getElementById('cr-sum-fat').textContent     = Math.round(f);
    document.getElementById('cr-sum-alcohol').textContent = Math.round(a);
    document.getElementById('cr-sum-alcohol-box').style.display = a > 0 ? '' : 'none';
}

// עריכת כמות למרכיב קיים במתכון - פותח את סרגל הכמות הרגיל (כמו בהוספת מרכיב חדש),
// וכשמאשרים מכפילים את המאקרו של אותו מרכיב ביחס בין הכמות הישנה לחדשה
function editRecipeIngredientAmount(i) {
    const ing = _crIngredients[i];
    if (!ing) return;
    openAmountUnitSheet({
        amount: ing.amount,
        unit: ing.unit,
        onSave: (amt, unit) => {
            const ratio = (ing.unit === unit && ing.amount > 0) ? (amt / ing.amount) : 1;
            _crIngredients[i] = {
                ...ing,
                amount: amt,
                unit: unit,
                protein_g: Math.round(ing.protein_g * ratio * 10) / 10,
                carbs_g:   Math.round(ing.carbs_g   * ratio * 10) / 10,
                fat_g:     Math.round(ing.fat_g     * ratio * 10) / 10,
                alcohol_g: Math.round((ing.alcohol_g || 0) * ratio * 10) / 10
            };
            renderRecipeIngredientsList();
        }
    });
}

function removeRecipeIngredient(i) {
    _crIngredients.splice(i, 1);
    renderRecipeIngredientsList();
}

// הוספת מאכל אישי חדש / מרכיב למתכון - נעשית באותו מודל "הוספת אוכל" (5 השיטות),
// עם ניתוב תוצאה שונה לפי _scannerMode במקום הוספה ליומן. ראו app-nutrition.js/_applyScannerModeUI
// ואת הענף ב-addScannedPortions (app-nutrition-journal.js).

function openFoodScannerForNewFood() {
    document.querySelector('.hamburger-menu')?.classList.remove('open');
    document.getElementById('myfoods-modal').style.display = 'none';
    _scannerMode = 'new-food';
    if (typeof openFoodScanner === 'function') openFoodScanner();
}

function openFoodScannerForRecipeIngredient() {
    const m = document.getElementById('custom-recipe-modal');
    m.classList.add('hidden');
    m.style.display = 'none';
    _scannerMode = 'recipe-ingredient';
    if (typeof openFoodScanner === 'function') openFoodScanner();
}

// מסכם את רשימת הפריטים שנבנתה בסורק (חיפוש/צילום/גלריה) לפריט אחד, ושומר כמאכל אישי חדש
async function _finalizeScannerAsNewFood() {
    const name = (document.getElementById('scan-food-name')?.value || '').trim() ||
        (scannedItems.length === 1 ? scannedItems[0].name : '') ||
        document.getElementById('add-item-name')?.value.trim();
    if (!name || !scannedItems.length) {
        if (typeof showAlert === 'function') showAlert('צריך למצוא/לזהות לפחות פריט אחד לפני השמירה.');
        return;
    }
    if (_myFoods.length >= MYFOODS_MAX_FOODS) {
        closeFoodScanner();
        showAlert('הגעת למגבלה של 60 מאכלים אישיים שמורים. כדי לשמור מאכל חדש, אפשר למחוק אחד ישן קודם.');
        return;
    }

    let payload;
    if (scannedItems.length === 1) {
        // פריט בודד (הנתיב הנפוץ - חיפוש) - שומרים את היחידה המקורית שלו כמו שהיא
        // (יכולה להיות "יחידות"/"כוסות"/"כפות", לא רק גרם), בלי לעוות אותה לגרם
        const it = scannedItems[0];
        payload = {
            name,
            unit: it.unit || 'גרם',
            unit_amount: it.unit_amount || it.grams || 100,
            protein_g: Math.round((it.protein_g || 0) * 10) / 10,
            carbs_g:   Math.round((it.carbs_g   || 0) * 10) / 10,
            fat_g:     Math.round((it.fat_g     || 0) * 10) / 10,
            alcohol_g: Math.round((it.alcohol_g || 0) * 10) / 10,
            kcal_g: null
        };
    } else {
        // כמה פריטים (בעיקר צילום/גלריה של צלחת) - כל הפריטים שם תמיד בגרמים, מסכמים למאכל אחד
        let protein_g = 0, carbs_g = 0, fat_g = 0, alcohol_g = 0, grams = 0;
        scannedItems.forEach(it => {
            protein_g += it.protein_g || 0;
            carbs_g   += it.carbs_g   || 0;
            fat_g     += it.fat_g     || 0;
            alcohol_g += it.alcohol_g || 0;
            grams     += it.grams || (it.unit === 'גרם' ? it.unit_amount : 0) || 0;
        });
        payload = {
            name,
            unit: 'גרם',
            unit_amount: Math.round(grams) || 100,
            protein_g: Math.round(protein_g * 10) / 10,
            carbs_g:   Math.round(carbs_g   * 10) / 10,
            fat_g:     Math.round(fat_g     * 10) / 10,
            alcohol_g: Math.round(alcohol_g * 10) / 10,
            kcal_g: null
        };
    }

    await sbAddCustomFood(payload);
    await _loadMyFoodsData();
    closeFoodScanner();
    renderMyFoodsList();
}

// מוסיף את כל הפריטים שנבנו בסורק כמרכיבים נפרדים למתכון הנוכחי (custom-recipe-modal, כבר פתוח ברקע)
function _finalizeScannerAsRecipeIngredients() {
    if (!scannedItems.length) {
        if (typeof showAlert === 'function') showAlert('צריך למצוא/לזהות לפחות מרכיב אחד לפני ההוספה.');
        return;
    }
    scannedItems.forEach(it => {
        _crIngredients.push({
            name: it.name,
            amount: it.unit_amount || it.grams || 0,
            unit: it.unit || 'גרם',
            protein_g: it.protein_g || 0,
            carbs_g:   it.carbs_g   || 0,
            fat_g:     it.fat_g     || 0,
            alcohol_g: it.alcohol_g || 0
        });
    });
    closeFoodScanner();
    renderRecipeIngredientsList();
}

async function saveCustomRecipe() {
    const name = document.getElementById('cr-name').value.trim();
    const err = document.getElementById('cr-error');
    err.style.display = 'none';

    if (!name || !_crIngredients.length) {
        err.textContent = 'צריך שם מתכון ולפחות מרכיב אחד.';
        err.style.display = 'block';
        return;
    }

    if (!_crEditId && _myRecipes.length >= MYFOODS_MAX_RECIPES) {
        closeCustomRecipeForm();
        showAlert('הגעת למגבלה של 30 מתכונים שמורים. כדי לשמור מתכון חדש, אפשר למחוק אחד ישן קודם.');
        return;
    }

    const payload = { name, ingredients: _crIngredients };
    if (_crEditId) {
        await sbUpdateCustomRecipe(_crEditId, payload);
    } else {
        await sbAddCustomRecipe(payload);
    }
    await _loadMyFoodsData();
    closeCustomRecipeForm();
}

async function deleteCustomRecipe(id) {
    const ok = await showConfirmDanger('למחוק את המתכון הזה?');
    if (!ok) return;
    await sbDeleteCustomRecipe(id);
    await _loadMyFoodsData();
    renderMyFoodsList();
}

// ── רישום מתכון ליומן — כיוונון כמויות ───────────────

function openRecipeLogAdjust(recipeId) {
    const recipe = _myRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    _rlRecipe = recipe;
    _rlItems = JSON.parse(JSON.stringify(recipe.ingredients || []));
    document.getElementById('rl-title').textContent = recipe.name;
    // משקל כולל - סכום המרכיבים שנמדדים בגרם (יחידות/כוסות/כפות לא נכללות בסכום המשקל)
    _rlTotalWeight = recipe.ingredients.reduce((s, ing) => s + (ing.unit === 'גרם' ? (ing.amount || 0) : 0), 0);
    document.getElementById('rl-total-weight').textContent = Math.round(_rlTotalWeight) + ' גרם';
    _rlSetPortion(_rlTotalWeight, 'גרם');
    _renderRecipeLogItems();
    const m = document.getElementById('recipe-log-modal');
    m.classList.remove('hidden');
    m.style.display = 'flex';
}

function closeRecipeLogAdjust() {
    const m = document.getElementById('recipe-log-modal');
    m.classList.add('hidden');
    m.style.display = 'none';
}

function _renderRecipeLogItems() {
    const box = document.getElementById('rl-ingredients-list');
    box.innerHTML = _rlItems.map((ing, i) => `
        <div class="recipe-ing-pill">
            <span class="ing-name">${_esc(ing.name)}</span>
            <span onclick="openRlAmountSheet(${i})"
                style="display:inline-block;width:52px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:4px 4px;text-align:center;color:var(--accent);font-weight:700;font-family:inherit;font-size:12.5px;cursor:pointer;">${ing.amount}</span>
            <span class="ing-amt">${_esc(ing.unit)}</span>
        </div>`).join('');
    _rlUpdateSummary();
}

// עדכון "כמה אכלת" גלובלי - מחיל את אותו יחס על כל המרכיבים ביחד (לפי המשקל הכולל שנבחר),
// ומעדכן את התצוגה. אפשר עדיין לכוונן מרכיב בודד לאחר מכן (openRlAmountSheet).
function _rlSetPortion(grams, mode) {
    _rlPortionGrams = Math.max(0, grams);
    _rlPortionMode = mode;
    // אם אין במתכון שום מרכיב שנמדד בגרם, אין בסיס לחשב יחס - משאירים את הכמויות כמו שהן
    const ratio = _rlTotalWeight > 0 ? (_rlPortionGrams / _rlTotalWeight) : 1;
    _rlRecipe.ingredients.forEach((_, i) => {
        const original = _rlRecipe.ingredients[i];
        _rlUpdateAmount(i, (original.amount || 0) * ratio);
    });
    const valEl = document.getElementById('rl-portion-val');
    const unitEl = document.getElementById('rl-portion-unit');
    if (mode === 'גרם') {
        valEl.textContent = Math.round(_rlPortionGrams);
        unitEl.textContent = 'גרם';
    } else {
        valEl.textContent = Math.round(ratio * 10) / 10;
        unitEl.textContent = 'יחידות';
    }
}

// ── "כמה אכלת" — בוטום שיט עם צ'יפים (גרם/יחידות) + סרגל, בדיוק כמו סרגל הכמות הרגיל ──
// "יחידות" = כפולות של המתכון השלם: 1 יחידה = המתכון כולו (משקלו המלא), 0.5 = חצי מתכון וכו'
const _RL_PORTION_TICK_GAP = 14;
const _RL_PORTION_CONFIG = {
    'גרם':    { min: 0, max: 1000, step: 1,   labelStep: 100 },
    'יחידות': { min: 0, max: 10,   step: 0.5, labelStep: 1 }
};
let _rlPortionSheetUnit = 'גרם';
let _rlPortionSheetValue = 0;
let _rlPortionSheetReady = false;

function _rlPortionOffsetFor(v) {
    const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
    return -((v - cfg.min) / cfg.step) * _RL_PORTION_TICK_GAP - _RL_PORTION_TICK_GAP / 2;
}

function _rlPortionBuildTicks() {
    const track = document.getElementById('rl-portion-sheet-track');
    if (!track) return;
    const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
    track.innerHTML = '';
    const n = Math.round((cfg.max - cfg.min) / cfg.step);
    for (let i = 0; i <= n; i++) {
        const v = cfg.min + i * cfg.step;
        const isMajor = Math.abs(v - Math.round(v)) < 0.001 && Math.round(v) % cfg.labelStep === 0;
        const t = document.createElement('div');
        t.className = 'weight-ruler-tick' + (isMajor ? ' major' : '');
        const line = document.createElement('div');
        line.className = 'weight-ruler-tick-line';
        t.appendChild(line);
        if (isMajor) {
            const lbl = document.createElement('div');
            lbl.className = 'weight-ruler-tick-label';
            lbl.textContent = Math.round(v);
            t.appendChild(lbl);
        }
        track.appendChild(t);
    }
}

function _rlPortionRenderSheet() {
    const track = document.getElementById('rl-portion-sheet-track');
    const valEl = document.getElementById('rl-portion-sheet-value');
    if (!track || !valEl) return;
    const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
    track.style.transform = `translateX(${_rlPortionOffsetFor(_rlPortionSheetValue)}px)`;
    valEl.textContent = cfg.step < 1 ? _rlPortionSheetValue.toFixed(1) : Math.round(_rlPortionSheetValue);
}

function _rlPortionInitDrag() {
    if (_rlPortionSheetReady) return;
    _rlPortionSheetReady = true;
    const wrap = document.getElementById('rl-portion-sheet-wrap');
    const track = document.getElementById('rl-portion-sheet-track');
    if (!wrap || !track) return;
    let dragging = false, startX = 0, startOffset = 0;
    const pointerX = e => e.touches ? e.touches[0].clientX : e.clientX;

    wrap.addEventListener('pointerdown', e => {
        dragging = true;
        track.style.transition = 'none';
        startX = pointerX(e);
        startOffset = _rlPortionOffsetFor(_rlPortionSheetValue);
    });
    window.addEventListener('pointermove', e => {
        if (!dragging) return;
        const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
        const minOffset = _rlPortionOffsetFor(cfg.max);
        const maxOffset = _rlPortionOffsetFor(cfg.min);
        let newOffset = startOffset + (pointerX(e) - startX);
        newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
        const raw = cfg.min + (-newOffset / _RL_PORTION_TICK_GAP) * cfg.step;
        _rlPortionSheetValue = cfg.min + Math.round((raw - cfg.min) / cfg.step) * cfg.step;
        track.style.transform = `translateX(${newOffset}px)`;
        const valEl = document.getElementById('rl-portion-sheet-value');
        if (valEl) valEl.textContent = cfg.step < 1 ? _rlPortionSheetValue.toFixed(1) : Math.round(_rlPortionSheetValue);
    });
    window.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
        _rlPortionSheetValue = cfg.min + Math.round((_rlPortionSheetValue - cfg.min) / cfg.step) * cfg.step;
        track.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        _rlPortionRenderSheet();
    });
}

function _rlPortionSwitchUnit(unit) {
    // ממירים את הערך הנוכחי ליחידה החדשה כך שהיחס שנבחר (החלק מהמתכון) לא משתנה מעצם ההחלפה
    const ratio = _rlPortionSheetUnit === 'גרם'
        ? (_rlTotalWeight > 0 ? _rlPortionSheetValue / _rlTotalWeight : 0)
        : _rlPortionSheetValue;
    _rlPortionSheetUnit = unit;
    const rawValue = unit === 'גרם' ? (_rlTotalWeight * ratio) : ratio;
    // מעגלים מיד לרשת הצעדים של היחידה החדשה - אחרת המספר שמוצג (מעוגל) לא תואם
    // לערך הפנימי שנשמר בפועל בלחיצה על "שמירה" (שני מספרים שונים שנראים זהים)
    const cfg = _RL_PORTION_CONFIG[unit];
    _rlPortionSheetValue = cfg.min + Math.round((rawValue - cfg.min) / cfg.step) * cfg.step;
    document.querySelectorAll('.rl-portion-sheet-overlay .amount-unit-chip').forEach(c => c.classList.toggle('sel', c.dataset.u === unit));
    document.getElementById('rl-portion-sheet-unit-label').textContent = unit;
    const track = document.getElementById('rl-portion-sheet-track');
    if (track) track.style.transition = 'none';
    _rlPortionBuildTicks();
    _rlPortionRenderSheet();
    _rlPortionInitDrag();
}

function openRlPortionSheet() {
    _rlPortionSheetUnit = _rlPortionMode;
    const rawValue = _rlPortionMode === 'גרם' ? _rlPortionGrams : (_rlTotalWeight > 0 ? (_rlPortionGrams / _rlTotalWeight) : 0);
    const cfg = _RL_PORTION_CONFIG[_rlPortionSheetUnit];
    _rlPortionSheetValue = cfg.min + Math.round((rawValue - cfg.min) / cfg.step) * cfg.step;
    document.querySelectorAll('.rl-portion-sheet-overlay .amount-unit-chip').forEach(c => c.classList.toggle('sel', c.dataset.u === _rlPortionSheetUnit));
    document.getElementById('rl-portion-sheet-unit-label').textContent = _rlPortionSheetUnit;
    const track = document.getElementById('rl-portion-sheet-track');
    if (track) track.style.transition = 'none';
    _rlPortionBuildTicks();
    _rlPortionRenderSheet();
    _rlPortionInitDrag();
    document.getElementById('rl-portion-sheet-overlay').classList.add('open');
    window._dynamicOverlayOpen();
}

function closeRlPortionSheet() {
    const overlay = document.getElementById('rl-portion-sheet-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    window._dynamicOverlayClosed();
}

function saveRlPortionSheet() {
    const grams = _rlPortionSheetUnit === 'גרם' ? _rlPortionSheetValue : _rlPortionSheetValue * _rlTotalWeight;
    _rlSetPortion(grams, _rlPortionSheetUnit);
    _renderRecipeLogItems();
    closeRlPortionSheet();
}

function openRlAmountSheet(i) {
    const ing = _rlItems[i];
    const ranges = {
        'גרם':    { min: 1,    max: 1000, step: 1,    labelStep: 100, decimals: 0 },
        'יחידות': { min: 1,    max: 20,   step: 1,    labelStep: 5,   decimals: 0 },
        'כוסות':  { min: 0.25, max: 10,   step: 0.25, labelStep: 1,   decimals: 2 },
        'כפות':   { min: 0.5,  max: 10,   step: 0.5,  labelStep: 1,   decimals: 1 },
    };
    const r = ranges[ing.unit] || ranges['גרם'];
    openNumberRulerSheet({
        min: r.min, max: r.max, step: r.step, labelStep: r.labelStep, decimals: r.decimals,
        roundToStep: true,
        title: ing.name, unit: ing.unit,
        value: parseFloat(ing.amount) || r.min,
        onSave: (val) => {
            _rlUpdateAmount(i, val);
            _renderRecipeLogItems();
        }
    });
}

// דיוק תצוגה לכל יחידה - כמו בסרגלי הכמות בשאר האתר (גרם/יחידות שלמים, כוסות/כפות עם עשרוני)
const _RL_AMOUNT_DECIMALS = { 'גרם': 0, 'יחידות': 0, 'כוסות': 2, 'כפות': 1 };

function _rlUpdateAmount(i, value) {
    const ing = _rlItems[i];
    const original = (_rlRecipe.ingredients[i]) || ing;
    const rawAmount = parseFloat(value) || 0;
    const ratio = original.amount ? rawAmount / original.amount : 0;
    // מעגלים לדיוק סביר לפי היחידה - היחס הכללי (מ"כמה אכלת") לא תמיד "עגול", ובלי זה
    // הכמות המוצגת לכל מרכיב הייתה נראית מבולגנת (למשל 66.83000000000001 גרם)
    const decimals = _RL_AMOUNT_DECIMALS[ing.unit] != null ? _RL_AMOUNT_DECIMALS[ing.unit] : 0;
    const factor = Math.pow(10, decimals);
    const newAmount = Math.round(rawAmount * factor) / factor;
    ing.amount = newAmount;
    ing.protein_g = Math.round((original.protein_g || 0) * ratio * 10) / 10;
    ing.carbs_g   = Math.round((original.carbs_g   || 0) * ratio * 10) / 10;
    ing.fat_g     = Math.round((original.fat_g     || 0) * ratio * 10) / 10;
    ing.alcohol_g = Math.round((original.alcohol_g || 0) * ratio * 10) / 10;
    _rlUpdateSummary();
}

function _rlUpdateSummary() {
    let p = 0, c = 0, f = 0, a = 0;
    _rlItems.forEach(ing => { p += ing.protein_g || 0; c += ing.carbs_g || 0; f += ing.fat_g || 0; a += ing.alcohol_g || 0; });
    document.getElementById('rl-sum-protein').textContent = Math.round(p);
    document.getElementById('rl-sum-carbs').textContent   = Math.round(c);
    document.getElementById('rl-sum-fat').textContent     = Math.round(f);
    document.getElementById('rl-sum-alcohol').textContent = Math.round(a);
    document.getElementById('rl-sum-alcohol-box').style.display = a > 0 ? '' : 'none';
}

function confirmRecipeLog() {
    let protein_g = 0, carbs_g = 0, fat_g = 0, alcohol_g = 0;
    _rlItems.forEach(ing => { protein_g += ing.protein_g || 0; carbs_g += ing.carbs_g || 0; fat_g += ing.fat_g || 0; alcohol_g += ing.alcohol_g || 0; });
    protein_g = Math.round(protein_g * 10) / 10;
    carbs_g   = Math.round(carbs_g   * 10) / 10;
    fat_g     = Math.round(fat_g     * 10) / 10;
    alcohol_g = Math.round(alcohol_g * 10) / 10;

    addFoodLogEntry({
        name: _rlRecipe.name,
        protein_g, carbs_g, fat_g, alcohol_g,
        recipe_items: _rlItems
    });

    // אדמין שצופה בלקוח: addFoodLogEntry כבר כותב לשרת וממתין ואז מרנדר. מדלגים על addFoodMacros
    // כדי לא להפעיל רינדור מקביל שמתחרה בו (אותו מרוץ שתוקן בנתיב הסריקה ובהוספת ברקוד).
    const _adminOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
    if (!_adminOther && typeof addFoodMacros === 'function') addFoodMacros();

    closeRecipeLogAdjust();
    if (typeof closeFoodScanner === 'function') closeFoodScanner();
}
