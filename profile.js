// ============================================
// Profile — data load/save, modal open/close
// ============================================

let isCoachUnlocked = false;

// חישוב תאריך סיום מנוי בצד הלקוח — זהה לנוסחה המחושבת בסופאבייס (start_date + חודשים)
function _computeSubscriptionEndDate(startDateStr, months) {
    if (!startDateStr || months == null) return null;
    const d = new Date(startDateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

// ── Data ──────────────────────────────────────

(function loadProfileData() {
    const saved = JSON.parse(localStorage.getItem('profile_data_v1'));
    if (!saved) return;
    const fields = [
        'nickname', 'email', 'currentWeight', 'startWeight', 'goalWeight', 'activityLevel',
        'allergies', 'likedFoods', 'dislikedFoods', 'birthDate',
        'name', 'startDate', 'height', 'gender', 'goal',
        'coachingDurationMonths', 'nextMeetingDate'
    ];
    fields.forEach(f => { if (saved[f] !== undefined) CLIENT[f] = saved[f]; });
    if (saved.currentWeight) localStorage.setItem('current_weight', String(saved.currentWeight));
})();

document.addEventListener('DOMContentLoaded', function () {
    populateProfileForm();
});

// ── Modal ────────────────────────────────────

function openProfile() {
    isCoachUnlocked = false;
    populateProfileForm();
    const overlay = document.getElementById('profile-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
    document.querySelector('.hamburger-menu').classList.remove('open');
}

function openProfileAsAdmin() {
    isCoachUnlocked = true;
    populateProfileForm();
    setCoachFieldsState(true);
    const overlay = document.getElementById('profile-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
    toggleAdminPanel();
}

function handleProfileOverlayClick(e) {
    if (e.target === document.getElementById('profile-overlay')) closeProfile();
}

function closeProfile() {
    const overlay = document.getElementById('profile-overlay');
    overlay.classList.remove('open');
    overlay.classList.add('closing');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('closing');
    }, 300);
}

// ── Form ──────────────────────────────────────

function populateProfileForm() {
    const cw = localStorage.getItem('current_weight') || CLIENT.currentWeight || '';
    document.getElementById('prof-nickname').value       = CLIENT.nickname       || '';
    document.getElementById('prof-email').value          = CLIENT.email          || '';
    document.getElementById('prof-current-weight').value = cw;
    document.getElementById('prof-activity').value       = CLIENT.activityLevel  || 1.465;
    document.getElementById('prof-allergies').value      = CLIENT.allergies      || '';
    document.getElementById('prof-liked-foods').value    = CLIENT.likedFoods     || '';
    document.getElementById('prof-disliked-foods').value = CLIENT.dislikedFoods  || '';

    document.getElementById('prof-name').value          = CLIENT.name           || '';
    document.getElementById('prof-start-weight').value = CLIENT.startWeight    || '';
    document.getElementById('prof-goal-weight').value  = CLIENT.goalWeight     || '';
    document.getElementById('prof-birth-date').value   = CLIENT.birthDate      || '';
    document.getElementById('prof-start-date').value           = CLIENT.startDate             || '';
    if (!isCoachUnlocked) {
        document.getElementById('prof-coaching-duration').value = (CLIENT.coachingDurationMonths != null) ? CLIENT.coachingDurationMonths : '';
    }
    document.getElementById('prof-subscription-duration').value = (CLIENT.subscriptionDurationMonths != null) ? CLIENT.subscriptionDurationMonths : '';
    document.getElementById('prof-subscription-end-date-display').textContent = CLIENT.subscriptionEndDate || 'לא נקבע';
    document.getElementById('prof-subscription-type').value = CLIENT.subscriptionType || '';
    document.getElementById('prof-height').value               = CLIENT.height                 || '';
    document.getElementById('prof-gender').value       = CLIENT.gender         || 'male';
    document.getElementById('prof-goal').value         = CLIENT.goal           || 'bulk';
    document.getElementById('prof-carb-ratio').value   = (CLIENT.carbRatio != null) ? String(CLIENT.carbRatio) : '';
    setCoachFieldsState(false);
    _refreshAvatarUI(CLIENT.avatarUrl || null);
}

function _refreshAvatarUI(url) {
    const img         = document.getElementById('avatar-preview-img');
    const placeholder = document.getElementById('avatar-preview-placeholder');
    const hamburgerImg = document.getElementById('hamburger-avatar');
    const hamburgerFb  = document.getElementById('hamburger-avatar-fallback');
    if (url) {
        if (img)         { img.src = url; img.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
        if (hamburgerImg){ hamburgerImg.src = url; hamburgerImg.style.display = 'block'; }
        if (hamburgerFb) hamburgerFb.style.display = 'none';
    } else {
        if (img)         img.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
        if (hamburgerImg) hamburgerImg.style.display = 'none';
        if (hamburgerFb)  hamburgerFb.style.display = '';
    }
}

async function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const uid = getActiveUserId();
    if (!uid) return;
    // show immediate local preview
    const localUrl = URL.createObjectURL(file);
    _refreshAvatarUI(localUrl);
    try {
        const publicUrl = await sbUploadAvatar(uid, file);
        CLIENT.avatarUrl = publicUrl;
        await sbUpsertProfile(uid, { avatar_url: publicUrl });
    } catch (e) {
        console.warn('[Avatar] upload failed:', e.message);
    }
    input.value = '';
}

function setCoachFieldsState(editable) {
    document.querySelectorAll('.coach-editable-field').forEach(f => { f.disabled = !editable; });
    document.getElementById('coach-save-note').style.display = editable ? 'block' : 'none';
}

// ── Coach unlock ──────────────────────────────

async function unlockCoachSection() {
    const input = document.getElementById('coach-pin-input');
    const pin = input.value;
    input.value = '';

    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error('no session');

        const resp = await fetch('/api/verify-pin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ pin }),
        });
        const { ok } = await resp.json();

        if (ok) {
            isCoachUnlocked = true;
            setCoachFieldsState(true);
        } else {
            input.classList.remove('shake');
            void input.offsetWidth;
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
    } catch {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
    }
}

// ── Save ──────────────────────────────────────

function saveProfile() {
    console.log('[saveProfile] התחלה');

    const cwEl = document.getElementById('prof-current-weight');
    console.log('[saveProfile] cwEl:', cwEl, 'value:', cwEl && cwEl.value);
    const cw = parseFloat(cwEl && cwEl.value);

    console.log('[saveProfile] קורא profile_data_v1 מ-localStorage');
    const data = JSON.parse(localStorage.getItem('profile_data_v1')) || {};

    const fields = {
        nickname:      document.getElementById('prof-nickname'),
        email:         document.getElementById('prof-email'),
        activityLevel: document.getElementById('prof-activity'),
        allergies:     document.getElementById('prof-allergies'),
        likedFoods:    document.getElementById('prof-liked-foods'),
        dislikedFoods: document.getElementById('prof-disliked-foods'),
    };
    for (const [key, el] of Object.entries(fields)) {
        if (!el) { console.error('[saveProfile] אלמנט חסר:', key); return; }
    }

    Object.assign(data, {
        nickname:      fields.nickname.value,
        email:         fields.email.value,
        currentWeight: cw || CLIENT.currentWeight,
        activityLevel: parseFloat(fields.activityLevel.value),
        allergies:     fields.allergies.value,
        likedFoods:    fields.likedFoods.value,
        dislikedFoods: fields.dislikedFoods.value,
    });
    console.log('[saveProfile] data לפני שמירה:', JSON.stringify(data));

    if (isCoachUnlocked) {
        Object.assign(data, {
            name:        document.getElementById('prof-name').value,
            startWeight: parseFloat(document.getElementById('prof-start-weight').value) || CLIENT.startWeight,
            goalWeight:  parseFloat(document.getElementById('prof-goal-weight').value) || CLIENT.goalWeight,
            birthDate:             document.getElementById('prof-birth-date').value,
            startDate:             document.getElementById('prof-start-date').value,
            coachingDurationMonths: document.getElementById('prof-coaching-duration').value === '' ? null : parseInt(document.getElementById('prof-coaching-duration').value),
            subscriptionDurationMonths: document.getElementById('prof-subscription-duration').value === '' ? null : parseInt(document.getElementById('prof-subscription-duration').value),
            subscriptionType: document.getElementById('prof-subscription-type').value || null,
            height:                parseFloat(document.getElementById('prof-height').value),
            gender:                document.getElementById('prof-gender').value,
            goal:                  document.getElementById('prof-goal').value,
            carbRatio:             document.getElementById('prof-carb-ratio').value === '' ? null : parseFloat(document.getElementById('prof-carb-ratio').value),
        });
        data.subscriptionEndDate = _computeSubscriptionEndDate(data.startDate, data.subscriptionDurationMonths);
        document.getElementById('prof-subscription-end-date-display').textContent = data.subscriptionEndDate || 'לא נקבע';
    }

    try {
        localStorage.setItem('profile_data_v1', JSON.stringify(data));
        console.log('[saveProfile] נשמר ב-localStorage בהצלחה');
    } catch (e) {
        console.error('[saveProfile] שגיאה בשמירה ל-localStorage:', e);
        return;
    }

    Object.assign(CLIENT, data);

    if (cw) {
        localStorage.setItem('current_weight', String(cw));
        const today = new Date().toISOString().split('T')[0];
        const history = JSON.parse(localStorage.getItem('weight_history') || '[]');
        const idx = history.findIndex(e => e.date === today);
        if (idx >= 0) history[idx].weight = cw;
        else history.push({ date: today, weight: cw });
        localStorage.setItem('weight_history', JSON.stringify(history));
        console.log('[saveProfile] weight_history עודכן:', history);
        // Supabase sync
        if (typeof syncWeightNow === 'function') syncWeightNow(today, cw);
    }

    // Supabase sync
    if (typeof syncProfileNow === 'function') syncProfileNow(data);

    if (typeof generatePortionGoals === 'function') generatePortionGoals();
    if (typeof loadSavedWeight     === 'function')  loadSavedWeight();
    if (typeof renderWeightChart   === 'function')  renderWeightChart();

    const btn = document.getElementById('prof-save-btn');
    btn.textContent = '✓ נשמר!';
    btn.style.background = '#22c55e';
    setTimeout(() => {
        btn.textContent = 'שמור שינויים';
        btn.style.background = '';
        closeProfile();
    }, 1200);
}
