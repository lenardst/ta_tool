const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../db');

const router = express.Router();

function getTransport(smtpPass) {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === '1' ||
    process.env.SMTP_SECURE === 'true' ||
    port === 465;
  const pass = smtpPass || process.env.SMTP_PASS || '';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass }
      : undefined,
  });
}

function personalize(template, { name, sortable_name }) {
  const parts = String(sortable_name || '').split(',');
  const lastName = parts[0]?.trim() || name;
  const firstName = parts[1]?.trim() || name;
  return String(template ?? '')
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{last_name\}\}/g, lastName);
}

// GET /api/email/status
router.get('/status', (_req, res) => {
  res.json({
    smtp_configured: Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM),
  });
});

// POST /api/email/send  { class_id, student_ids, subject, body }
router.post('/send', async (req, res, next) => {
  try {
    const smtpPass = typeof req.body.smtp_pass === 'string' ? req.body.smtp_pass : undefined;
    const transport = getTransport(smtpPass);
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    if (!transport || !from) {
      return res.status(503).json({
        error:
          'Email is not configured. Set SMTP_HOST, EMAIL_FROM, and usually SMTP_PORT / SMTP_USER / SMTP_PASS in backend/.env',
      });
    }

    const classId = Number(req.body.class_id);
    const { subject, body } = req.body;
    const studentIds = Array.isArray(req.body.student_ids)
      ? req.body.student_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n))
      : [];

    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ error: 'class_id required' });
    }
    if (!studentIds.length) {
      return res.status(400).json({ error: 'student_ids must be a non-empty array' });
    }
    if (typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'subject required' });
    }
    if (typeof body !== 'string') {
      return res.status(400).json({ error: 'body required' });
    }

    const cls = db.prepare('SELECT id FROM classes WHERE id=?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const getStudent = db.prepare('SELECT id, name, email FROM students WHERE id=? AND class_id=?');
    const sent = [];
    const failed = [];

    for (const sid of studentIds) {
      const row = getStudent.get(sid, classId);
      if (!row) {
        failed.push({ student_id: sid, error: 'not found in class' });
        continue;
      }
      const addr = String(row.email || '').trim();
      if (!addr) {
        failed.push({ student_id: sid, error: 'no email on file' });
        continue;
      }
      try {
        await transport.sendMail({
          from,
          to: addr,
          subject: personalize(subject.trim(), row),
          text: personalize(body, row),
        });
        sent.push(sid);
      } catch (err) {
        failed.push({ student_id: sid, error: err.message || 'send failed' });
      }
    }

    const selfEmail = typeof req.body.self_email === 'string' ? req.body.self_email.trim() : '';
    let selfSent = false;
    let selfError = null;
    if (selfEmail) {
      try {
        await transport.sendMail({
          from,
          to: selfEmail,
          subject: `[TEST] ${subject.trim()}`,
          text: `(Test copy — name tags replaced with placeholders below.)\n\n${personalize(body, { name: '[name]', sortable_name: '[Last], [First]' })}`,
        });
        selfSent = true;
      } catch (err) {
        selfError = err.message || 'send failed';
      }
    }

    // Log the batch (only successfully sent students)
    if (sent.length > 0) {
      const sentStudents = sent.map((sid) => {
        const row = db.prepare('SELECT id, name, email FROM students WHERE id=?').get(sid);
        return { student_id: sid, name: row?.name ?? '', email: row?.email ?? '' };
      });
      db.prepare(
        `INSERT INTO email_log(sent_at, class_id, subject, body, recipients, self_copy)
         VALUES(?, ?, ?, ?, ?, ?)`
      ).run(
        new Date().toISOString(),
        classId,
        subject.trim(),
        body,
        JSON.stringify(sentStudents),
        selfSent ? 1 : 0,
      );
    }

    res.json({ sent, failed, self: selfEmail ? { sent: selfSent, error: selfError } : undefined });
  } catch (err) {
    next(err);
  }
});

// GET /api/email/history?class_id=X
router.get('/history', (req, res) => {
  const classId = Number(req.query.class_id);
  const rows = Number.isInteger(classId) && classId > 0
    ? db.prepare('SELECT * FROM email_log WHERE class_id=? ORDER BY sent_at DESC').all(classId)
    : db.prepare('SELECT * FROM email_log ORDER BY sent_at DESC').all();
  res.json(rows.map((r) => ({ ...r, recipients: JSON.parse(r.recipients) })));
});

module.exports = router;
