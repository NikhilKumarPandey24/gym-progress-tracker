CREATE TABLE workouts (
  id SERIAL PRIMARY KEY,
  username TEXT,
  exercise TEXT,
  weight INT,
  reps INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
SELECT * FROM workouts;
