const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(obj);
});

router.put('/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, value);
  res.json({ key, value });
});

module.exports = router;
