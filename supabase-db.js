// ============================================================
// supabase-db.js — Supabase client + כל פעולות ה-DB
// ============================================================

const SUPABASE_URL      = 'https://ebfyrswzqawqznydovbx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZnlyc3d6cWF3cXpueWRvdmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjExMDYsImV4cCI6MjA5NDQzNzEwNn0.jVN2qlhdqHieRgmx5C9EVQxCumidePUwQkqAQV8mhrA';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── מצב session גלובלי ─────────────────────────────────────
let SB_USER     = null;   // משתמש מחובר
let SB_VIEW_ID  = null;   // ID הלקוח הנצפה (מנהל יכול לצפות באחר)
let SB_IS_ADMIN = false;

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
    const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
    const { error } = await db.from('daily_nutrition').upsert(
        { user_id: userId, date: today, protein, carbs, fat, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
    );
    if (error) throw error;
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
    const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
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

async function sbFetchStreaks(userId) {
    const { data, error } = await db
        .from('streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
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
        .select('id, name, nickname, email, is_admin, created_at, avatar_url')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).filter(u => !u.is_admin);
}

async function sbSetVacationMode(clientId, value) {
    const { error } = await db.from('profiles').update({ vacation_mode: value }).eq('id', clientId);
    if (error) throw error;
}

async function sbFetchCoachDashData(clientIds) {
    if (!clientIds.length) return { profiles: [], scores: [], workouts: [], nutrition: [], monStr: '', prevMonStr: '' };

    const today  = new Date();
    const dow    = today.getDay();
    const mon    = new Date(today);
    mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
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
          .select('id, current_weight, protein_ratio, workouts_per_week, vacation_mode, last_seen')
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
            coachingGoal:  profile.coaching_goal  || '',

            vacationMode:  profile.vacation_mode  || false,
            avatarUrl:     profile.avatar_url     || null,
        };
        Object.assign(CLIENT, p);
        localStorage.setItem('profile_data_v1', JSON.stringify(p));
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
        if (profile.portion_values) {
            portionValues.protein = profile.portion_values.protein ?? portionValues.protein;
            portionValues.carbs   = profile.portion_values.carbs   ?? portionValues.carbs;
            portionValues.fat     = profile.portion_values.fat     ?? portionValues.fat;
        }
        if (profile.theme)          localStorage.setItem('theme', profile.theme);
        if (profile.coaching_goal)  localStorage.setItem('coaching_goal', profile.coaching_goal);
    }

    // ── תזונה יומית ───────────────────────────────────────
    const portions = todayNutrition
        ? { protein: todayNutrition.protein || 0, carbs: todayNutrition.carbs || 0, fat: todayNutrition.fat || 0 }
        : { protein: 0, carbs: 0, fat: 0 };
    sessionStorage.setItem('user_portions_v3', JSON.stringify(portions));
    // Restore Supabase data to localStorage (merged with any unsaved local changes)
    const _localStr = localStorage.getItem('user_portions_v3');
    if (!_localStr) {
        localStorage.setItem('user_portions_v3', JSON.stringify(portions));
    } else {
        const _local = JSON.parse(_localStr);
        localStorage.setItem('user_portions_v3', JSON.stringify({
            protein: Math.max(portions.protein, _local.protein || 0),
            carbs:   Math.max(portions.carbs,   _local.carbs   || 0),
            fat:     Math.max(portions.fat,      _local.fat     || 0),
        }));
    }

    // ── היסטוריית משקל ────────────────────────────────────
    if (weightHist && weightHist.length) {
        sessionStorage.setItem('weight_history', JSON.stringify(weightHist));
    }

    // ── התקדמות אימון יומי ────────────────────────────────
    if (todayWorkout) {
        if (todayWorkout.exercises)        localStorage.setItem('workout_progress_v3', JSON.stringify(todayWorkout.exercises));
        if (todayWorkout.tasks)            localStorage.setItem('tasks_v3',            JSON.stringify(todayWorkout.tasks));
        if (todayWorkout.exercise_weights) sessionStorage.setItem('exercise_weights',    JSON.stringify(todayWorkout.exercise_weights));
    }

    // ── מדדי ביצועים ──────────────────────────────────────
    if (performance) {
        performance.forEach(p => {
            if (p.start_kg    != null) localStorage.setItem(`perf_${p.exercise}_start_kg`,  String(p.start_kg));
            if (p.start_reps  != null) localStorage.setItem(`perf_${p.exercise}_start_reps`, String(p.start_reps));
            if (p.current_kg  != null) localStorage.setItem(`perf_${p.exercise}_cur_kg`,    String(p.current_kg));
            if (p.current_reps!= null) localStorage.setItem(`perf_${p.exercise}_cur_reps`,  String(p.current_reps));
        });
    }

    // ── רצפים ─────────────────────────────────────────────
    if (streaks) {
        localStorage.setItem('workout_streak',   String(streaks.workout_streak   || 0));
        localStorage.setItem('nutrition_streak',  String(streaks.nutrition_streak || 0));
        if (streaks.workout_completed_date && streaks.workout_completed_date === localDateStr())   localStorage.setItem('workout_completed_date',   streaks.workout_completed_date);
        if (streaks.nutrition_completed_date) localStorage.setItem('nutrition_completed_date', streaks.nutrition_completed_date);
    }

    // ── מונע ש-manageDailyReset יפעיל location.reload() ─────
    // הפונקציה מחפשת את המפתח הזה; אם הוא חסר היא מרעננת את הדף
    const _resetTime = new Date();
    _resetTime.setHours(2, 0, 0, 0);
    localStorage.setItem('last_reset_v3', _resetTime.toDateString());
}

