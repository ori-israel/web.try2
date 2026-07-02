// ===== פאנל מנהל: רשימת לקוחות, מצבי תצוגה, ניהול לקוחות, עורך אימונים, שאלון =====

// ── Admin panel ──────────────────────────────────────────────

let _coachMode     = 'overview';
let _coachClients  = null;
let _coachDashData = null;

async function renderAdminPanel() {
    const list = document.getElementById('admin-client-list');
    if (!list) return;
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען נתונים...</div>';
    _syncCoachToggle();
    _refreshPendingBadge();
    try {
        _coachClients = await sbFetchAllClients();
        if (!_coachClients.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות רשומים עדיין</div>';
            return;
        }
        _coachDashData = await sbFetchCoachDashData(_coachClients.map(c => c.id));
        if (_coachMode === 'subscribers') _renderSubscribersMode(list);
        else _renderCoachList(list);
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

function setCoachMode(mode) {
    _coachMode = mode;
    _syncCoachToggle();
    const list = document.getElementById('admin-client-list');
    if (!list) return;
    if (mode === 'archive') _renderArchiveMode(list);
    else if (mode === 'pending') _renderPendingMode(list);
    else if (mode === 'subscribers') _renderSubscribersMode(list);
    else if (_coachClients && _coachDashData) _renderCoachList(list);
}

function _syncCoachToggle() {
    document.querySelectorAll('.coach-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === _coachMode);
    });
}

// עדכון מונה הממתינים על כפתור "ממתינים"
async function _refreshPendingBadge() {
    const badge = document.getElementById('pending-count-badge');
    if (!badge) return;
    try {
        const pend = await sbFetchPendingClients();
        if (pend.length) { badge.textContent = pend.length; badge.style.display = 'inline-block'; }
        else { badge.style.display = 'none'; }
    } catch { badge.style.display = 'none'; }
}

// מצב "ממתינים לאישור" בלוח המנהל
async function _renderPendingMode(list) {
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען...</div>';
    try {
        const pend = await sbFetchPendingClients();
        if (!pend.length) {
            list.innerHTML = '<div class="admin-empty">אין משתמשים שממתינים לאישור</div>';
            return;
        }
        list.innerHTML = '';
        pend.forEach(c => {
            const name = c.name || c.nickname || '(ללא שם)';
            const date = c.created_at ? new Date(c.created_at).toLocaleDateString('he-IL') : '';
            const row = document.createElement('div');
            row.className = 'coach-overview-card';
            row.style.padding = '13px';
            row.innerHTML =
                `<div style="font-weight:bold;font-size:15px;color:var(--text-primary,#fff);">${_esc(name)}</div>` +
                `<div style="font-size:13px;color:var(--text-secondary,#888);margin:2px 0 10px;">${_esc(c.email || '')} · נרשם ${date}</div>` +
                `<div style="display:flex;gap:8px;">` +
                  `<button class="admin-approve-btn" data-id="${c.id}" style="flex:1;background:var(--gradient-btn);color:#fff;border:none;border-radius:8px;padding:9px;font-weight:bold;cursor:pointer;">אשר ✓</button>` +
                  `<button class="admin-reject-btn" data-id="${c.id}" data-name="${_esc(name)}" style="flex:1;background:transparent;border:1px solid #e55;color:#e55;border-radius:8px;padding:9px;font-weight:bold;cursor:pointer;">דחה ✕</button>` +
                `</div>`;
            row.querySelector('.admin-approve-btn').addEventListener('click', async function () {
                this.disabled = true; this.textContent = 'מאשר...';
                try {
                    // אישור דרך השרת: מסיר את החסימה + מסמן approved
                    await _authedPost('/api/approve-user', { userId: this.dataset.id });
                    _showToast('✅ המשתמש אושר');
                    // רענון מלא: מרענן את רשימת הלקוחות במטמון כך שיופיע מיד בסקירה
                    await renderAdminPanel();
                } catch (e) { this.disabled = false; this.textContent = 'אשר ✓'; await showAlert('שגיאה: ' + e.message); }
            });
            row.querySelector('.admin-reject-btn').addEventListener('click', async function () {
                const nm = this.dataset.name;
                if (!await showConfirmDanger(`לדחות את ${nm}? המשתמש יועבר לארכיון.`)) return;
                try {
                    await _authedPost('/api/delete-user', { userId: this.dataset.id });
                    _showToast(`🗃️ ${nm} נדחה והועבר לארכיון`);
                    // רענון מלא של הלוח
                    await renderAdminPanel();
                } catch (e) { await showAlert('שגיאה: ' + e.message); }
            });
            list.appendChild(row);
        });
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

function _renderCoachList(list) {
    if (_coachMode === 'urgent') _renderUrgentMode(list);
    else                         _renderOverviewMode(list);
}

async function _renderArchiveMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען ארכיון...</div>';
    try {
        const deleted = await sbFetchDeletedClients();
        if (!deleted.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות בארכיון</div>';
            return;
        }
        list.innerHTML = '';
        deleted.forEach(client => {
            const name = client.name || client.nickname || client.email || '(ללא שם)';
            const deletedDate = new Date(client.deleted_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
            const row = document.createElement('div');
            row.className = 'coach-urgent-row';
            row.dataset.name = name.toLowerCase();
            row.style.opacity = '0.75';
            row.innerHTML = `
                <div class="coach-urgent-left">
                    <div class="coach-urgent-text">
                        <span class="coach-urgent-name">${_esc(name)}</span>
                        <span class="coach-urgent-reason" style="color:#888">נמחק: ${deletedDate}</span>
                    </div>
                </div>
                <div class="coach-urgent-right">
                    <button class="admin-restore-btn" data-client-id="${client.id}" data-client-name="${_esc(name)}" style="background:#4ade80;color:#000;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:bold;cursor:pointer;">שחזר</button>
                </div>`;
            row.querySelector('.admin-restore-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                restoreClient(this.dataset.clientId, this.dataset.clientName);
            });
            list.appendChild(row);
        });
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

async function toggleSubscriberMode(clientId, current) {
    const newVal = !current;
    const client = _coachClients?.find(c => c.id === clientId);
    const name   = client?.name || client?.nickname || '';
    if (client) client.is_subscriber = newVal;
    try {
        await sbSetSubscriberMode(clientId, newVal);
        _showToast(newVal ? `💳 ${name} הועבר למנויים` : `✅ ${name} הועבר חזרה לליווי`);
    } catch (e) {
        if (client) client.is_subscriber = current;
        alert('שגיאה בעדכון סטטוס מנוי');
    }
    const list = document.getElementById('admin-client-list');
    if (list) _renderCoachList(list);
}

function _renderSubscribersMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list';
    list.innerHTML = '';

    if (!_coachClients) {
        list.innerHTML = '<div class="admin-loading">טוען...</div>';
        return;
    }

    const subscribers = _coachClients.filter(c => c.is_subscriber);
    if (!subscribers.length) {
        list.innerHTML = '<div class="admin-empty">אין לקוחות במנוי כרגע</div>';
        return;
    }

    subscribers.forEach(client => {
        const name = client.name || client.nickname || '(ללא שם)';
        const s    = _coachDashData ? _buildClientStats(client) : null;
        const score = s?.currentScore ?? null;
        const bClr  = score === null ? '#444' : score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
        const sStr  = score !== null ? Math.round(score) : '—';

        const row = document.createElement('div');
        row.className = 'coach-urgent-row';
        row.dataset.name = name.toLowerCase();
        row.innerHTML = `
            <div class="coach-urgent-left">
                ${_coachAvatar(client)}
                <div class="coach-urgent-text">
                    <span class="coach-urgent-name">${_fromMeDot(client)}${_esc(name)}</span>
                    <span class="coach-urgent-reason" style="color:#60a5fa;font-weight:600;">${client.subscription_type === 'bonus' ? '🎁 מנוי בונוס ליווי' : client.subscription_type === 'paid' ? '💳 מנוי בתשלום' : '💳 מנוי פעיל'}</span>
                    ${(() => {
                        const sub = _subscriptionUrgency(client);
                        if (!sub) return '';
                        const clr = sub.level === 'expired' ? '#f87171' : '#fb923c';
                        return `<span class="coach-urgent-reason" style="color:${clr};font-weight:600;">${sub.text}</span>`;
                    })()}
                </div>
            </div>
            <div class="coach-urgent-right">
                <span class="coach-urgent-score" style="color:${bClr}">${sStr}</span>
                <button class="admin-select-btn" data-client-id="${client.id}">כניסה ›</button>
                <button class="coach-unsub-btn" data-client-id="${client.id}" data-is-sub="true" style="background:transparent;border:1px solid #f87171;color:#f87171;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">החזר לליווי</button>
            </div>`;
        row.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        row.querySelector('.coach-unsub-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSubscriberMode(this.dataset.clientId, true);
        });
        _wireFromMeDot(row);
        list.appendChild(row);
    });
}

// דחיפות מנוי — פג תוקף / מתקרב לסיום (14 ימים ומטה)
function _subscriptionUrgency(client) {
    if (!client.subscription_end_date) return null;
    const days = Math.floor((new Date(client.subscription_end_date + 'T00:00:00').getTime() - Date.now()) / 86400000);
    if (days < 0)  return { level: 'expired', text: 'פג תוקף המנוי' };
    if (days <= 14) return { level: 'warning', text: `נשארו ${days} ימים למנוי` };
    return null;
}

function _buildClientStats(client) {
    const { profiles, scores, workouts, nutrition, monStr, prevMonStr, lastWeightDates, weightDatesByClient } = _coachDashData;
    const profile = profiles.find(p => p.id === client.id) || {};

    const clientScores = scores
        .filter(s => s.client_id === client.id)
        .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const currentWeek = clientScores.find(s => s.week_start === monStr)  || null;
    const prevWeek    = clientScores.find(s => s.week_start === prevMonStr) || null;

    const pv = profile.portion_values || {};
    const pvP = pv.protein ?? 27.5;
    const pvC = pv.carbs   ?? 37.5;
    const pvF = pv.fat     ?? 12.5;

    // Portion targets — same formula as app.js calcPortionTargets()
    const weight   = profile.current_weight || 80;
    const age      = profile.birth_date ? Math.floor((new Date() - new Date(profile.birth_date)) / (1000*60*60*24*365.25)) : 30;
    const gender   = profile.gender || 'male';
    const height   = profile.height || 170;
    const activity = profile.activity_level || 1.4;
    const goal     = profile.goal || 'maintain';
    const pRatio   = profile.protein_ratio || 2.0;
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee          = Math.round(bmr * activity);
    const totalCal      = goal === 'cut' ? tdee - 250 : tdee + 250;
    const proteinGrams  = weight * pRatio;
    const remaining     = totalCal - proteinGrams * 4;
    const carbRatio     = (profile.carb_ratio != null) ? profile.carb_ratio : (goal === 'cut' ? 0.7 : 0.6);
    const carbCals      = remaining * carbRatio;
    const fatCals       = remaining * (1 - carbRatio);
    const tgProtein     = Math.round((proteinGrams / pvP) * 2) / 2;
    const tgCarbs       = Math.round((carbCals / 4 / pvC) * 2) / 2;
    const tgFat         = Math.round((fatCals / 9 / pvF) * 2) / 2;

    const nutritionMeetsGoal = n => n.protein >= tgProtein && n.carbs >= tgCarbs && n.fat >= tgFat;

    const clientWorkouts  = workouts.filter(w => w.client_id === client.id);
    const clientNutrition = nutrition.filter(n => n.user_id  === client.id);
    // תת-קבוצות לשבוע הנוכחי בלבד (הנתונים נשלפים כעת ל-4 שבועות אחורה)
    const clientWorkoutsCur  = clientWorkouts.filter(w => w.date >= monStr);
    const clientNutritionCur = clientNutrition.filter(n => n.date >= monStr);

    const hasWorkout = clientWorkoutsCur.length > 0;

    const nutritionBadDays = clientNutritionCur.filter(n => !nutritionMeetsGoal(n)).length;

    // Live scores for current week (cron only saves at week end)
    const weeklyTarget      = profile.workouts_per_week || 3;
    const workoutDates      = new Set(clientWorkoutsCur.map(w => w.date));
    const liveWorkouts      = Math.min(Math.round(workoutDates.size / weeklyTarget * 100), 100);
    const nutritionMet      = clientNutritionCur.filter(nutritionMeetsGoal).length;
    const liveNutrition     = Math.min(Math.round(nutritionMet / 7 * 100), 100);
    const lastWeight        = lastWeightDates?.[client.id];
    const liveHabits        = (lastWeight && lastWeight >= monStr) ? 100 : 0;
    const liveScore         = Math.round(liveWorkouts * 0.4 + liveNutrition * 0.4 + liveHabits * 0.2);

    // רצף רציף של 4 השבועות האחרונים + השבוע הנוכחי לפי תאריך — אף שבוע לא מדולג.
    // ציון שמור אם קיים, אחרת חישוב חי מאותם נתונים (אותה נוסחה).
    const weightSet = weightDatesByClient?.[client.id];
    const baseMs = Date.parse(monStr);
    const last4 = [];
    for (let i = 4; i >= 1; i--) {
        const startMs = baseMs - i * 7 * 86400000;
        const start = new Date(startMs).toISOString().slice(0, 10);
        const end   = new Date(startMs + 6 * 86400000).toISOString().slice(0, 10);
        const stored = clientScores.find(s => s.week_start === start);
        if (stored) { last4.push(stored.score); continue; }
        const wkDays = new Set(clientWorkouts.filter(w => w.date >= start && w.date <= end).map(w => w.date)).size;
        const nMet   = clientNutrition.filter(n => n.date >= start && n.date <= end && nutritionMeetsGoal(n)).length;
        const hasWt  = weightSet ? [...weightSet].some(d => d >= start && d <= end) : false;
        last4.push(Math.round((Math.min(wkDays / weeklyTarget, 1) * 0.4 + Math.min(nMet / 7, 1) * 0.4 + (hasWt ? 1 : 0) * 0.2) * 100));
    }
    last4.push(currentWeek ? currentWeek.score : liveScore);

    return {
        currentScore:    currentWeek?.score           ?? liveScore,
        prevScore:       prevWeek?.score              ?? null,
        workoutsScore:   currentWeek?.workouts_score  ?? liveWorkouts,
        nutritionScore:  currentWeek?.nutrition_score ?? liveNutrition,
        habitsScore:     currentWeek?.habits_score    ?? liveHabits,
        last4,
        hasWorkout,
        nutritionBadDays,
        vacationMode:      !!(profile.vacation_mode),
        isSubscriber:      !!(profile.is_subscriber),
        lastSeen:          profile.last_seen || null,
        lastWeightUpdate:  lastWeightDates?.[client.id] || null,
    };
}

function _coachInitials(name, id) {
    const COLORS = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171','#38bdf8'];
    const hash   = [...(id || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const color  = COLORS[Math.abs(hash) % COLORS.length];
    const words  = (name || '?').trim().split(/\s+/);
    const init   = ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
    return `<div class="coach-avatar" style="background:${color}">${init}</div>`;
}

// תמונת פרופיל אם הלקוח העלה אחת, אחרת ראשי תיבות — לשימוש בכל מסכי לוח המנהל
function _coachAvatar(client) {
    const name = client.name || client.nickname || '(ללא שם)';
    if (client.avatar_url) {
        return `<img src="${_esc(client.avatar_url)}" alt="תמונת פרופיל של ${_esc(name)}" class="coach-avatar-img" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none">${_coachInitials(name, client.id)}</span>`;
    }
    return _coachInitials(name, client.id);
}

// נקודת מקור: כחול = ממני, אדום = לא ממני. לחיצה מחליפה ושומרת.
function _fromMeDot(client) {
    const on    = !!client.from_me;
    const color = on ? '#3b82f6' : '#ef4444';
    const title = on ? 'הגיע ממני (כחול) — לחצו לשינוי' : 'לא הגיע ממני (אדום) — לחצו לשינוי';
    return `<button class="from-me-dot" data-client-id="${client.id}" data-from-me="${on ? '1' : '0'}" title="${title}" aria-label="${title}" style="background:${color}"></button>`;
}

async function _toggleFromMe(btn) {
    const id   = btn.dataset.clientId;
    const next = btn.dataset.fromMe !== '1';
    // עדכון מיידי בתצוגה
    btn.dataset.fromMe = next ? '1' : '0';
    btn.style.background = next ? '#3b82f6' : '#ef4444';
    btn.title = next ? 'הגיע ממני (כחול) — לחצו לשינוי' : 'לא הגיע ממני (אדום) — לחצו לשינוי';
    const c = (_coachClients || []).find(x => x.id === id);
    if (c) c.from_me = next;
    try {
        await sbSetFromMe(id, next);
    } catch (e) {
        // החזרה למצב קודם בכישלון
        btn.dataset.fromMe = next ? '0' : '1';
        btn.style.background = next ? '#ef4444' : '#3b82f6';
        if (c) c.from_me = !next;
        _showToast('שגיאה בשמירת הסימון');
    }
}

// מחבר מאזין ללחיצה על הנקודה — פותח תפריט אישור (לא משנה צבע ישירות)
function _wireFromMeDot(row) {
    const dot = row.querySelector('.from-me-dot');
    if (dot) dot.addEventListener('click', function (e) {
        e.stopPropagation();
        _openFromMeMenu(this);
    });
}

let _fromMeMenuEl = null;
function _closeFromMeMenu() {
    if (_fromMeMenuEl) { _fromMeMenuEl.remove(); _fromMeMenuEl = null; }
    document.removeEventListener('click', _closeFromMeMenu);
}
function _openFromMeMenu(dot) {
    _closeFromMeMenu();
    const on = dot.dataset.fromMe === '1';
    const targetColor = on ? '#ef4444' : '#3b82f6';
    const targetLabel = on ? 'שנה לאדום (לא הגיע ממני)' : 'שנה לכחול (הגיע ממני)';
    const menu = document.createElement('div');
    menu.className = 'from-me-menu';
    menu.innerHTML = `<button class="from-me-menu-btn"><span class="from-me-menu-swatch" style="background:${targetColor}"></span>${targetLabel}</button>`;
    document.body.appendChild(menu);
    _fromMeMenuEl = menu;
    // מיקום מתחת לנקודה, צמוד לימין, עם הצמדה לגבולות המסך
    const r = dot.getBoundingClientRect();
    const mw = menu.offsetWidth, vw = window.innerWidth, m = 8;
    let left = r.right - mw;
    if (left + mw + m > vw) left = vw - mw - m;
    if (left < m) left = m;
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.left = left + 'px';
    menu.querySelector('.from-me-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleFromMe(dot);
        _closeFromMeMenu();
    });
    // לחיצה בכל מקום אחר סוגרת בלי לשנות
    setTimeout(function () { document.addEventListener('click', _closeFromMeMenu); }, 0);
}

function _coachSparkline(scores) {
    if (!scores.length) return '<span style="color:#555;font-size:11px;padding:8px 0;display:block">אין נתונים</span>';
    const VW = 240, VH = 72;
    const PT = 20, PB = 8, PL = 10, PR = 10;
    const chartW = VW - PL - PR;
    const chartH = VH - PT - PB;
    const last = scores[scores.length - 1];
    const clr  = last >= 80 ? '#4ade80' : last >= 50 ? '#facc15' : '#f87171';

    const pts = scores.map((s, i) => ({
        x: PL + (scores.length === 1 ? chartW / 2 : (i / (scores.length - 1)) * chartW),
        y: PT + chartH - (s / 100) * chartH,
        s,
    }));

    const targetY  = (PT + chartH - 0.8 * chartH).toFixed(1);
    const labelY   = (parseFloat(targetY) - 3).toFixed(1);
    const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots     = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${clr}"/>`).join('');
    const labels   = pts.map(p => `<text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="500" fill="${clr}">${Math.round(p.s)}</text>`).join('');

    return `<svg width="100%" viewBox="0 0 ${VW} ${VH}" style="display:block;background:var(--bg-card-alt);border-radius:8px;overflow:hidden;">
        <line x1="${PL}" y1="${targetY}" x2="${VW - PR - 18}" y2="${targetY}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.6"/>
        <text x="${VW - PR - 2}" y="${labelY}" text-anchor="end" font-size="9" fill="#f59e0b" opacity="0.8">יעד 80</text>
        <polyline points="${polyline}" fill="none" stroke="${clr}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}${labels}
    </svg>`;
}

function _coachScoreBar(label, score) {
    const pct = score ?? 0;
    const clr = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
    return `<div class="coach-bar-row">
        <span class="coach-bar-label">${label}</span>
        <div class="coach-bar-track"><div class="coach-bar-fill" style="width:${pct}%;background:${clr}"></div></div>
        <span class="coach-bar-pct">${Math.round(pct)}%</span>
    </div>`;
}

function _showToast(msg) {
    let toast = document.getElementById('coach-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'coach-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

async function toggleVacationMode(clientId, current) {
    const newVal = !current;
    const profile = _coachDashData?.profiles.find(p => p.id === clientId);
    const client  = _coachClients?.find(c => c.id === clientId);
    const name    = client?.name || client?.nickname || '';
    if (profile) profile.vacation_mode = newVal;
    try {
        await sbSetVacationMode(clientId, newVal);
        _showToast(newVal ? `🏖️ מצב חופשה הופעל עבור ${name}` : `✅ מצב חופשה כובה עבור ${name}`);
    } catch (e) {
        if (profile) profile.vacation_mode = current;
        alert('שגיאה בעדכון מצב חופשה');
    }
    const list = document.getElementById('admin-client-list');
    if (list) _renderCoachList(list);
}

function _ensureSearchBar(list) {
    let sb = document.getElementById('coach-search-bar');
    if (!sb) {
        sb = document.createElement('div');
        sb.id = 'coach-search-bar';
        sb.innerHTML = '<input type="text" placeholder="חיפוש לקוח..." oninput="_coachSearch(this.value)">';
        list.parentElement.insertBefore(sb, list);
    }
    sb.style.display = '';
    const inp = sb.querySelector('input');
    if (inp) inp.value = '';
}

function _coachSearch(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#admin-client-list .coach-overview-card, #admin-client-list .coach-urgent-row').forEach(el => {
        el.style.display = (!q || (el.dataset.name || '').includes(q)) ? '' : 'none';
    });
}

function _renderUrgentMode(list) {
    list.className = 'admin-client-list';
    _ensureSearchBar(list);
    const items = _coachClients.map(client => {
        const s    = _buildClientStats(client);
        const name = client.name || client.nickname || '(ללא שם)';
        let priority = 6, reason = null, cls = '';

        const sub = _subscriptionUrgency(client);
        if (sub && sub.level === 'expired') {
            priority = 0; cls = 'urgent-critical'; reason = sub.text;
        } else if (sub && sub.level === 'warning') {
            priority = 1; cls = 'urgent-warning'; reason = sub.text;
        } else if (client.is_subscriber) {
            // ללקוחות מנוי (בלי אירוע דחוף) אין שאר הסיבות — הן שייכות למעקב ליווי בלבד
        } else if (s.prevScore !== null && s.currentScore !== null && (s.prevScore - s.currentScore) > 20) {
            priority = 2; cls = 'urgent-critical';
            reason = `ירידה של ${Math.round(s.prevScore - s.currentScore)} נק׳ מהשבוע שעבר`;
        } else if (!s.hasWorkout) {
            priority = 3; cls = 'urgent-warning';
            reason = 'לא תיעד אימון השבוע';
        } else if (s.nutritionBadDays >= 3) {
            priority = 4; cls = 'urgent-warning';
            reason = `תזונה מתחת ליעד ${s.nutritionBadDays} ימים השבוע`;
        } else if (s.currentScore !== null && s.currentScore < 50) {
            priority = 5; cls = 'urgent-low';
            reason = `ציון נמוך: ${Math.round(s.currentScore)}`;
        }
        return { client, s, name, priority, reason, cls };
    });

    items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.s.currentScore ?? 100) - (b.s.currentScore ?? 100);
    });

    list.innerHTML = '';
    items.filter(i => i.reason).forEach(({ client, s, name, reason, cls }) => {
        const scoreStr = s.currentScore !== null ? Math.round(s.currentScore) : '—';
        const vac = s.vacationMode;
        const row = document.createElement('div');
        row.className = 'coach-urgent-row';
        row.dataset.name = name.toLowerCase();
        row.innerHTML = `
            <div class="coach-urgent-left">
                ${_coachAvatar(client)}
                <div class="coach-urgent-text">
                    <span class="coach-urgent-name">${_fromMeDot(client)}${_esc(name)}</span>
                    <span class="coach-urgent-reason ${cls}">${reason}</span>
                </div>
            </div>
            <div class="coach-urgent-right">
                <span class="coach-urgent-score">${scoreStr}</span>
                <button class="coach-vac-icon${vac ? ' active' : ''}" data-client-id="${client.id}" data-vac="${vac}">🏖️</button>
                <button class="admin-select-btn" data-client-id="${client.id}">כניסה ›</button>
            </div>`;
        row.querySelector('.coach-vac-icon').addEventListener('click', function() {
            toggleVacationMode(this.dataset.clientId, this.dataset.vac === 'true');
        });
        row.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        _wireFromMeDot(row);
        list.appendChild(row);
    });

    if (!list.children.length) {
        list.innerHTML = '<div class="admin-empty">🎉 כל הלקוחות במצב תקין!</div>';
    }
}

