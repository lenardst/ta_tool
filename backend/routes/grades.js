const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/grades?class_id=X  — full grade matrix for a class
router.get('/', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  const rows = db.prepare(`
    SELECT g.assignment_id, g.student_id, g.points
    FROM grades g
    JOIN assignments a ON a.id = g.assignment_id
    WHERE a.class_id = ?
  `).all(class_id);
  res.json(rows);
});

// PUT /api/grades  — upsert one cell
router.put('/', (req, res) => {
  const { assignment_id, student_id, points } = req.body;
  db.prepare(`
    INSERT INTO grades(assignment_id, student_id, points) VALUES(?,?,?)
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET points=excluded.points
  `).run(assignment_id, student_id, points ?? null);
  res.json(db.prepare('SELECT * FROM grades WHERE assignment_id=? AND student_id=?').get(assignment_id, student_id));
});

module.exports = router;
