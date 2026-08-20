// ===== המזונות שלי: מאכלים ומתכונים אישיים =====

const MYFOODS_MAX_FOODS   = 60;
const MYFOODS_MAX_RECIPES = 30;

let _myFoods = [];
let _myRecipes = [];
let _myFoodsLoaded = false;

let _cfEditId = null;   // מאכל אישי בעריכה, null = חדש
let _crEditId = null;   // מתכון בעריכה, null = חדש
let _crIngredients = []; // מרכיבי המתכון הנבנה כרגע
let _crIngPending = null; // התאמה שנבחרה מההצעות בהוספת מרכיב

let _rlRecipe = null;    // המתכון שנבחר לרישום
let _rlItems = [];       // מרכיבי המתכון עם כמויות מכווננות לרישום הנוכחי

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
        fab.setAttribute('onclick', 'openCustomFoodForm()');
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
    document.getElementById('cr-step-add').style.display = 'none';
    document.getElementById('cr-step-list').style.display = '';

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
            <span class="ing-amt">${ing.amount} ${_esc(ing.unit)}</span>
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

function removeRecipeIngredient(i) {
    _crIngredients.splice(i, 1);
    renderRecipeIngredientsList();
}

function openRecipeIngredientPicker() {
    document.getElementById('cr-step-list').style.display = 'none';
    document.getElementById('cr-step-add').style.display = '';
    document.getElementById('cr-ing-amount').value = 100;
    document.getElementById('cr-ing-unit').value = 'גרם';
    document.getElementById('cr-ing-amount-tap').textContent = '100 גרם';
    document.getElementById('cr-ing-name').value = '';
    document.getElementById('cr-ing-suggestions').innerHTML = '';
    _crIngPending = null;
    document.getElementById('cr-ing-name').focus();
}

function backToRecipeList() {
    document.getElementById('cr-step-add').style.display = 'none';
    document.getElementById('cr-step-list').style.display = '';
}

// חיפוש מרכיב להוספה למתכון — ממאגר האפליקציה + מאכלים אישיים (לא כולל מתכונים, כדי לא ליצור מתכון בתוך מתכון)
document.addEventListener('DOMContentLoaded', function () {
    const ingInput = document.getElementById('cr-ing-name');
    if (ingInput) ingInput.addEventListener('input', function () { _renderRecipeIngSuggestions(this.value); });
});

function _renderRecipeIngSuggestions(query) {
    const box = document.getElementById('cr-ing-suggestions');
    const q = (query || '').trim();
    _crIngPending = null;
    if (q.length < 2) { box.innerHTML = ''; return; }
    const qLow = q.toLowerCase();

    const usdaMatches = (typeof USDA_TABLE !== 'undefined' ? USDA_TABLE : [])
        .filter(r => r.name.includes(q) || r.name_en.toLowerCase().includes(qLow))
        .slice(0, 4)
        .map(r => ({ type: 'usda', ref: r, label: r.name, kcal: Math.round((r.protein || 0) * 4 + (r.carbs || 0) * 4 + (r.fat || 0) * 9 + (r.alcohol || 0) * 7) + ' קל\' / 100 גרם' }));

    const foodMatches = _myFoods
        .filter(f => f.name.includes(q))
        .slice(0, 4)
        .map(f => ({ type: 'custom', ref: f, label: f.name, kcal: `מאכל שלי · ל-${f.unit_amount} ${f.unit}` }));

    const matches = [...foodMatches, ...usdaMatches].slice(0, 6);
    if (!matches.length) { box.innerHTML = ''; return; }
    window._recipeIngSuggestions = matches;
    box.innerHTML = matches.map((m, i) => `
        <div onclick="selectRecipeIngSuggestion(${i})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 6px;background:var(--bg-card-alt);border-radius:8px;cursor:pointer;font-size:13.5px;">
            <span>${_esc(m.label)}</span>
            <span style="color:var(--text-muted);font-size:11px;">${m.kcal}</span>
        </div>`).join('');
}

