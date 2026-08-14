// ===== סריקת ברקוד =====

let _bcControls = null;
let _bcZXingLoading = null;
let _bcProduct = null; // { barcode, name, protein_g, carbs_g, fat_g, alcohol_g } ל-100 גרם
let _bcDetecting = false; // מונע קריאות כפולות מהקולבק הרציף של ZXing

function _loadZXing() {
    if (typeof ZXingBrowser !== 'undefined') return Promise.resolve();
    if (_bcZXingLoading) return _bcZXingLoading;
    _bcZXingLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@latest/umd/zxing-browser.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return _bcZXingLoading;
}

function _bcShowStep(stepId) {
    ['bc-camera-step', 'bc-loading-step', 'bc-confirm-step', 'bc-notfound-step'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== stepId);
    });
}

async function openBarcodeScanner() {
    const foodModal = document.getElementById('food-scanner-modal');
    if (foodModal) { foodModal.classList.add('hidden'); foodModal.style.display = 'none'; }

    const modal = document.getElementById('barcode-scanner-modal');
    modal.classList.remove('hidden');
    _bcShowStep('bc-camera-step');
    document.getElementById('bc-torch-btn').classList.add('hidden');

    try {
        await _loadZXing();
        const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
        const video = document.getElementById('bc-video');
        _bcDetecting = false;
        _bcControls = await codeReader.decodeFromConstraints(
            {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    advanced: [{ focusMode: 'continuous' }],
                },
            },
            video,
            (result) => {
                if (result && !_bcDetecting) { _bcDetecting = true; onBarcodeDetected(result.getText()); }
            }
        );
        const track = video.srcObject?.getVideoTracks?.()[0];
        if (track && track.getCapabilities?.().torch) {
            document.getElementById('bc-torch-btn').classList.remove('hidden');
        }
    } catch (e) {
        console.warn('barcode camera error:', e);
        closeBarcodeScanner();
        const detail = e && (e.name || e.message) ? ` (${e.name || ''} ${e.message || ''})`.trim() : '';
        if (typeof showAlert === 'function') showAlert(`לא הצלחנו לגשת למצלמה. יש לוודא שניתנה הרשאת מצלמה לאפליקציה.${detail}`);
    }
}

function closeBarcodeScanner() {
    if (_bcControls) { try { _bcControls.stop(); } catch (_) {} _bcControls = null; }
    document.getElementById('barcode-scanner-modal').classList.add('hidden');
    _bcProduct = null;
    _bcDetecting = false;
    _bcTorchOn = false;
}

let _bcTorchOn = false;
function toggleBarcodeTorch() {
    if (!_bcControls || typeof _bcControls.switchTorch !== 'function') return;
    _bcTorchOn = !_bcTorchOn;
    _bcControls.switchTorch(_bcTorchOn).catch(() => {});
}

function _bcSetLoadingText(text) {
    const el = document.getElementById('bc-loading-text');
    if (el) el.textContent = text;
}

async function onBarcodeDetected(barcode) {
    if (_bcControls) { try { _bcControls.stop(); } catch (_) {} _bcControls = null; }
    _bcShowStep('bc-loading-step');
    _bcSetLoadingText('מזהה את המוצר...');

    try {
        const row = await sbLookupBarcode(barcode);
        if (!row) { _bcShowStep('bc-notfound-step'); return; }

        let macros = null;
        if (row.protein_g != null) {
            macros = { protein_g: row.protein_g, carbs_g: row.carbs_g, fat_g: row.fat_g, alcohol_g: row.alcohol_g };
        } else {
            _bcSetLoadingText('מחפש ערכים תזונתיים...');
            macros = await _bcFetchFromOpenFoodFacts(barcode);
            if (!macros) {
                _bcSetLoadingText('כמעט סיימנו...');
                macros = await _bcFetchFromAI(row.name);
            }
            if (macros) sbSaveBarcodeMacros(barcode, macros).catch(() => {});
        }

        if (!macros) { _bcShowStep('bc-notfound-step'); return; }

        _bcProduct = { barcode, name: row.name, ...macros };
        document.getElementById('bc-product-name').textContent = row.name;
        document.getElementById('bc-amount').value = 100;
        updateBarcodeConfirmTotals();
        _bcShowStep('bc-confirm-step');
    } catch (e) {
        console.warn('barcode lookup error:', e);
        _bcShowStep('bc-notfound-step');
    }
}