function _renderOverviewMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list coach-overview-list';
    list.innerHTML = '';

    _coachClients.filter(c => !c.is_subscriber).forEach(client => {
        const s    = _buildClientStats(client);
        const name = client.name || client.nickname || '(ללא שם)';
        const score = s.currentScore;
        const bClr = score === null ? '#444' : score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
        const sStr = score !== null ? Math.round(score) : '—';
        const vac  = s.vacationMode;

        const card = document.createElement('div');
        card.className = 'coach-overview-card';
        card.dataset.name = name.toLowerCase();
        card.style.borderColor = bClr;
        card.innerHTML = `
            <div class="coach-card-header" onclick="this.closest('.coach-overview-card').classList.toggle('expanded')">
                ${_coachAvatar(client)}
                <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div class="coach-card-name">${_fromMeDot(client)}${_esc(name)}</div>
                    ${(() => {
                        if (!s.lastSeen) return '<span style="font-size:11px;color:#888;">כניסה אחרונה: לא ידוע</span>';
                        const days = Math.floor((Date.now() - new Date(s.lastSeen).getTime()) / 86400000);
                        const clr  = days >= 5 ? '#f87171' : days >= 2 ? '#fb923c' : '#4ade80';
                        const lbl  = days === 0 ? 'היום' : days === 1 ? 'אתמול' : days === 2 ? 'שלשום' : `לפני ${days} ימים`;
                        return `<span style="font-size:11px;color:${clr};">כניסה אחרונה: ${lbl}</span>`;
                    })()}
                    ${(() => {
                        if (!s.lastWeightUpdate) return '<span style="font-size:11px;color:#888;">עדכון משקל אחרון: לא עודכן</span>';
                        const days = Math.floor((Date.now() - new Date(s.lastWeightUpdate + 'T00:00:00').getTime()) / 86400000);
                        const clr  = days >= 14 ? '#f87171' : days >= 7 ? '#fb923c' : '#4ade80';
                        const lbl  = days === 0 ? 'היום' : days === 1 ? 'אתמול' : `לפני ${days} ימים`;
                        return `<span style="font-size:11px;color:${clr};">עדכון משקל אחרון: ${lbl}</span>`;
                    })()}
                    ${(() => {
                        const sub = _subscriptionUrgency(client);
                        if (!sub) return '';
                        const clr = sub.level === 'expired' ? '#f87171' : '#fb923c';
                        return `<span style="font-size:11px;color:${clr};font-weight:600;">${sub.text}</span>`;
                    })()}
                </div>
                <div class="coach-card-score" style="color:${bClr}">${sStr}<span class="coach-card-score-unit">pts</span></div>
                <button class="coach-vac-icon${vac ? ' active' : ''}" data-client-id="${client.id}" data-vac="${vac}">🏖️</button>
            </div>
            <div class="coach-card-body">
                <div class="coach-bars">
                    ${_coachScoreBar('אימונים', s.workoutsScore)}
                    ${_coachScoreBar('תזונה',   s.nutritionScore)}
                    ${_coachScoreBar('הרגלים',  s.habitsScore)}
                </div>
                <div class="coach-sparkline">${_coachSparkline(s.last4)}</div>
                <button class="coach-q-btn" data-client-id="${client.id}">📋 שאלון אחרון</button>
                <button class="admin-select-btn" data-client-id="${client.id}" style="width:100%;margin-top:6px">כניסה ›</button>
                <button class="admin-move-subscriber-btn" data-client-id="${client.id}" style="width:100%;margin-top:6px;background:transparent;border:1px solid #60a5fa;color:#60a5fa;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;">💳 העבר למנויים</button>
                <button class="admin-delete-client-btn" data-client-id="${client.id}" data-client-name="${_esc(name)}" style="width:100%;margin-top:6px">🗑️ מחק לקוח</button>
            </div>`;
        card.querySelector('.coach-vac-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleVacationMode(this.dataset.clientId, this.dataset.vac === 'true');
        });
        card.querySelector('.coach-q-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            showQuestionnaireModal(this.dataset.clientId);
        });
        card.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        card.querySelector('.admin-move-subscriber-btn').addEventListener('click', async function(e) {
            e.stopPropagation();
            const confirmed = await showConfirmDanger(`להעביר את ${name} למנויים?\nהפיצ'רים של הליווי יעלמו בשביל ${name}.`);
            if (!confirmed) return;
            toggleSubscriberMode(this.dataset.clientId, false);
        });
        card.querySelector('.admin-delete-client-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteClient(this.dataset.clientId, this.dataset.clientName);
        });
        _wireFromMeDot(card);
        list.appendChild(card);
    });
}

