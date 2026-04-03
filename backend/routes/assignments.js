const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/assignments?class_id=X
router.get('/', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  res.json(db.prepare('SELECT * FROM assignments WHERE class_id=? ORDER BY sort_order, id').all(class_id));
});

// POST /api/assignments
router.post('/', (req, res) => {
  const { class_id, name, max_points, description } = req.body;
  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM assignments WHERE class_id=?').get(class_id);
  const sort_order = (maxOrder?.m ?? -1) + 1;
  const info = db.prepare(
    'INSERT INTO assignments(class_id, name, max_points, description, sort_order) VALUES(?,?,?,?,?)'
  ).run(class_id, name, max_points ?? 100, description ?? '', sort_order);
  res.status(201).json(db.prepare('SELECT * FROM assignments WHERE id=?').get(info.lastInsertRowid));
});

// PATCH /api/assignments/:id
router.patch('/:id', (req, res) => {
  const { name, max_points, description } = req.body;
  db.prepare(`
    UPDATE assignments
    SET name       = COALESCE(?, name),
        max_points = COALESCE(?, max_points),
        description= COALESCE(?, description)
    WHERE id = ?
  `).run(name ?? null, max_points ?? null, description ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM assignments WHERE id=?').get(req.params.id));
});

// DELETE /api/assignments/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
