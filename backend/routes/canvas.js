const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const router = express.Router();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function canvasFetchAll(path, settings) {
  const { canvas_base_url, canvas_token } = settings;
  if (!canvas_base_url || !canvas_token) {
    throw Object.assign(new Error('Canvas base URL and token not configured'), { status: 400 });
  }
  const base = canvas_base_url.replace(/\/$/, '');
  let url = `${base}/api/v1${path}`;
  const results = [];
  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${canvas_token}` },
    });
    if (!resp.ok) {
      throw Object.assign(
        new Error(`Canvas API error: ${resp.status} ${resp.statusText}`),
        { status: resp.status },
      );
    }
    const data = await resp.json();
    results.push(...data);
    const link = resp.headers.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}

// GET /api/canvas/courses
router.get('/courses', async (req, res, next) => {
  try {
    const settings = getSettings();
    const courses = await canvasFetchAll('/courses?enrollment_state=active&per_page=100', settings);
    res.json(courses);
  } catch (err) {
    next(err);
  }
});

// GET /api/canvas/courses/:id/sections
router.get('/courses/:id/sections', async (req, res, next) => {
  try {
    const settings = getSettings();
    const sections = await canvasFetchAll(
      `/courses/${req.params.id}/sections?per_page=100`,
      settings,
    );
    res.json(sections);
  } catch (err) {
    next(err);
  }
});

// GET /api/canvas/courses/:id/students[?section_id=X]
router.get('/courses/:id/students', async (req, res, next) => {
  try {
    const settings = getSettings();
    const { section_id } = req.query;

    let students;
    if (section_id) {
      // Use the section-specific enrollments endpoint (the course-level endpoint
      // does not reliably support section_id filtering and returns 500 on some instances)
      const enrollments = await canvasFetchAll(
        `/sections/${section_id}/enrollments?type[]=StudentEnrollment&state[]=active&include[]=email&per_page=100`,
        settings,
      );
      // Normalize enrollment objects → plain user objects, deduplicate
      const seen = new Set();
      students = [];
      for (const e of enrollments) {
        if (!e.user || seen.has(e.user.id)) continue;
        seen.add(e.user.id);
        students.push({
          id: e.user.id,
          name: e.user.name,
          sortable_name: e.user.sortable_name || e.user.name,
          email: e.user.email || '',
          login_id: e.user.login_id || '',
        });
      }
    } else {
      students = await canvasFetchAll(
        `/courses/${req.params.id}/users?enrollment_type[]=student&include[]=email&per_page=100`,
        settings,
      );
    }

    res.json(students);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
