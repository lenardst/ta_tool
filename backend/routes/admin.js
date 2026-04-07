const express = require('express');
const db = require('../db');
const router = express.Router();

// All routes here require admin
router.use((req, res, next) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
});

// GET /api/admin/users
router.get('/users', (_req, res) => {
  res.json(db.prepare('SELECT id, username, is_admin FROM users ORDER BY username').all());
});

// GET /api/admin/classes  — all classes with their member user_ids
router.get('/classes', (_req, res) => {
  const classes = db.prepare('SELECT * FROM classes ORDER BY name').all();
  const members = db.prepare('SELECT class_id, user_id FROM class_members').all();
  const memberMap = {};
  for (const m of members) {
    if (!memberMap[m.class_id]) memberMap[m.class_id] = [];
    memberMap[m.class_id].push(m.user_id);
  }
  res.json(classes.map(c => ({ ...c, member_ids: memberMap[c.id] ?? [] })));
});

// POST /api/admin/class-members  { class_id, user_id }
router.post('/class-members', (req, res) => {
  const { class_id, user_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO class_members(class_id, user_id) VALUES(?,?)').run(class_id, user_id);
  res.json({ ok: true });
});

// DELETE /api/admin/class-members/:classId/:userId
router.delete('/class-members/:classId/:userId', (req, res) => {
  db.prepare('DELETE FROM class_members WHERE class_id=? AND user_id=?').run(
    req.params.classId,
    req.params.userId,
  );
  res.json({ ok: true });
});

module.exports = router;
