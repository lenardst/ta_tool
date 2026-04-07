const express = require('express');
const db = require('../db');
const router = express.Router();

function isClassAdmin(classId, userId) {
  const row = db.prepare(
    "SELECT 1 FROM class_members WHERE class_id=? AND user_id=? AND role='admin'"
  ).get(classId, userId);
  return !!row;
}

function canManageClass(classId, userId, isGlobalAdmin) {
  return isGlobalAdmin || isClassAdmin(classId, userId);
}

// GET /api/admin/users — visible to anyone who can manage at least one class
router.get('/users', (req, res) => {
  const hasAccess = req.user.is_admin ||
    !!db.prepare("SELECT 1 FROM class_members WHERE user_id=? AND role='admin'").get(req.user.id);
  if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT id, username, is_admin FROM users ORDER BY username').all());
});

// GET /api/admin/classes — global admin sees all; class admin sees only their classes
router.get('/classes', (req, res) => {
  const classes = req.user.is_admin
    ? db.prepare('SELECT * FROM classes ORDER BY name').all()
    : db.prepare(
        "SELECT c.* FROM classes c JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.role='admin' ORDER BY c.name"
      ).all(req.user.id);

  if (!classes.length) return res.json([]);

  const classIds = classes.map(c => c.id);
  const members = db.prepare(
    `SELECT class_id, user_id FROM class_members WHERE class_id IN (${classIds.map(() => '?').join(',')})`
  ).all(...classIds);

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
  if (!canManageClass(class_id, req.user.id, req.user.is_admin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare("INSERT OR IGNORE INTO class_members(class_id, user_id, role) VALUES(?,?,'member')").run(class_id, user_id);
  res.json({ ok: true });
});

// DELETE /api/admin/class-members/:classId/:userId
router.delete('/class-members/:classId/:userId', (req, res) => {
  const { classId, userId } = req.params;
  if (!canManageClass(classId, req.user.id, req.user.is_admin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Prevent removing the last admin of a class
  const isTargetAdmin = isClassAdmin(classId, userId);
  if (isTargetAdmin) {
    const adminCount = db.prepare(
      "SELECT COUNT(*) AS n FROM class_members WHERE class_id=? AND role='admin'"
    ).get(classId).n;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot remove the only admin of a class' });
    }
  }
  db.prepare('DELETE FROM class_members WHERE class_id=? AND user_id=?').run(classId, userId);
  res.json({ ok: true });
});

// POST /api/admin/classes/:id/restore  — recover a soft-deleted class
router.post('/classes/:id/restore', (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Global admin only' });
  db.prepare('UPDATE classes SET deleted_at=NULL WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