function selectRecipeIngSuggestion(i) {
    const m = (window._recipeIngSuggestions || [])[i];
    if (!m) return;
    _crIngPending = m;
    document.getElementById('cr-ing-name').value = m.label;
    document.getElementById('cr-ing-suggestions').innerHTML = '';
    if (m.type === 'custom') {
        document.getElementById('cr-ing-unit').value = m.ref.unit;
        document.getElementById('cr-ing-amount').value = m.ref.unit_amount;
    } else {
        document.getElementById('cr-ing-unit').value = 'גרם';
    }
    document.getElementById('cr-ing-amount-tap').textContent =
        document.getElementById('cr-ing-amount').value + ' ' + document.getElementById('cr-ing-unit').value;
    openCrIngAmountSheet();
}

function openCrIngAmountSheet() {
    openAmountUnitSheet({
        amount: parseFloat(document.getElementById('cr-ing-amount').value) || 100,
        unit: document.getElementById('cr-ing-unit').value,
        onSave: (amt, unit) => {
            document.getElementById('cr-ing-amount').value = amt;
            document.getElementById('cr-ing-unit').value = unit;
            document.getElementById('cr-ing-amount-tap').textContent = amt + ' ' + unit;
        }
    });
}

function confirmAddRecipeIngredient() {
    const name   = document.getElementById('cr-ing-name').value.trim();
    const amount = parseFloat(document.getElementById('cr-ing-amount').value) || 0;
    const unit   = document.getElementById('cr-ing-unit').value;
    if (!name || !amount) return;

    let macros = { protein_g: 0, carbs_g: 0, fat_g: 0, alcohol_g: 0 };
    if (_crIngPending && _crIngPending.label === name && _crIngPending.type === 'custom') {
        macros = _customFoodMacrosForAmount(_crIngPending.ref, amount);
    } else if (unit === 'גרם') {
        const usda = (_crIngPending && _crIngPending.type === 'usda' && _crIngPending.label === name)
            ? _crIngPending.ref
            : findInUSDA(name);
        if (usda) {
            const ratio = amount / 100;
            macros = {
                protein_g: Math.round(usda.protein * ratio * 10) / 10,
                carbs_g:   Math.round(usda.carbs   * ratio * 10) / 10,
                fat_g:     Math.round(usda.fat     * ratio * 10) / 10,
                alcohol_g: Math.round((usda.alcohol || 0) * ratio * 10) / 10
            };
        }
    }

    // מתכון מחושב תמיד מסכום המרכיבים (אין תווית יצרן אחת לכל המתכון) — לא לשמור kcal_g למרכיב
    const { kcal_g: _drop, ...macrosNoKcal } = macros;
    _crIngredients.push({ name, amount, unit, ...macrosNoKcal });
    backToRecipeList();
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

function openRlAmountSheet(i) {
    const ing = _rlItems[i];
    const ranges = {
        'גרם':    { min: 1,    max: 1000, step: 5,    labelStep: 100, decimals: 0 },
        'יחידות': { min: 1,    max: 20,   step: 1,    labelStep: 5,   decimals: 0 },
        'כוסות':  { min: 0.25, max: 10,   step: 0.25, labelStep: 1,   decimals: 2 },
        'כפות':   { min: 0.25, max: 10,   step: 0.25, labelStep: 1,   decimals: 2 },
    };
    const r = ranges[ing.unit] || ranges['גרם'];
    openNumberRulerSheet({
        min: r.min, max: r.max, step: r.step, labelStep: r.labelStep, decimals: r.decimals,
        title: ing.name, unit: ing.unit,
        value: parseFloat(ing.amount) || r.min,
        onSave: (val) => {
            _rlUpdateAmount(i, val);
            _renderRecipeLogItems();
        }
    });
}

function _rlUpdateAmount(i, value) {
    const ing = _rlItems[i];
    const original = (_rlRecipe.ingredients[i]) || ing;
    const newAmount = parseFloat(value) || 0;
    const ratio = original.amount ? newAmount / original.amount : 0;
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
