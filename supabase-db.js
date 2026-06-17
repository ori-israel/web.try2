// ============================================================
// supabase-db.js — Supabase client + כל פעולות ה-DB
// ============================================================

const SUPABASE_URL      = 'https://ebfyrswzqawqznydovbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZnlyc3d6cWF3cXpueWRvdmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjExMDYsImV4cCI6MjA5NDQzNzEwNn0.jVN2qlhdqHieRgmx5C9EVQxCumidePUwQkqAQV8mhrA';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
function _localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// ── מצב session גלובלי ─────────────────────────────────────
let SB_USER     = null;   // משתמש מחובר
let SB_VIEW_ID  = null;   // ID הלקוח הנצפה (מנהל יכול לצפות באחר)
let SB_IS_ADMIN = false;

// ── Token cache (for keepalive saves on page close) ─────────
let _cachedToken = null;
db.auth.onAuthStateChange((_event, session) => {
    _cachedToken = session ? session.access_token : null;
});

// ── IndexedDB queue for SW background sync ──────────────────

const _IDB_NAME  = 'pf-sw-db';
const _IDB_STORE = 'pending-nutrition';

function _openSWDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(_IDB_NAME, 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(_IDB_STORE, { keyPath: 'id' });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function sbQueueNutritionSync(userId, protein, carbs, fat) {
    if (!userId) return;

    // 1. שמירה ישירה מיידית — עובד כל עוד הדף חי
    sbSaveNutrition(userId, protein, carbs, fat).catch(() => {});

    // 2. IDB + SW background sync — גיבוי לסגירה מיידית
    const token = _cachedToken;
    if (!token) return;
    try {
        const db2 = await _openSWDB();
        const tx  = db2.transaction(_IDB_STORE, 'readwrite');
        tx.objectStore(_IDB_STORE).put({
            id: 'latest_' + userId,
            userId, protein, carbs, fat,
            date:        _localDate(),
            token,
            supabaseUrl: SUPABASE_URL,
            anonKey:     SUPABASE_ANON_KEY,
            ts:          Date.now(),
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });

        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg.sync) {
                await reg.sync.register('sync-nutrition');
            } else if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NUTRITION' });
            }
        }
    } catch (_) {
        _sbSaveNutritionKeepalive(userId, protein, carbs, fat);
    }
}

// keepalive fetch fallback
function _sbSaveNutritionKeepalive(userId, protein, carbs, fat) {
    const token = _cachedToken;
    if (!token) return;
    const today = _localDate();
    fetch(`${SUPABASE_URL}/rest/v1/daily_nutrition`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify([{
            user_id: userId, date: today,
            protein, carbs, fat,
            updated_at: new Date().toISOString(),
        }]),
        keepalive: true,
    }).catch(() => {});
}

function getActiveUserId() {
    return SB_VIEW_ID || (SB_USER && SB_USER.id) || null;
}

// ── Auth ────────────────────────────────────────────────────

async function sbSignIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function sbSignOut() {
    const { error } = await db.auth.signOut();
    if (error) throw error;
}

// ── תיעוד אישור תנאים (ראיה משפטית) ────────────────────────
// גרסת המסמכים הנוכחית — לעדכן אם משנים תנאי שימוש/פרטיות
const TERMS_VERSION = 'v1.0';

async function sbLogConsent(userId, email) {
    // upsert עם ignoreDuplicates — נרשם רק בפעם הראשונה לכל גרסת תנאים
    const { error } = await db
        .from('consent_log')
        .upsert(
            { user_id: userId, email: email, terms_version: TERMS_VERSION },
            { onConflict: 'user_id,terms_version', ignoreDuplicates: true }
        );
    // לא זורקים שגיאה — כשל בתיעוד לא צריך לחסום התחברות
    if (error) console.warn('[consent] failed to log:', error.message);
}

async function sbGetSession() {
    const { data: { session } } = await db.auth.getSession();
    return session;
}

// ── Profile ─────────────────────────────────────────────────

