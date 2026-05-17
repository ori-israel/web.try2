-- Seed: 8 weeks of weekly_scores for client 82eeefa5-cd2f-4525-884d-af5ebdf1b7b6
-- Scores calculated as: workouts*0.4 + nutrition*0.4 + habits*0.2

INSERT INTO weekly_scores (client_id, week_start, score, workouts_score, nutrition_score, habits_score) VALUES
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-03-23', 70,  67, 57,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-03-30', 50,  33, 43,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-04-06', 83, 100, 57,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-04-13', 38,  67, 29,    0),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-04-20', 88, 100, 71,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-04-27', 50,  33, 43,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-05-04', 94, 100, 86,  100),
('82eeefa5-cd2f-4525-884d-af5ebdf1b7b6', '2026-05-11', 83, 100, 57,  100)
ON CONFLICT (client_id, week_start) DO NOTHING;
