const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const auth   = req.headers.authorization || '';
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    // Week that just ended: Mon–Sun where Sun = today (cron runs Sun 00:02 UTC)
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const sun = new Date(now);
    const mon = new Date(sun);
    mon.setUTCDate(sun.getUTCDate() - 6);

    const fmt = d => d.toISOString().split('T')[0];
    const weekStart = fmt(mon);
    const weekEnd   = fmt(sun);

    console.log(`Saving weekly scores for ${weekStart} – ${weekEnd}`);

    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, workouts_per_week, protein_ratio, current_weight, start_weight, vacation_mode')
        .eq('is_admin', false);

    if (profErr) {
        console.error('Error fetching profiles:', profErr);
        return res.status(500).json({ error: profErr.message });
    }

    const results = [];

    for (const profile of profiles) {
        const userId = profile.id;

        if (profile.vacation_mode) {
            console.log(`Skipping ${userId} — vacation mode active`);
            results.push({ userId, skipped: true, reason: 'vacation' });
            continue;
        }

        // Skip if score already saved for this client + week
        const { data: existing } = await supabase
            .from('weekly_scores')
            .select('id')
            .eq('client_id', userId)
            .eq('week_start', weekStart)
            .maybeSingle();

        if (existing) {
            results.push({ userId, skipped: true });
            continue;
        }

        // Workouts (40%): distinct dates in workout_performance_log ÷ workouts_per_week
        const { data: workoutData } = await supabase
            .from('workout_performance_log')
            .select('date')
            .eq('client_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd);

        const workoutDates  = new Set((workoutData || []).map(r => r.date));
        const weeklyTarget  = profile.workouts_per_week || 3;
        const workoutsScore = Math.min(workoutDates.size / weeklyTarget, 1);

        // Nutrition (40%): days where protein >= weight*ratio AND kcal >= calorieGoal*0.85
        const weight      = profile.current_weight || profile.start_weight || 80;
        const proteinGoal = Math.round(weight * (profile.protein_ratio || 2));
        const calorieGoal = 2000;

        const { data: nutritionData } = await supabase
            .from('daily_nutrition')
            .select('protein, carbs, fat')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd);

        let nutritionMet = 0;
        (nutritionData || []).forEach(r => {
            const kcal = r.protein * 4 + r.carbs * 4 + r.fat * 9;
            if (r.protein >= proteinGoal && kcal >= calorieGoal * 0.85) nutritionMet++;
        });
        const nutritionScore = Math.min(nutritionMet / 7, 1);

        // Habits (20%): any weight entry this week
        const { data: weightData } = await supabase
            .from('weight_history')
            .select('date')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .limit(1);

        const habitsScore = (weightData && weightData.length > 0) ? 1 : 0;

        // Final weighted score (0–100)
        const score             = Math.round((workoutsScore * 0.4 + nutritionScore * 0.4 + habitsScore * 0.2) * 100);
        const workoutsScorePct  = Math.round(workoutsScore  * 100);
        const nutritionScorePct = Math.round(nutritionScore * 100);
        const habitsScorePct    = Math.round(habitsScore    * 100);

        const { error: insertErr } = await supabase
            .from('weekly_scores')
            .insert({
                client_id:       userId,
                week_start:      weekStart,
                score,
                workouts_score:  workoutsScorePct,
                nutrition_score: nutritionScorePct,
                habits_score:    habitsScorePct,
            });

        if (insertErr) {
            console.error(`Error saving score for ${userId}:`, insertErr);
            results.push({ userId, error: insertErr.message });
        } else {
            console.log(`Saved score ${score} for ${userId}`);
            results.push({ userId, score, weekStart });
        }
    }

    return res.status(200).json({ week: weekStart, results });
};
