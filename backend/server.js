// backend/server.js - COMPLETE FIXED BACKEND
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log(`✅ Connected to database: ${process.env.DB_NAME}`);
    createTables();
  }
});

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workouts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        exercise_id VARCHAR(100) NOT NULL,
        exercise_name VARCHAR(100) NOT NULL,
        sets_data JSONB NOT NULL,
        workout_timestamp VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Database tables verified');
  } catch (err) {
    console.error('❌ Database error:', err.message);
  }
};

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    const token = jwt.sign({ userId: result.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// WORKOUT ROUTES
app.get('/api/workouts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workouts WHERE user_id = $1 ORDER BY workout_timestamp DESC',
      [req.userId]
    );
    res.json({ workouts: result.rows });
  } catch (err) {
    console.error('Get workouts error:', err);
    res.status(500).json({ error: 'Failed to fetch workouts' });
  }
});

app.post('/api/workouts', authMiddleware, async (req, res) => {
  try {
    const { exercise_id, exercise_name, sets, workout_timestamp } = req.body;
    
    if (!exercise_id || !exercise_name || !sets || !Array.isArray(sets)) {
      return res.status(400).json({ error: 'Invalid workout data' });
    }

    // Store timestamp exactly as received from frontend (local time string)
    const timestamp = workout_timestamp;

    const result = await pool.query(
      'INSERT INTO workouts (user_id, exercise_id, exercise_name, sets_data, workout_timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, exercise_id, exercise_name, JSON.stringify(sets), timestamp]
    );

    res.json({ workout: result.rows[0] });
  } catch (err) {
    console.error('Add workout error:', err);
    res.status(500).json({ error: 'Failed to add workout' });
  }
});

app.delete('/api/workouts/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM workouts WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    res.json({ message: 'Workout deleted' });
  } catch (err) {
    console.error('Delete workout error:', err);
    res.status(500).json({ error: 'Failed to delete workout' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME}`);
  console.log(`✅ Ready to accept connections!`);
});