let _sbToastTimer = null;
function showSupabaseError() {
    const toast = document.getElementById('supabase-error-toast');
    if (!toast) return;
    toast.style.display = 'block';
    clearTimeout(_sbToastTimer);
    _sbToastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function _isNetworkError(error) {
    if (!error) return false;
    if (error.code === 'PGRST116') return false;
    if (error.status === 401 || error.status === 403) return false;
    return true;
}

async function sbFetchProfile(userId) {
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error && error.code !== 'PGRST116') { if (_isNetworkError(error)) showSupabaseError(); throw error; }
    return data;
}

async function sbUploadAvatar(uid, file) {
    const { error } = await db.storage
        .from('avatars')
        .upload(`${uid}/avatar`, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = db.storage.from('avatars').getPublicUrl(`${uid}/avatar`);
    return data.publicUrl;
}

function sbGetAvatarUrl(uid) {
    const { data } = db.storage.from('avatars').getPublicUrl(`${uid}/avatar`);
    return data.publicUrl;
}

async function sbFetchProgressPhotos(userId) {
    const { data, error } = await db
        .from('progress_photos')
        .select('id, storage_path, uploaded_at')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });
    if (error) return [];
    return data || [];
}

async function sbUploadProgressPhoto(userId, file) {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage
        .from('progress-photos')
        .upload(path, file, { contentType: file.type });
    if (upErr) throw upErr;
    const { error: dbErr } = await db
        .from('progress_photos')
        .insert({ user_id: userId, storage_path: path });
    if (dbErr) {
        await db.storage.from('progress-photos').remove([path]);
        throw dbErr;
    }
}

async function sbDeleteProgressPhoto(photoId, storagePath) {
    const { error: dbErr } = await db.from('progress_photos').delete().eq('id', photoId);
    if (dbErr) throw dbErr;
    await db.storage.from('progress-photos').remove([storagePath]);
}

async function sbGetSignedPhotoUrls(storagePaths) {
    if (!storagePaths.length) return {};
    const { data, error } = await db.storage
        .from('progress-photos')
        .createSignedUrls(storagePaths, 3600);
    if (error || !data) return {};
    const map = {};
    data.forEach(s => { if (s.signedUrl) map[s.path] = s.signedUrl; });
    return map;
}

async function sbUpdateLastSeen(uid) {
    const { error } = await db
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', uid);
    if (error) throw error;
}

async function sbUpsertProfile(userId, updates) {
    const clean = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    const { error } = await db
        .from('profiles')
        .update({ ...clean, updated_at: new Date().toISOString() })
        .eq('id', userId);
    if (error) throw error;
}

// ── תזונה יומית ─────────────────────────────────────────────

async function sbFetchTodayNutrition(userId) {
    const today = _localDate();
    const { data, error } = await db
        .from('daily_nutrition')
        .select('protein, carbs, fat')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
    if (error) { if (_isNetworkError(error)) showSupabaseError(); throw error; }
    return data;
}

