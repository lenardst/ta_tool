const express = require('express');
const db = require('../db');
const { pacificTodayYmd } = require('../pacificDate');
const { appendLog } = require('../logger');
const router = express.Router();

// GET /api/attendance?session_id=X
router.get('/', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  res.json(db.prepare('SELECT * FROM attendance WHERE session_id=?').all(session_id));
});

// PUT /api/attendance  — upsert one record
router.put('/', (req, res) => {
  const { session_id, student_id, status } = req.body;

  const before = db.prepare('SELECT status FROM attendance WHERE session_id=? AND student_id=?').get(session_id, student_id);

  db.prepare(`
    INSERT INTO attendance(session_id, student_id, status) VALUES(?,?,?)
    ON CONFLICT(session_id, student_id) DO UPDATE SET status=excluded.status
  `).run(session_id, student_id, status);

  appendLog({
    type: 'attendance',
    session_id,
    student_id,
    before: before ? { status: before.status } : null,
    after: { status },
  });

  if (status === 'absent') {
    db.prepare(`
      INSERT INTO participation(session_id, student_id, interruptions, contribution_rating, contribution_note)
      VALUES(?,?,?,?,?)
      ON CONFLICT(session_id, student_id) DO UPDATE SET
        contribution_rating = excluded.contribution_rating
    `).run(session_id, student_id, 0, 0, '');
  }

  res.json(db.prepare('SELECT * FROM attendance WHERE session_id=? AND student_id=?').get(session_id, student_id));
});

// GET /api/attendance/summary?class_id=X  — per-student summary across all sessions
router.get('/summary', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  // Past sessions only (no date or date on/before today, Pacific). Missing attendance rows count as absent (UI default).
  const todayPt = pacificTodayYmd();
  const rows = db.prepare(`
    SELECT
      s.id            AS student_id,
      s.name,
      s.sortable_name,
      COUNT(ses.id)   AS recorded,
      SUM(CASE WHEN COALESCE(a.status, 'absent') = 'present' THEN 1 ELSE 0 END)  AS present,
      SUM(CASE WHEN COALESCE(a.status, 'absent') = 'late'    THEN 1 ELSE 0 END)  AS late,
      SUM(CASE WHEN COALESCE(a.status, 'absent') = 'absent'  THEN 1 ELSE 0 END)  AS absent,
      SUM(CASE WHEN COALESCE(a.status, 'absent') = 'excused' THEN 1 ELSE 0 END)  AS excused
    FROM students s
    LEFT JOIN sessions ses ON ses.class_id = s.class_id
      AND (ses.date IS NULL OR date(ses.date) IS NULL OR date(ses.date) <= ?)
    LEFT JOIN attendance a ON a.session_id = ses.id AND a.student_id = s.id
    WHERE s.class_id = ? AND s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.sortable_name
  `).all(todayPt, class_id);
  res.json(rows);
});

module.exports = router;