async function adminViewClient(clientId) {
    // Re-verify admin status from DB on every client-view action (not just JS variable)
    const session = await sbGetSession();
    if (!session?.user) return;
    const self = await sbFetchProfile(session.user.id);
    if (!self?.is_admin) {
        console.error('[adminViewClient] Access denied — not admin');
        return;
    }
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    await _loadClientAndShowApp(clientId);
}

function adminBackToList() {
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    SB_VIEW_ID = null;
    window._authReady = new Promise(r => { _resolveAuthReady = r; });
    _appInitDone = false;
    renderAdminPanel().then(() => _showOverlay('admin-overlay'));
}

// ── New client modal ─────────────────────────────────────────

function openNewClientModal() {
    const modal = document.getElementById('new-client-modal');
    modal.style.display = 'flex';
    document.getElementById('nc-name').value = '';
    document.getElementById('nc-email').value = '';
    document.getElementById('nc-password').value = '';
    document.getElementById('nc-start-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('nc-birth-date').value = '';
    document.getElementById('nc-start-weight').value = '';
    document.getElementById('nc-goal-weight').value = '';
    document.getElementById('nc-height').value = '';
    document.getElementById('nc-gender').value = 'male';
    document.getElementById('nc-goal').value = 'cut';
    document.getElementById('nc-error').style.display = 'none';
}

function closeNewClientModal() {
    document.getElementById('new-client-modal').style.display = 'none';
}

async function submitNewClient() {
    const name      = document.getElementById('nc-name').value.trim();
    const email     = document.getElementById('nc-email').value.trim();
    const password  = document.getElementById('nc-password').value;
    const startDate = document.getElementById('nc-start-date').value;
    const errEl     = document.getElementById('nc-error');
    const btn       = document.getElementById('nc-submit-btn');

    errEl.style.display = 'none';
    if (!name || !email || !password) {
        errEl.textContent = 'שם, אימייל וסיסמה הם שדות חובה';
        errEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
        errEl.style.display = 'block';
        return;
    }

    btn.textContent = 'יוצר...';
    btn.disabled = true;

    try {
        await _authedPost('/api/create-user', {
            name,
            email,
            password,
            startDate,
            birthDate:   document.getElementById('nc-birth-date').value   || null,
            startWeight: parseFloat(document.getElementById('nc-start-weight').value) || null,
            goalWeight:  parseFloat(document.getElementById('nc-goal-weight').value)  || null,
            height:      parseInt(document.getElementById('nc-height').value)          || null,
            gender:      document.getElementById('nc-gender').value,
            goal:        document.getElementById('nc-goal').value,
        });
        closeNewClientModal();
        await renderAdminPanel();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'צור לקוח';
        btn.disabled = false;
    }
}

async function _authedPost(path, body) {
    const session = await sbGetSession();
    if (!session) throw new Error('פג תוקף החיבור — יש לרענן את הדף');
    const resp = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'שגיאת שרת');
    return result;
}

