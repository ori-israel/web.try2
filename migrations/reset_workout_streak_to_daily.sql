-- איפוס הסטריק השבועי הישן לפני מעבר לחישוב יומי (המספר הישן חסר משמעות תחת הלוגיקה החדשה)
update streaks set workout_streak = 0, workout_completed_date = null;
