const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/classes — all classes (shared across users)
router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM classes ORDER BY name').all());
});

// POST /api/classes  — import a canvas course (optionally scoped to a section)
router.post('/', (req, res) => {
  const { canvas_course_id, name, canvas_base_url, canvas_section_id, canvas_section_name } = req.body;

  const existing = canvas_section_id
    ? db.prepare('SELECT * FROM classes WHERE canvas_course_id=? AND canvas_section_id=?')
        .get(canvas_course_id, canvas_section_id)
    : db.prepare('SELECT * FROM classes WHERE canvas_course_id=? AND canvas_section_id IS NULL')
        .get(canvas_course_id);

  if (existing) return res.json(existing);

  const info = db.prepare(
    'INSERT INTO classes(canvas_course_id, name, canvas_base_url, canvas_section_id, canvas_section_name) VALUES(?,?,?,?,?)'
  ).run(
    canvas_course_id,
    name,
    canvas_base_url,
    canvas_section_id || null,
    canvas_section_name || null,
  );

  const classId = info.lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id=?').get(classId));
});

// POST /api/classes/:id/sync-students
router.post('/:id/sync-students', async (req, res, next) => {
  try {
    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const { students } = req.body;
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: 'students must be an array' });
    }

    const incomingByCanvasId = new Map();
    for (const s of students) {
      const canvas_user_id = String(s?.canvas_user_id ?? '').trim();
      if (!canvas_user_id || incomingByCanvasId.has(canvas_user_id)) continue;
      incomingByCanvasId.set(canvas_user_id, {
        canvas_user_id,
        name: String(s?.name ?? '').trim(),
        email: String(s?.email ?? '').trim(),
        sortable_name: String(s?.sortable_name ?? s?.name ?? '').trim(),
      });
    }

    const upsert = db.prepare(`
      INSERT INTO students(class_id, canvas_user_id, name, email, sortable_name)
      VALUES(@class_id, @canvas_user_id, @name, @email, @sortable_name)
      ON CONFLICT(class_id, canvas_user_id) DO UPDATE SET
        name=excluded.name,
        email=excluded.email,
        sortable_name=excluded.sortable_name
    `);
    const syncMany = db.transaction((list) => {
      for (const s of list) upsert.run({ class_id: cls.id, ...s });
    });
    syncMany([...incomingByCanvasId.values()]);
    res.json(db.prepare('SELECT * FROM students WHERE class_id=? ORDER BY sortable_name').all(cls.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/students/sample  { count, only_with_email? }
router.post('/:id/students/sample', (req, res) => {
  const cls = db.prepare('SELECT id FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const raw = Number(req.body.count);
  if (!Number.isFinite(raw) || raw < 1) {
    return res.status(400).json({ error: 'count must be a positive number' });
  }
  const count = Math.min(500, Math.floor(raw));
  const onlyWithEmail = req.body.only_with_email !== false;

  const rows = onlyWithEmail
    ? db
        .prepare(
          `SELECT * FROM students
           WHERE class_id=? AND TRIM(COALESCE(email,'')) != ''
           ORDER BY RANDOM() LIMIT ?`
        )
        .all(req.params.id, count)
    : db
        .prepare('SELECT * FROM students WHERE class_id=? ORDER BY RANDOM() LIMIT ?')
        .all(req.params.id, count);

  res.json(rows);
});

// GET /api/classes/:id/students
router.get('/:id/students', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM students WHERE class_id=? ORDER BY sortable_name').all(req.params.id)
  );
});

// DELETE /api/classes/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