// ── Delete client ─────────────────────────────────────────────

async function deleteClient(clientId, clientName) {
    const confirmed = await showConfirmDanger(`למחוק את ${clientName}? ניתן לשחזר מהארכיון.`);
    if (!confirmed) return;
    try {
        await _authedPost('/api/delete-user', { userId: clientId });
        _showToast(`🗃️ ${clientName} הועבר לארכיון`);
        await renderAdminPanel();
    } catch (e) {
        await showAlert('שגיאה: ' + e.message);
    }
}

async function restoreClient(clientId, clientName) {
    try {
        await _authedPost('/api/restore-user', { userId: clientId });
        _showToast(`✅ ${clientName} שוחזר בהצלחה`);
        const list = document.getElementById('admin-client-list');
        if (list) await _renderArchiveMode(list);
        await renderAdminPanel();
        setCoachMode('overview');
    } catch (e) {
        await showAlert('שגיאה: ' + e.message);
    }
}

// ── מודל שאלון שבועי ────────────────────────────────────────

async function showQuestionnaireModal(clientId) {
    const modal = document.getElementById('questionnaire-modal');
    const body  = document.getElementById('qmodal-body');
    body.innerHTML = '<p style="color:#aaa">טוען...</p>';
    modal.classList.remove('hidden');
    try {
        const row = await sbFetchLatestQuestionnaire(clientId);
        if (!row) { body.innerHTML = '<p style="color:#aaa">אין שאלון עדיין.</p>'; return; }
        const date = new Date(row.submitted_at).toLocaleDateString('he-IL', { day:'numeric', month:'long', year:'numeric' });
        body.innerHTML = `
            <p class="qmodal-date">נשלח: ${date}</p>
            <div class="qmodal-q"><strong>1. ניצחון:</strong><p>${_esc(row.q1_win) || '—'}</p></div>
            <div class="qmodal-q"><strong>2. אתגר:</strong><p>${_esc(row.q2_challenge) || '—'}</p></div>
            <div class="qmodal-q"><strong>3. ציון עמידה:</strong><p>${row.q3_score != null ? row.q3_score + '/10' : '—'}</p></div>
            <div class="qmodal-q"><strong>4. הערות:</strong><p>${_esc(row.q4_topic) || '—'}</p></div>`;
    } catch(e) {
        body.innerHTML = '<p style="color:#f87171">שגיאה בטעינה.</p>';
        console.error('[SB] questionnaire fetch:', e.message);
    }
}