// ── Sync helpers (נקראים מ-app.js ו-profile.js) ─────────────

let _nutritionSyncTimer = null;
function scheduleSyncNutrition() {
    clearTimeout(_nutritionSyncTimer);
    _nutritionSyncTimer = setTimeout(async () => {
        const uid = getActiveUserId();
        if (!uid) return;
        try {
            const p = JSON.parse(localStorage.getItem('user_portions_v3') || '{}');
            await sbSaveNutrition(uid, p.protein || 0, p.carbs || 0, p.fat || 0);
        } catch (e) { showSupabaseError(); console.warn('[SB] nutrition sync:', e.message); }
    }, 300);
}

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
            coaching_goal:  data.coachingGoal,
        });
    } catch (e) { console.error('[SB] profile sync failed:', e.message); }
}

async function syncWeightNow(date, weight) {
    const uid = getActiveUserId();
    if (!uid) return;
    try { await sbSaveWeight(uid, date, weight); }
    catch (e) { console.warn('[SB] weight sync:', e.message); }
}

async function syncStreaksNow() {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSaveStreaks(uid, {
            workout_streak:           parseInt(localStorage.getItem('workout_streak')   || '0'),
            nutrition_streak:         parseInt(localStorage.getItem('nutrition_streak') || '0'),
            workout_completed_date:   localStorage.getItem('workout_completed_date')    || null,
            nutrition_completed_date: localStorage.getItem('nutrition_completed_date')  || null,
        });
    } catch (e) { console.warn('[SB] streaks sync:', e.message); }
}

let _workoutSyncTimer = null;
function scheduleSyncWorkoutProgress() {
    clearTimeout(_workoutSyncTimer);
    _workoutSyncTimer = setTimeout(async () => {
        const uid = getActiveUserId();
        if (!uid) return;
        try {
            await sbSaveWorkoutProgress(
                uid,
                JSON.parse(localStorage.getItem('workout_progress_v3') || '{}'),
                JSON.parse(localStorage.getItem('tasks_v3')            || '[]'),
                JSON.parse(localStorage.getItem('exercise_weights')    || '{}')
            );
        } catch (e) { showSupabaseError(); console.warn('[SB] workout sync:', e.message); }
    }, 1500);
}

async function syncPerformanceNow(exercise) {
    const uid = getActiveUserId();
    if (!uid) return;
    try {
        await sbSavePerformance(uid, exercise, {
            start_kg:     parseFloat(localStorage.getItem(`perf_${exercise}_start_kg`))   || null,
            start_reps:   parseInt(localStorage.getItem(`perf_${exercise}_start_reps`))   || null,
            current_kg:   parseFloat(localStorage.getItem(`perf_${exercise}_cur_kg`))     || null,
            current_reps: parseInt(localStorage.getItem(`perf_${exercise}_cur_reps`))     || null,
        });
    } catch (e) { console.warn('[SB] performance sync:', e.message); }
}

async function syncWorkoutPlanNow() {
    const uid = getActiveUserId();
    if (!uid) return;
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

async function syncGeminiKeyNow(key) {
    const uid = getActiveUserId();
    if (!uid) return;
    try { await sbUpsertProfile(uid, { gemini_api_key: key }); }
    catch (e) { console.warn('[SB] gemini key sync:', e.message); }
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
    mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
    const monStr = mon.toISOString().slice(0, 10);
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
