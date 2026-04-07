const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }
    if (String(username).length < 2 || String(password).length < 6) {
      return res.status(400).json({ error: 'username must be ≥2 chars, password ≥6 chars' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(String(username).trim());
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(String(password), 10);
    const info = db.prepare('INSERT INTO users(username, password_hash) VALUES(?,?)').run(
      String(username).trim(),
      hash,
    );

    const token = jwt.sign({ id: info.lastInsertRowid, username: String(username).trim() }, JWT_SECRET, {
      expiresIn: '30d',
    });
    res.status(201).json({ token, username: String(username).trim() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