async function _bcFetchFromOpenFoodFacts(barcode) {
    try {
        const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=nutriments`);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status !== 1 || !data.product?.nutriments) return null;
        const n = data.product.nutriments;
        const hasAny = n.proteins_100g != null || n.carbohydrates_100g != null || n.fat_100g != null;
        if (!hasAny) return null;
        return {
            protein_g: n.proteins_100g || 0,
            carbs_g:   n.carbohydrates_100g || 0,
            fat_g:     n.fat_100g || 0,
            alcohol_g: n.alcohol_100g || 0,
        };
    } catch (_) {
        return null;
    }
}

async function _bcFetchFromAI(name) {
    try {
        const prompt = `מהם ערכי המאקרו ל-100 גרם של המוצר "${name}"? אם זה מוצר ספציפי/מותג — חפש באינטרנט את הערכים האמיתיים. אם המוצר מכיל אלכוהול טהור — כלול גם alcohol_g, אחרת 0. החזר JSON בלבד ללא הסברים: {"protein_g": X, "fat_g": X, "carbs_g": X, "alcohol_g": X}`;
        const text = await geminiMacroLookup(prompt);
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) return null;
        const macros = JSON.parse(match[0]);
        return {
            protein_g: macros.protein_g || 0,
            carbs_g:   macros.carbs_g   || 0,
            fat_g:     macros.fat_g     || 0,
            alcohol_g: macros.alcohol_g || 0,
        };
    } catch (_) {
        return null;
    }
}

// חיפוש מוצרים לפי שם (לתיבת החיפוש הרגילה, לא רק סריקה)
async function searchBarcodeProductsByName(query) {
    try {
        const { data, error } = await db
            .from('barcode_products')
            .select('barcode, name')
            .ilike('name', `%${query}%`)
            .limit(4);
        if (error || !data) return [];
        return data.map(r => ({
            type: 'barcode', ref: r, label: r.name, sub: '', icon: _SUGG_ICON_USDA
        }));
    } catch (_) {
        return [];
    }
}

// שולף מאקרו ל-100 גרם למוצר לפי ברקוד: מהמאגר (אם כבר ידוע), אחרת Open Food Facts, אחרת AI — ושומר חזרה
async function resolveBarcodeProductMacros(barcode) {
    const row = await sbLookupBarcode(barcode);
    if (!row) return null;
    if (row.protein_g != null) {
        return { protein_g: row.protein_g, carbs_g: row.carbs_g, fat_g: row.fat_g, alcohol_g: row.alcohol_g };
    }
    let macros = await _bcFetchFromOpenFoodFacts(barcode);
    if (!macros) macros = await _bcFetchFromAI(row.name);
    if (macros) sbSaveBarcodeMacros(barcode, macros).catch(() => {});
    return macros;
}

function updateBarcodeConfirmTotals() {
    if (!_bcProduct) return;
    const amount = parseFloat(document.getElementById('bc-amount').value) || 0;
    const ratio = amount / 100;
    const p = Math.round(_bcProduct.protein_g * ratio * 10) / 10;
    const c = Math.round(_bcProduct.carbs_g   * ratio * 10) / 10;
    const f = Math.round(_bcProduct.fat_g     * ratio * 10) / 10;
    const a = Math.round((_bcProduct.alcohol_g || 0) * ratio * 10) / 10;
    const kcal = Math.round(p * 4 + c * 4 + f * 9 + a * 7);

    document.getElementById('bc-kcal-val').textContent = kcal;
    document.getElementById('bc-kcal-lbl').textContent = `קלוריות ב-${amount} גרם`;
    document.getElementById('bc-protein-val').textContent = p;
    document.getElementById('bc-carbs-val').textContent = c;
    document.getElementById('bc-fat-val').textContent = f;
    document.getElementById('bc-alcohol-row').classList.toggle('hidden', a <= 0);
    document.getElementById('bc-alcohol-val').textContent = a;
}

function confirmBarcodeAdd() {
    if (!_bcProduct) return;
    const amount = parseFloat(document.getElementById('bc-amount').value) || 0;
    const ratio = amount / 100;
    const protein_g = Math.round(_bcProduct.protein_g * ratio * 10) / 10;
    const carbs_g   = Math.round(_bcProduct.carbs_g   * ratio * 10) / 10;
    const fat_g     = Math.round(_bcProduct.fat_g     * ratio * 10) / 10;
    const alcohol_g = Math.round((_bcProduct.alcohol_g || 0) * ratio * 10) / 10;

    if (typeof addFoodMacros === 'function') addFoodMacros(protein_g, carbs_g, fat_g, alcohol_g);
    if (typeof addFoodLogEntry === 'function') {
        addFoodLogEntry({
            name: `${_bcProduct.name} (${amount} גרם)`,
            grams: amount,
            protein_g: protein_g || null,
            carbs_g:   carbs_g   || null,
            fat_g:     fat_g     || null,
            alcohol_g: alcohol_g || null,
        });
    }

    closeBarcodeScanner();
    if (typeof closeFoodScanner === 'function') closeFoodScanner();

    const kcal = Math.round(protein_g * 4 + carbs_g * 4 + fat_g * 9 + alcohol_g * 7);
    const toast = document.createElement('div');
    toast.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg> נוסף ליומן: ${kcal} קלוריות`;
    toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:10100;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function switchBarcodeToTextSearch() {
    closeBarcodeScanner();
    if (typeof openFoodScanner === 'function') openFoodScanner();
    if (typeof openTextEntry === 'function') openTextEntry();
    setTimeout(() => document.getElementById('add-item-name')?.focus(), 100);
}