async function sbSaveNutrition(userId, protein, carbs, fat) {
    const today = _localDate();
    const { error } = await db.from('daily_nutrition').upsert(
        { user_id: userId, date: today, protein, carbs, fat, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
    );
    if (error) throw error;
}

// ── יומן מאכלים (food_log) ──────────────────────────────────

async function sbAddFoodLog(entry) {
    const uid = getActiveUserId();
    if (!uid || !entry || !entry.id) return;
    const { error } = await db.from('food_log').insert({
        id:               entry.id,
        user_id:          uid,
        date:             _localDate(),
        time:             entry.time || null,
        food:             entry.name || 'ארוחה',
        portions_protein: entry.portions_protein || 0,
        portions_carbs:   entry.portions_carbs   || 0,
        portions_fat:     entry.portions_fat     || 0
    });
    if (error) console.warn('sbAddFoodLog:', error.message);
}

async function sbDeleteFoodLog(id) {
    const uid = getActiveUserId();
    if (!uid || !id) return;
    const { error } = await db.from('food_log').delete().eq('id', id).eq('user_id', uid);
    if (error) console.warn('sbDeleteFoodLog:', error.message);
}

async function sbUpdateFoodLog(id, fields) {
    const uid = getActiveUserId();
    if (!uid || !id) return;
    const { error } = await db.from('food_log').update(fields).eq('id', id).eq('user_id', uid);
    if (error) console.warn('sbUpdateFoodLog:', error.message);
}

async function sbFetchFoodLogRange(userId, fromDate) {
    const { data, error } = await db.from('food_log')
        .select('date, time, food, portions_protein, portions_carbs, portions_fat')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .order('date', { ascending: true })
        .order('time', { ascending: true });
    if (error) { console.warn('sbFetchFoodLogRange:', error.message); return []; }
    return data || [];
}

// ── היסטוריית משקל ──────────────────────────────────────────

async function sbFetchWeightHistory(userId) {
    const { data, error } = await db
        .from('weight_history')
        .select('date, weight')
        .eq('user_id', userId)
        .order('date', { ascending: true });
    if (error) { if (_isNetworkError(error)) showSupabaseError(); throw error; }
    return data || [];
}

async function sbSaveWeight(userId, date, weight) {
    const { error } = await db.from('weight_history').upsert(
        { user_id: userId, date, weight },
        { onConflict: 'user_id,date' }
    );
    if (error) throw error;
}

// ── התקדמות אימונים ─────────────────────────────────────────

async function sbFetchTodayWorkout(userId) {
    const today = _localDate();
    const { data, error } = await db
        .from('workout_progress')
        .select('exercises, tasks, exercise_weights')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function sbSaveWorkoutProgress(userId, exercises, tasks, exercise_weights) {
    const today = _localDate();
    const { error } = await db.from('workout_progress').upsert(
        { user_id: userId, date: today, exercises, tasks, exercise_weights, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
    );
    if (error) throw error;
}

// ── מדדי ביצועים ────────────────────────────────────────────

async function sbFetchPerformance(userId) {
    const { data, error } = await db
        .from('performance_metrics')
        .select('exercise, start_kg, start_reps, current_kg, current_reps')
        .eq('user_id', userId);
    if (error) throw error;
    return data || [];
}

async function sbSavePerformance(userId, exercise, fields) {
    const { error } = await db.from('performance_metrics').upsert(
        { user_id: userId, exercise, ...fields, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,exercise' }
    );
    if (error) throw error;
}

// ── יומן ביצועי אימון ───────────────────────────────────────

async function sbFetchWorkoutPerformanceLog(userId, date) {
    const { data, error } = await db
        .from('workout_performance_log')
        .select('exercise_name, workout_letter, weight_kg, reps')
        .eq('client_id', userId)
        .eq('date', date);
    if (error) throw error;
    return data || [];
}

async function sbFetchLastWorkoutPerformance(userId, exerciseName, beforeDate) {
    const { data, error } = await db
        .from('workout_performance_log')
        .select('date, weight_kg, reps')
        .eq('client_id', userId)
        .eq('exercise_name', exerciseName)
        .lt('date', beforeDate)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function sbSaveWorkoutPerformanceLog(userId, date, entries) {
    const { error: delError } = await db
        .from('workout_performance_log')
        .delete()
        .eq('client_id', userId)
        .eq('date', date);
    if (delError) throw delError;
    if (!entries.length) return;
    const rows = entries.map(e => ({
        client_id: userId,
        date,
        exercise_name: e.exercise_name,
        workout_letter: e.workout_letter,
        weight_kg: e.weight_kg,
        reps: e.reps
    }));
    const { error } = await db.from('workout_performance_log').insert(rows);
    if (error) throw error;
}

async function getExerciseTargets(clientId) {
    const { data, error } = await db
        .from('workout_performance_log')
        .select('exercise_name, weight_kg, reps')
        .eq('client_id', clientId);
    if (error) throw error;
    if (!data || !data.length) return {};

    const groups = {};
    data.forEach(row => {
        if (!groups[row.exercise_name]) groups[row.exercise_name] = [];
        groups[row.exercise_name].push({ weight: row.weight_kg, reps: row.reps });
    });

    const targets = {};
    Object.entries(groups).forEach(([name, rows]) => {
        const peakWeight = Math.max(...rows.map(r => r.weight));
        const peakReps = Math.max(...rows.filter(r => r.weight === peakWeight).map(r => r.reps));
        if (peakReps < 15) {
            targets[name] = { target_weight: peakWeight, target_reps: peakReps + 1, suggest_increase: false };
        } else {
            targets[name] = { target_weight: peakWeight, target_reps: 'כמה שאפשר', suggest_increase: true };
        }
    });
    return targets;
}

// ── רצפים ───────────────────────────────────────────────────

window._streaksCache = { workout_streak: 0, nutrition_streak: 0, workout_completed_date: null, nutrition_completed_date: null };
window._workoutDataCache = { exercises: {}, tasks: [], exercise_weights: {} };

async function sbFetchStreaks(userId) {
    const { data, error } = await db
        .from('streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

// רצף אימונים שבועי: מספר השבועות הרצופים שבהם הושלם יעד האימונים השבועי
async function sbFetchWorkoutStreak(userId) {
    const weeklyTarget = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // ראשון של השבוע הנוכחי (0=ראשון)
    const today = new Date();
    const curSun = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    curSun.setDate(curSun.getDate() - today.getDay());
    const curSat = new Date(curSun);
    curSat.setDate(curSun.getDate() + 6);

    // ספירת ימי אימון ייחודיים בשבוע הנוכחי (חי, כי אין עדיין שורת weekly_scores)
    const { data: logRows } = await db
        .from('workout_performance_log').select('date')
        .eq('client_id', userId).gte('date', fmt(curSun)).lte('date', fmt(curSat));
    const curCount = new Set((logRows || []).map(r => r.date)).size;
    const currentComplete = curCount >= weeklyTarget;

    // ציוני אימונים של שבועות קודמים
    const { data: scoreRows } = await db
        .from('weekly_scores').select('week_start, workouts_score')
        .eq('client_id', userId);
    const scoreMap = {};
    (scoreRows || []).forEach(r => { scoreMap[r.week_start] = r.workouts_score; });

    let streak = 0;
    const cursor = new Date(curSun);
    if (currentComplete) streak++;
    // לבדוק שבועות קודמים אחורה — כל הרשומות מתחילות ביום ראשון
    cursor.setDate(cursor.getDate() - 7);
    while (true) {
        const sunKey = fmt(cursor);
        const score = scoreMap[sunKey];
        if (score != null && score >= 100) {
            streak++;
            cursor.setDate(cursor.getDate() - 7);
        } else break;
    }
    return streak;
}

async function sbSaveStreaks(userId, fields) {
    const { error } = await db.from('streaks').upsert(
        { user_id: userId, ...fields, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
    );
    if (error) throw error;
}

// ── Admin: רשימת כל הלקוחות ─────────────────────────────────

async function sbFetchAllClients() {
    const { data, error } = await db
        .from('profiles')
        .select('id, name, nickname, email, is_admin, is_subscriber, created_at, avatar_url, status, from_me')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
    if (error) throw error;
    // רק לקוחות מאושרים בדיוק (approved) מופיעים ברשימה הראשית.
    // כל סטטוס אחר (pending / ריק / לא-מוכר) לא יופיע כלקוח רגיל — מניעת זליגה.
    return (data || []).filter(u => !u.is_admin && u.status === 'approved');
}

// משתמשים שנרשמו לבד וממתינים לאישור המנהל
async function sbFetchPendingClients() {
    const { data, error } = await db
        .from('profiles')
        .select('id, name, nickname, email, created_at')
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

// אישור משתמש — מאפשר לו להיכנס לאפליקציה
async function sbApproveClient(clientId) {
    const { error } = await db.from('profiles').update({ status: 'approved' }).eq('id', clientId);
    if (error) throw error;
}

async function sbFetchDeletedClients() {
    const { data, error } = await db
        .from('profiles')
        .select('id, name, nickname, email, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function sbSetVacationMode(clientId, value) {
    const { error } = await db.from('profiles').update({ vacation_mode: value }).eq('id', clientId);
    if (error) throw error;
}

async function sbSetSubscriberMode(clientId, value) {
    const { error } = await db.from('profiles').update({ is_subscriber: value }).eq('id', clientId);
    if (error) throw error;
}

// סימון מקור הלקוח: כחול = ממני (true), אדום = לא ממני (false)
async function sbSetFromMe(clientId, value) {
    const { error } = await db.from('profiles').update({ from_me: value }).eq('id', clientId);
    if (error) throw error;
}

async function sbFetchCoachDashData(clientIds) {
    if (!clientIds.length) return { profiles: [], scores: [], workouts: [], nutrition: [], monStr: '', prevMonStr: '' };

    const today  = new Date();
    const dow    = today.getDay();
    const mon    = new Date(today);
    mon.setDate(today.getDate() - dow); // back to Sunday (Israeli week start)
    // No setHours — keep local time so toISOString() stays on the correct date (matches getWeekRange())
    const monStr     = mon.toISOString().slice(0, 10);
    const prevMon    = new Date(mon);
    prevMon.setDate(mon.getDate() - 7);
    const prevMonStr = prevMon.toISOString().slice(0, 10);
    const fourAgo    = new Date(mon);
    fourAgo.setDate(mon.getDate() - 28);
    const fourAgoStr = fourAgo.toISOString().slice(0, 10);

    console.log('[CoachDash] monStr:', monStr, '| prevMonStr:', prevMonStr, '| fourAgoStr:', fourAgoStr, '| clientIds:', clientIds);

    const [pRes, sRes, wRes, nRes, whRes] = await Promise.all([
        db.from('profiles')
          .select('id, current_weight, protein_ratio, workouts_per_week, vacation_mode, last_seen, portion_values, is_subscriber')
          .in('id', clientIds),
        db.from('weekly_scores')
          .select('client_id, week_start, score, workouts_score, nutrition_score, habits_score')
          .in('client_id', clientIds)
          .gte('week_start', fourAgoStr)
          .order('week_start', { ascending: true }),
        db.from('workout_performance_log')
          .select('client_id, date')
          .in('client_id', clientIds)
          .gte('date', monStr),
        db.from('daily_nutrition')
          .select('user_id, date, protein, carbs, fat')
          .in('user_id', clientIds)
          .gte('date', monStr),
        db.from('weight_history')
          .select('user_id, date')
          .in('user_id', clientIds)
          .order('date', { ascending: false }),
    ]);

    // Build map: user_id → most recent weight date
    const lastWeightDates = {};
    (whRes.data || []).forEach(r => {
        if (!lastWeightDates[r.user_id]) lastWeightDates[r.user_id] = r.date;
    });

    console.log('[CoachDash] scores raw:', sRes.data, '| sRes.error:', sRes.error);
    console.log('[CoachDash] workouts raw:', wRes.data?.length, '| nutrition raw:', nRes.data?.length);

    return {
        profiles:        pRes.data  || [],
        scores:          sRes.data  || [],
        workouts:        wRes.data  || [],
        nutrition:       nRes.data  || [],
        lastWeightDates,
        monStr,
        prevMonStr,
    };
}

// ── טעינת כל נתוני משתמש → localStorage + CLIENT ───────────

async function loadUserIntoApp(userId) {
    const [profile, todayNutrition, weightHist, todayWorkout, performance, streaks] = await Promise.all([
        sbFetchProfile(userId),
        sbFetchTodayNutrition(userId),
        sbFetchWeightHistory(userId),
        sbFetchTodayWorkout(userId),
        sbFetchPerformance(userId),
        sbFetchStreaks(userId)
    ]);

    // ── Profile ────────────────────────────────────────────
    if (profile) {
        const p = {
            nickname:      profile.nickname      || '',
            name:          profile.name          || '',
            email:         profile.email         || '',
            currentWeight: profile.current_weight || profile.start_weight || 70,
            goalWeight:    profile.goal_weight    || 73,
            startWeight:   profile.start_weight   || 63,
            height:        profile.height         || 170,
            birthDate:     profile.birth_date     || '',
            startDate:     profile.start_date     || '',
            gender:        profile.gender         || 'male',
            goal:          profile.goal           || 'bulk',
            activityLevel: profile.activity_level || 1.465,
            proteinRatio:  profile.protein_ratio  || 2.0,
            allergies:     profile.allergies      || '',
            likedFoods:    profile.liked_foods    || '',
            dislikedFoods: profile.disliked_foods || '',
            coachingGoal:           profile.coaching_goal            || '',
            coachingDurationMonths: profile.coaching_duration_months || null,
            nextMeetingDate:        profile.next_meeting_date        || null,

            vacationMode:  profile.vacation_mode  || false,
            isSubscriber:  profile.is_subscriber  || false,
            avatarUrl:     profile.avatar_url     || null,
        };
        Object.assign(CLIENT, p);
        sessionStorage.setItem('current_weight', String(p.currentWeight));

        if (profile.workout_a  && profile.workout_a.length)  CLIENT.workoutA    = profile.workout_a;
        if (profile.workout_b  && profile.workout_b.length)  CLIENT.workoutB    = profile.workout_b;
        if (profile.workout_c  && profile.workout_c.length)  CLIENT.workoutC    = profile.workout_c;
        if (profile.workout_d  && profile.workout_d.length)  CLIENT.workoutD    = profile.workout_d;
        if (profile.workout_e  && profile.workout_e.length)  CLIENT.workoutE    = profile.workout_e;
        if (profile.workout_f  && profile.workout_f.length)  CLIENT.workoutF    = profile.workout_f;
        if (profile.workout_g  && profile.workout_g.length)  CLIENT.workoutG    = profile.workout_g;
        if (profile.workout_days)                             CLIENT.workoutDays     = profile.workout_days;
        if (profile.workouts_per_week)                        CLIENT.workoutsPerWeek = profile.workouts_per_week;
        CLIENT.exerciseNotes = profile.exercise_notes || {};
        CLIENT.cardioPlan    = profile.cardio_plan    || {};
        if (profile.portion_values) {
            portionValues.protein = profile.portion_values.protein ?? portionValues.protein;
            portionValues.carbs   = profile.portion_values.carbs   ?? portionValues.carbs;
            portionValues.fat     = profile.portion_values.fat     ?? portionValues.fat;
        }
        if (profile.theme)          localStorage.setItem('theme', profile.theme);
        if (profile.coaching_goal)  localStorage.setItem('coaching_goal_' + userId, profile.coaching_goal);
    }

    // ── תזונה יומית ───────────────────────────────────────
    const portions = todayNutrition
        ? { protein: todayNutrition.protein || 0, carbs: todayNutrition.carbs || 0, fat: todayNutrition.fat || 0 }
        : { protein: 0, carbs: 0, fat: 0 };
    // ⚠️ CRITICAL: key MUST include userId — never use global 'user_portions_v3'
    //    Changing this causes cross-user data contamination (client A sees client B's portions)
    const _portionsKey = 'user_portions_v3_' + userId;
    sessionStorage.setItem(_portionsKey, JSON.stringify(portions));

    // Merge: SB + localStorage + IndexedDB pending (take max of all three)
    const _localStr = localStorage.getItem(_portionsKey);
    const _local    = _localStr ? JSON.parse(_localStr) : null;

    // Check IndexedDB for a pending save that didn't reach Supabase yet
    let _idbPending = null;
    try {
        const _idb = await _openSWDB();
        const _entry = await new Promise((res, rej) => {
            const r = _idb.transaction(_IDB_STORE, 'readonly').objectStore(_IDB_STORE).get('latest_' + userId);
            r.onsuccess = e => res(e.target.result);
            r.onerror   = e => rej(e.target.error);
        });
        if (_entry && _entry.date === _localDate()) _idbPending = _entry;
    } catch (_) {}

    const merged = {
        protein: Math.max(portions.protein, _local?.protein || 0, _idbPending?.protein || 0),
        carbs:   Math.max(portions.carbs,   _local?.carbs   || 0, _idbPending?.carbs   || 0),
        fat:     Math.max(portions.fat,      _local?.fat     || 0, _idbPending?.fat      || 0),
    };
    localStorage.setItem(_portionsKey, JSON.stringify(merged));

    // If IDB had data higher than SB, re-queue the save
    if (_idbPending && (merged.fat > portions.fat || merged.protein > portions.protein || merged.carbs > portions.carbs)) {
        sbQueueNutritionSync(userId, merged.protein, merged.carbs, merged.fat);
    }

    // ── היסטוריית משקל ────────────────────────────────────
    if (weightHist && weightHist.length) {
        sessionStorage.setItem('weight_history', JSON.stringify(weightHist));
    }

    // ── התקדמות אימון יומי — בזיכרון, מסתנכרן ישירות לסופאבייס ──
    window._workoutDataCache = {
        exercises:        todayWorkout?.exercises        || {},
        tasks:            todayWorkout?.tasks            || [],
        exercise_weights: todayWorkout?.exercise_weights || {},
    };

    // ── מדדי ביצועים ──────────────────────────────────────
    if (performance) {
        performance.forEach(p => {
            if (p.start_kg    != null) localStorage.setItem(`perf_${userId}_${p.exercise}_start_kg`,  String(p.start_kg));
            if (p.start_reps  != null) localStorage.setItem(`perf_${userId}_${p.exercise}_start_reps`, String(p.start_reps));
            if (p.current_kg  != null) localStorage.setItem(`perf_${userId}_${p.exercise}_cur_kg`,    String(p.current_kg));
            if (p.current_reps!= null) localStorage.setItem(`perf_${userId}_${p.exercise}_cur_reps`,  String(p.current_reps));
        });
    }

    // ── רצפים ─────────────────────────────────────────────
    if (streaks) {
        _streaksCache.workout_streak           = streaks.workout_streak           || 0;
        _streaksCache.nutrition_streak         = streaks.nutrition_streak         || 0;
        _streaksCache.workout_completed_date   = streaks.workout_completed_date   || null;
        _streaksCache.nutrition_completed_date = streaks.nutrition_completed_date || null;
        if (streaks.workout_completed_date)
            localStorage.setItem('workout_streak_incremented_date_' + userId, streaks.workout_completed_date);
    }

    // ── מונע ש-manageDailyReset יפעיל location.reload() ─────
    // הפונקציה מחפשת את המפתח הזה; אם הוא חסר היא מרעננת את הדף
    const _resetTime = new Date();
    _resetTime.setHours(2, 0, 0, 0);
    localStorage.setItem('last_reset_v3', _resetTime.toDateString());
}

// ── Sync helpers (נקראים מ-app.js ו-profile.js) ─────────────

async function syncProfileNow(data) {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbUpsertProfile(uid, {
            nickname:       data.nickname,
            name:           data.name,
            email:          data.email,
            current_weight: data.currentWeight,
            start_weight:   data.startWeight,
            goal_weight:    data.goalWeight,
            height:         data.height,
            birth_date:     data.birthDate  || null,
            start_date:     data.startDate  || null,
            gender:         data.gender,
            goal:           data.goal,
            activity_level: data.activityLevel,
            protein_ratio:  data.proteinRatio,
            allergies:      data.allergies,
            liked_foods:    data.likedFoods,
            disliked_foods: data.dislikedFoods,
            coaching_goal:            data.coachingGoal,
            coaching_duration_months: data.coachingDurationMonths || null,
        });
    } catch (e) { console.error('[SB] profile sync failed:', e.message); }
}

async function syncWeightNow(date, weight) {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSaveWeight(uid, date, weight);
        // עדכון current_weight בפרופיל כדי שישמר לאחר ריפרש
        await sbUpsertProfile(uid, { current_weight: weight });
        CLIENT.currentWeight = weight;
        sessionStorage.setItem('current_weight', String(weight));
    }
    catch (e) { console.warn('[SB] weight sync:', e.message); }
}

async function syncStreaksNow() {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSaveStreaks(uid, {
            workout_streak:           _streaksCache.workout_streak,
            nutrition_streak:         _streaksCache.nutrition_streak,
            workout_completed_date:   _streaksCache.workout_completed_date,
            nutrition_completed_date: _streaksCache.nutrition_completed_date,
        });
    } catch (e) { console.warn('[SB] streaks sync:', e.message); }
}

async function scheduleSyncWorkoutProgress() {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSaveWorkoutProgress(
            uid,
            window._workoutDataCache.exercises,
            window._workoutDataCache.tasks,
            window._workoutDataCache.exercise_weights
        );
    } catch (e) { showSupabaseError(); console.warn('[SB] workout sync:', e.message); }
}

async function syncPerformanceNow(exercise) {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSavePerformance(uid, exercise, {
            start_kg:     parseFloat(localStorage.getItem(`perf_${uid}_${exercise}_start_kg`))   || null,
            start_reps:   parseInt(localStorage.getItem(`perf_${uid}_${exercise}_start_reps`))   || null,
            current_kg:   parseFloat(localStorage.getItem(`perf_${uid}_${exercise}_cur_kg`))     || null,
            current_reps: parseInt(localStorage.getItem(`perf_${uid}_${exercise}_cur_reps`))     || null,
        });
    } catch (e) { console.warn('[SB] performance sync:', e.message); }
}

async function syncWorkoutPlanNow() {
    const uid = getActiveUserId();
    if (!uid) return;
    // ⚠️ SAFETY: never save if all workout arrays are empty — prevents wiping real data
    const hasData = (CLIENT.workoutA?.length || 0) + (CLIENT.workoutB?.length || 0) +
                    (CLIENT.workoutC?.length || 0) + (CLIENT.workoutD?.length || 0) +
                    (CLIENT.workoutE?.length || 0) + (CLIENT.workoutF?.length || 0) +
                    (CLIENT.workoutG?.length || 0);
    if (!hasData) { console.warn('[SB] syncWorkoutPlanNow blocked — all workout arrays empty'); return; }
    try {
        await sbUpsertProfile(uid, {
            workout_a:         CLIENT.workoutA,
            workout_b:         CLIENT.workoutB,
            workout_c:         CLIENT.workoutC,
            workout_d:         CLIENT.workoutD || null,
            workout_e:         CLIENT.workoutE || null,
            workout_f:         CLIENT.workoutF || null,
            workout_g:         CLIENT.workoutG || null,
            workout_days:      CLIENT.workoutDays,
            workouts_per_week: CLIENT.workoutsPerWeek || 3,
            cardio_plan:       CLIENT.cardioPlan || {},
        });
    } catch (e) { console.warn('[SB] workout plan sync:', e.message); }
}

async function syncThemeNow(theme) {
    const uid = getActiveUserId();
    if (!uid) return;
    try { await sbUpsertProfile(uid, { theme }); }
    catch (e) { console.warn('[SB] theme sync:', e.message); }
}

async function syncCoachingGoalNow(goal) {
    const uid = getActiveUserId();
    if (!uid) return;
    try { await sbUpsertProfile(uid, { coaching_goal: goal }); }
    catch (e) { console.warn('[SB] coaching goal sync:', e.message); }
}

// ── שאלון שבועי ─────────────────────────────────────────────

async function sbSaveWeeklyQuestionnaire(clientId, q1, q2, q3, q4) {
    const { error } = await db.from('weekly_questionnaire').insert({
        client_id: clientId,
        q1_win: q1,
        q2_challenge: q2,
        q3_score: q3,
        q4_topic: q4,
    });
    if (error) throw error;
}

async function sbCheckThisWeekQuestionnaire(clientId) {
    const today = new Date();
    const dow = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - dow); // back to Sunday (Israeli week start)
    const monStr = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
    const { data, error } = await db
        .from('weekly_questionnaire')
        .select('id')
        .eq('client_id', clientId)
        .gte('submitted_at', monStr)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

async function sbFetchLatestQuestionnaire(clientId) {
    const { data, error } = await db
        .from('weekly_questionnaire')
        .select('*')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}
