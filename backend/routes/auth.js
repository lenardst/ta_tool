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

    const newUser = db.prepare('SELECT id, username, is_admin FROM users WHERE id=?').get(info.lastInsertRowid);
    const token = jwt.sign({ id: newUser.id, username: newUser.username, is_admin: newUser.is_admin }, JWT_SECRET, {
      expiresIn: '30d',
    });
    res.status(201).json({ token, username: newUser.username, is_admin: newUser.is_admin });
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

    const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