function closeQuestionnaireModal() {
    document.getElementById('questionnaire-modal').classList.add('hidden');
}

// ── עורך תוכנית אימונים (מנהל בלבד) ────────────────────────

function openWorkoutEditor() {
    _renderWorkoutEditorBody();
    document.getElementById('workout-editor-modal').style.display = 'flex';
}

function closeWorkoutEditor() {
    document.getElementById('workout-editor-modal').style.display = 'none';
}

function _weLetters() {
    const count = parseInt(document.getElementById('we-workouts-per-week')?.value) || CLIENT.workoutsPerWeek || 3;
    return 'ABCDEFG'.slice(0, Math.min(Math.max(count, 1), 7)).split('');
}

function _renderWorkoutEditorBody() {
    const container = document.getElementById('workout-editor-body');
    if (!container) return;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const perWeek  = CLIENT.workoutsPerWeek || 3;

    container.innerHTML = `
        <div class="we-per-week-row">
            <label for="we-workouts-per-week">מספר אימוני כוח בשבוע:</label>
            <input id="we-workouts-per-week" type="number" min="1" max="7" value="${perWeek}" class="we-per-week-input"
                onchange="_rerenderWorkoutSections()">
        </div>
        <div id="we-sections"></div>
    `;

    _rerenderWorkoutSections();
}

