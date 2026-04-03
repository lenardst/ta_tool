const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { extractSessionsFromText, stripHtml } = require('../services/llm');

const router = express.Router();

// ─── GET /api/sessions?class_id=X ─────────────────────────────────────────────

router.get('/', (req, res) => {
  const { class_id } = req.query;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });
  res.json(
    db.prepare('SELECT * FROM sessions WHERE class_id=? ORDER BY session_number').all(class_id)
  );
});

// ─── POST /api/sessions  (create one session) ─────────────────────────────────

router.post('/', (req, res) => {
  const { class_id, session_number, date, label, notes } = req.body;
  if (!class_id) return res.status(400).json({ error: 'class_id required' });

  // Auto-assign session_number if not provided
  const num = session_number ?? (() => {
    const max = db.prepare('SELECT MAX(session_number) AS m FROM sessions WHERE class_id=?').get(class_id);
    return (max?.m ?? 0) + 1;
  })();

  const info = db.prepare(
    'INSERT OR IGNORE INTO sessions(class_id, session_number, date, label, notes) VALUES(?,?,?,?,?)'
  ).run(class_id, num, date ?? null, label ?? null, notes ?? null);

  const session = db.prepare('SELECT * FROM sessions WHERE class_id=? AND session_number=?').get(class_id, num);
  res.status(info.lastInsertRowid ? 201 : 200).json(session);
});

// ─── POST /api/sessions/extract  (AI extraction from Canvas) ──────────────────
// Must appear BEFORE /:id routes to avoid being matched as a param.

router.post('/extract', async (req, res, next) => {
  try {
    const { class_id } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id required' });

    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    // Load Canvas credentials
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const { canvas_base_url, canvas_token } = settings;
    if (!canvas_base_url || !canvas_token) {
      return res.status(400).json({ error: 'Canvas credentials not configured in Settings' });
    }

    const base = canvas_base_url.replace(/\/$/, '');
    const courseId = cls.canvas_course_id;
    const headers = { Authorization: `Bearer ${canvas_token}` };

    // Fetch modules (with items)
    let modulesText = '';
    try {
      const modResp = await fetch(
        `${base}/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`,
        { headers }
      );
      if (modResp.ok) {
        const modules = await modResp.json();
        if (Array.isArray(modules) && modules.length > 0) {
          modulesText = 'CANVAS MODULES:\n';
          for (const mod of modules) {
            modulesText += `Module: ${mod.name}\n`;
            if (Array.isArray(mod.items)) {
              for (const item of mod.items) {
                modulesText += `  - [${item.type}] ${item.title}\n`;
              }
            }
          }
        }
      }
    } catch (_) { /* non-fatal */ }

    // Fetch syllabus body
    let syllabusText = '';
    try {
      const sylResp = await fetch(
        `${base}/api/v1/courses/${courseId}?include[]=syllabus_body`,
        { headers }
      );
      if (sylResp.ok) {
        const courseData = await sylResp.json();
        if (courseData.syllabus_body) {
          syllabusText = 'SYLLABUS:\n' + stripHtml(courseData.syllabus_body);
        }
      }
    } catch (_) { /* non-fatal */ }

    const combinedText = [modulesText, syllabusText].filter(Boolean).join('\n\n');
    if (!combinedText.trim()) {
      return res.status(422).json({
        error: 'No content found in Canvas modules or syllabus for this course.',
      });
    }

    // Call the LLM
    const extracted = await extractSessionsFromText(combinedText);
    if (!extracted.length) {
      return res.status(422).json({ error: 'LLM could not identify any sessions in the course content.' });
    }

    // Upsert: update label/date for existing session_numbers, insert new ones
    const upsert = db.transaction((sessions) => {
      for (const s of sessions) {
        const existing = db.prepare(
          'SELECT id FROM sessions WHERE class_id=? AND session_number=?'
        ).get(class_id, s.session_number);

        if (existing) {
          db.prepare('UPDATE sessions SET date=?, label=? WHERE id=?')
            .run(s.date, s.title, existing.id);
        } else {
          db.prepare(
            'INSERT INTO sessions(class_id, session_number, date, label) VALUES(?,?,?,?)'
          ).run(class_id, s.session_number, s.date, s.title);
        }
      }
    });
    upsert(extracted);

    const allSessions = db
      .prepare('SELECT * FROM sessions WHERE class_id=? ORDER BY session_number')
      .all(class_id);

    res.json({ sessions: allSessions, extracted_count: extracted.length });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sessions/:id ───────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const body = req.body;
  const parts = [];
  const params = [];

  // Only set fields that are explicitly present in the body (allows clearing to null)
  if ('date' in body)  { parts.push('date=?');  params.push(body.date  ?? null); }
  if ('label' in body) { parts.push('label=?'); params.push(body.label ?? null); }
  if ('notes' in body) { parts.push('notes=?'); params.push(body.notes ?? null); }

  if (parts.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE sessions SET ${parts.join(', ')} WHERE id=?`).run(...params);
  }

  res.json(db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id));
});

// ─── DELETE /api/sessions/:id ──────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
