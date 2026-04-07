const express = require('express');
const db = require('../db');
const { pacificTodayYmd } = require('../pacificDate');
const { appendLog } = require('../logger');
const router = express.Router();

// GET /api/participation?session_id=X
router.get('/', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  res.json(db.prepare('SELECT * FROM participation WHERE session_id=?').all(session_id));
});

// PUT /api/participation  — upsert one record
router.put('/', (req, res) => {
  const { session_id, student_id, interruptions, contribution_rating, contribution_note } = req.body;
  const attendance = db
    .prepare('SELECT status FROM attendance WHERE session_id=? AND student_id=?')
    .get(session_id, student_id);

  let sanitizedRating = contribution_rating;
  if (attendance?.status === 'absent') {
    sanitizedRating = 0;
  } else if (sanitizedRating === null || sanitizedRating === undefined) {
    sanitizedRating = 0;
  } else {
    sanitizedRating = Number(sanitizedRating);
    if (!Number.isInteger(sanitizedRating) || sanitizedRating < 0 || sanitizedRating > 3) {
      return res.status(400).json({ error: 'contribution_rating must be an integer from 0 to 3' });
    }
  }

  const before = db.prepare('SELECT interruptions, contribution_rating, contribution_note FROM participation WHERE session_id=? AND student_id=?').get(session_id, student_id);

  db.prepare(`
    INSERT INTO participation(session_id, student_id, interruptions, contribution_rating, contribution_note)
    VALUES(?,?,?,?,?)
    ON CONFLICT(session_id, student_id) DO UPDATE SET
      interruptions       = excluded.interruptions,
      contribution_rating = excluded.contribution_rating,
      contribution_note   = excluded.contribution_note
  `).run(session_id, student_id, interruptions ?? 0, sanitizedRating, contribution_note ?? '');

  appendLog({
    type: 'participation',
    session_id,
    student_id,
    before: before ?? null,
    after: { interruptions: interruptions ?? 0, contribution_rating: sanitizedRating, contribution_note: contribution_note ?? '' },
  });

  res.json(
    db.prepare('SELECT * FROM participation WHERE session_id=? AND student_id=?').get(session_id, student_id)
  );
});

// GET /api/participation/summary?class_id=X
router.get('/summary', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  const todayPt = pacificTodayYmd();
  const rows = db.prepare(`
    SELECT
      s.id                        AS student_id,
      s.name,
      s.sortable_name,
      COALESCE(SUM(p.interruptions), 0)                            AS total_interruptions,
      ROUND(AVG(CASE WHEN p.contribution_rating IS NOT NULL
                     THEN p.contribution_rating END), 2)           AS avg_contribution
    FROM students s
    LEFT JOIN sessions ses ON ses.class_id = s.class_id
      AND (ses.date IS NULL OR date(ses.date) IS NULL OR date(ses.date) <= ?)
    LEFT JOIN participation p ON p.session_id = ses.id AND p.student_id = s.id
    WHERE s.class_id = ?
    GROUP BY s.id
    ORDER BY s.sortable_name
  `).all(todayPt, class_id);
  res.json(rows);
});

module.exports = router;
