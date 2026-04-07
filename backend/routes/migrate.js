/**
 * One-time migration endpoint. Protected by MIGRATE_SECRET env var.
 * Remove this file once migration is complete.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

router.post('/', (req, res) => {
  const secret = process.env.MIGRATE_SECRET;
  if (!secret || req.headers['x-migrate-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { classes, students, sessions, attendance, participation, adminUserId } = req.body;

  try {
    const migrate = db.transaction(() => {
      // Classes — insert with original IDs
      for (const c of classes) {
        db.prepare(`
          INSERT OR IGNORE INTO classes(id, canvas_course_id, name, canvas_base_url, canvas_section_id, canvas_section_name)
          VALUES(@id, @canvas_course_id, @name, @canvas_base_url, @canvas_section_id, @canvas_section_name)
        `).run(c);
        // Make adminUserId the class admin
        db.prepare("INSERT OR IGNORE INTO class_members(class_id, user_id, role) VALUES(?,?,'admin')")
          .run(c.id, adminUserId);
      }

      // Students
      for (const s of students) {
        db.prepare(`
          INSERT OR IGNORE INTO students(id, class_id, canvas_user_id, name, email, sortable_name)
          VALUES(@id, @class_id, @canvas_user_id, @name, @email, @sortable_name)
        `).run(s);
      }

      // Sessions
      for (const s of sessions) {
        db.prepare(`
          INSERT OR IGNORE INTO sessions(id, class_id, session_number, date, label, notes)
          VALUES(@id, @class_id, @session_number, @date, @label, @notes)
        `).run(s);
      }

      // Attendance
      for (const a of attendance) {
        db.prepare(`
          INSERT OR IGNORE INTO attendance(id, session_id, student_id, status)
          VALUES(@id, @session_id, @student_id, @status)
        `).run(a);
      }

      // Participation
      for (const p of participation) {
        db.prepare(`
          INSERT OR IGNORE INTO participation(id, session_id, student_id, interruptions, contribution_rating, contribution_note)
          VALUES(@id, @session_id, @student_id, @interruptions, @contribution_rating, @contribution_note)
        `).run(p);
      }
    });

    migrate();

    res.json({
      ok: true,
      inserted: {
        classes: classes.length,
        students: students.length,
        sessions: sessions.length,
        attendance: attendance.length,
        participation: participation.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