function _rerenderWorkoutSections() {
    const sectionsEl = document.getElementById('we-sections');
    if (!sectionsEl) return;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    sectionsEl.innerHTML = '';

    _weLetters().forEach(letter => {
        const workout = CLIENT['workout' + letter] || [];
        const days    = CLIENT.workoutDays?.[letter] || [];

        const section = document.createElement('div');
        section.className = 'we-section';
        section.innerHTML = `
            <div class="we-section-header">
                <h3 class="we-section-title">אימון ${letter}</h3>
                <div class="we-days-row">
                    ${[0,1,2,3,4,5,6].map(d => `
                        <label class="we-day-label">
                            <input type="checkbox" class="we-day-cb" data-workout="${letter}" data-day="${d}" ${days.includes(d) ? 'checked' : ''}>
                            <span>${dayNames[d]}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="we-list">
                <div class="we-header-row">
                    <span class="we-col-name">שם תרגיל</span>
                    <span class="we-col-sets">ח׳</span>
                    <span class="we-col-sets">ע׳</span>
                    <span class="we-col-reps">חזרות</span>
                    <span class="we-col-del"></span>
                </div>
                <div id="we-body-${letter}">
                    ${workout.map((ex, i) => _weRowHtml(letter, i, ex.name, ex.reps, ex.warmupSets, ex.workSets)).join('')}
                </div>
            </div>
            <button class="we-add-btn" onclick="weAddRow('${letter}')">+ הוסף תרגיל</button>
            <div class="we-cardio-section">
                <div class="we-cardio-title">🏃 אירובי (אופציונלי)</div>
                <div class="we-cardio-row">
                    <input class="we-input we-cardio-desc" type="text" maxlength="120"
                        placeholder="תיאור: הליכון שיפוע 15 מהירות 4..."
                        value="${CLIENT.cardioPlan?.[letter]?.description || ''}"
                        data-workout="${letter}">
                    <div class="we-cardio-duration-wrap">
                        <input class="we-input we-cardio-duration" type="number" min="1" max="180"
                            placeholder="דקות"
                            value="${CLIENT.cardioPlan?.[letter]?.duration || ''}"
                            data-workout="${letter}">
                        <span class="we-cardio-unit">דק׳</span>
                    </div>
                </div>
            </div>
        `;
        sectionsEl.appendChild(section);
    });
    sectionsEl.querySelectorAll('.we-name-input').forEach(_initExerciseAutocomplete);
}

function _weRowHtml(letter, i, name = '', reps = '10-15', warmupSets = 1, workSets = 2) {
    return `
        <div class="we-row">
            <div class="we-col-name" style="position:relative;">
                <input class="we-input we-name-input" type="text" value="${name}" placeholder="שם תרגיל" data-field="name" data-workout="${letter}" data-idx="${i}">
            </div>
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${warmupSets}" data-field="warmupSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${workSets}" data-field="workSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-reps we-col-reps" type="text" value="${reps}" placeholder="10-15" data-field="reps" data-workout="${letter}" data-idx="${i}">
            <button class="we-del-btn we-col-del" onclick="weDeleteRow('${letter}', this)">✕</button>
        </div>`;
}

function _initExerciseAutocomplete(input) {
    const removeDropdown = () => {
        const d = input.parentNode.querySelector('.we-autocomplete');
        if (d) d.remove();
    };
    input.addEventListener('input', () => {
        removeDropdown();
        const val = input.value.trim();
        if (!val) return;
        const matches = Object.keys(exerciseBank).filter(n => n.includes(val)).slice(0, 8);
        if (!matches.length) return;
        const dropdown = document.createElement('div');
        dropdown.className = 'we-autocomplete';
        dropdown.style.cssText = 'position:absolute;top:100%;right:0;left:0;z-index:10001;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-height:220px;overflow-y:auto;';
        matches.forEach(name => {
            const item = document.createElement('div');
            item.textContent = name;
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:14px;direction:rtl;';
            item.addEventListener('mousedown', e => { e.preventDefault(); input.value = name; removeDropdown(); });
            item.addEventListener('mouseover', () => { item.style.background = 'var(--border)'; });
            item.addEventListener('mouseout', () => { item.style.background = ''; });
            dropdown.appendChild(item);
        });
        input.parentNode.appendChild(dropdown);
    });
    input.addEventListener('blur', () => setTimeout(removeDropdown, 150));
}

function weAddRow(letter) {
    const body = document.getElementById(`we-body-${letter}`);
    const i    = body.querySelectorAll('.we-row').length;
    body.insertAdjacentHTML('beforeend', _weRowHtml(letter, i));
    const newInput = body.querySelector('.we-row:last-child .we-name-input');
    if (newInput) _initExerciseAutocomplete(newInput);
}

function weDeleteRow(letter, btn) {
    btn.closest('.we-row').remove();
}

async function saveWorkoutPlan() {
    const confirmed = await showConfirmDanger('לשמור את תוכנית האימון? הנתונים הקיימים יוחלפו.');
    if (!confirmed) return;
    const btn = document.getElementById('we-save-btn');
    btn.disabled    = true;
    btn.textContent = 'שומר...';
    try {
        const perWeek = parseInt(document.getElementById('we-workouts-per-week')?.value) || 3;
        CLIENT.workoutsPerWeek = perWeek;

        _weLetters().forEach(letter => {
            const tbody     = document.getElementById(`we-body-${letter}`);
            const exercises = [];
            tbody.querySelectorAll('.we-row').forEach(row => {
                const nameEl      = row.querySelector('[data-field="name"]');
                const repsEl      = row.querySelector('[data-field="reps"]');
                const warmupEl    = row.querySelector('[data-field="warmupSets"]');
                const workEl      = row.querySelector('[data-field="workSets"]');
                if (nameEl?.value.trim()) {
                    exercises.push({
                        name:       nameEl.value.trim(),
                        reps:       repsEl?.value.trim() || '10-15',
                        warmupSets: parseInt(warmupEl?.value) || 0,
                        workSets:   parseInt(workEl?.value)   || 3,
                    });
                }
            });
            CLIENT['workout' + letter] = exercises;

            const days = [];
            document.querySelectorAll(`.we-day-cb[data-workout="${letter}"]`).forEach(cb => {
                if (cb.checked) days.push(parseInt(cb.dataset.day));
            });
            if (!CLIENT.workoutDays) CLIENT.workoutDays = {};
            CLIENT.workoutDays[letter] = days;

            const cardioDesc = document.querySelector(`.we-cardio-desc[data-workout="${letter}"]`)?.value.trim() || '';
            const cardioDur  = parseInt(document.querySelector(`.we-cardio-duration[data-workout="${letter}"]`)?.value) || 0;
            if (!CLIENT.cardioPlan) CLIENT.cardioPlan = {};
            CLIENT.cardioPlan[letter] = cardioDesc ? { description: cardioDesc, duration: cardioDur || null } : null;
        });

        await syncWorkoutPlanNow();
        await initWorkoutsFromClient();
        initWorkoutsChecklist();
        initVideos();

        btn.textContent       = '✓ נשמר!';
        btn.style.background  = '#22c55e';
        setTimeout(() => {
            btn.textContent      = 'שמור תוכנית';
            btn.style.background = '';
            btn.disabled         = false;
            closeWorkoutEditor();
        }, 1200);
    } catch (err) {
        btn.textContent      = 'שגיאה!';
        btn.style.background = '#e55';
        setTimeout(() => {
            btn.textContent      = 'שמור תוכנית';
            btn.style.background = '';
            btn.disabled         = false;
        }, 2000);
    }
}

