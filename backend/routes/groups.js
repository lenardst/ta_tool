const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../db');
const { chatCompletion } = require('../services/llm');

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
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass } : undefined,
  });
}

const SYSTEM_PROMPT = `You are a teaching assistant tool for group management.

Given a class roster and a natural-language grouping request you will:
1. Parse the request to understand: group size, roles, and how to handle remainders (e.g. observers, uneven groups).
2. RANDOMLY assign students to groups and roles. Shuffle the student list before assigning — do not follow alphabetical order.
3. Generate a warm, professional, personalized email for EVERY student that clearly states their group number and role.

Return ONLY a valid JSON object (no markdown fences, no explanation) with this exact structure:
{
  "interpretation": "Short summary of what you did, e.g. '9 triads + 2 observers. Roles: Michael, Phuc, Georg.'",
  "assignments": [
    {
      "student_id": 123,
      "group_number": 1,
      "role": "Michael",
      "email_subject": "Your Group Assignment",
      "email_body": "Hi Alice,\\n\\nYou've been assigned to Group 1 in the role of Michael.\\n\\n..."
    }
  ]
}

Rules:
- Every student must appear in assignments exactly once.
- group_number must be a positive integer; observers can use a special group number (e.g. 0 or 99).
- Roles should match the names in the request exactly.
- Make emails warm and specific: include the group number, the role, any role context from the request.
- Keep email subjects concise (≤ 70 characters).
- Do NOT include meta-commentary or markdown in the JSON values.`;

// POST /api/groups/generate  { class_id, prompt }
router.post('/generate', async (req, res, next) => {
  try {
    const classId = Number(req.body.class_id);
    const prompt = String(req.body.prompt || '').trim();

    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ error: 'class_id required' });
    }
    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const students = db
      .prepare(
        'SELECT id, name, sortable_name, email FROM students WHERE class_id=? AND deleted_at IS NULL ORDER BY sortable_name',
      )
      .all(classId);

    if (students.length === 0) {
      return res.status(400).json({ error: 'No students in class' });
    }

    const studentList = students.map((s) => `${s.id}: ${s.name}`).join('\n');

    const userMessage = `Class: ${cls.name}
Students (${students.length} total):
${studentList}

Request: ${prompt}`;

    const rawResponse = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.9 },
    );

    // Extract JSON object from LLM response (handles occasional markdown fences)
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `LLM did not return valid JSON. Raw response: ${rawResponse.slice(0, 400)}`,
      );
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(result.assignments)) {
      throw new Error('LLM response missing assignments array');
    }

    // Build lookup map
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const enriched = result.assignments
      .filter((a) => studentMap.has(Number(a.student_id)))
      .map((a) => {
        const s = studentMap.get(Number(a.student_id));
        return {
          student_id: Number(a.student_id),
          student_name: s.name,
          student_email: s.email || '',
          group_number: Number(a.group_number) || 0,
          role: String(a.role || ''),
          email_subject: String(a.email_subject || '').trim(),
          email_body: String(a.email_body || ''),
        };
      });

    // Warn if any students were missed by the LLM
    const assignedIds = new Set(enriched.map((a) => a.student_id));
    const missed = students.filter((s) => !assignedIds.has(s.id));
    if (missed.length > 0) {
      console.warn(
        `Groups generate: LLM missed ${missed.length} student(s): ${missed.map((s) => s.name).join(', ')}`,
      );
    }

    res.json({
      interpretation: String(result.interpretation || ''),
      assignments: enriched,
      missed_students: missed.map((s) => ({ id: s.id, name: s.name })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/send  { class_id, emails: [{student_id, subject, body}], smtp_pass? }
router.post('/send', async (req, res, next) => {
  try {
    const smtpPass =
      typeof req.body.smtp_pass === 'string' ? req.body.smtp_pass : undefined;
    const transport = getTransport(smtpPass);
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

    if (!transport || !from) {
      return res.status(503).json({
        error:
          'Email is not configured. Set SMTP_HOST and EMAIL_FROM in backend/.env',
      });
    }

    const classId = Number(req.body.class_id);
    const emails = Array.isArray(req.body.emails) ? req.body.emails : [];

    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ error: 'class_id required' });
    }
    if (!emails.length) {
      return res.status(400).json({ error: 'emails must be a non-empty array' });
    }

    const cls = db.prepare('SELECT id FROM classes WHERE id=?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const getStudent = db.prepare(
      'SELECT id, name, email FROM students WHERE id=? AND class_id=?',
    );
    const sent = [];
    const failed = [];

    for (const item of emails) {
      const studentId = Number(item.student_id);
      const subject = String(item.subject || '').trim();
      const body = String(item.body || '');

      if (!Number.isInteger(studentId) || studentId < 1 || !subject) {
        failed.push({ student_id: studentId, error: 'invalid item' });
        continue;
      }

      const row = getStudent.get(studentId, classId);
      if (!row) {
        failed.push({ student_id: studentId, error: 'student not found in class' });
        continue;
      }

      const addr = String(row.email || '').trim();
      if (!addr) {
        failed.push({ student_id: studentId, error: 'no email on file' });
        continue;
      }

      try {
        await transport.sendMail({ from, to: addr, subject, text: body });
        sent.push(studentId);
      } catch (err) {
        failed.push({ student_id: studentId, error: err.message || 'send failed' });
      }
    }

    // Log the batch
    if (sent.length > 0) {
      const sentStudents = sent.map((sid) => {
        const row = db
          .prepare('SELECT id, name, email FROM students WHERE id=?')
          .get(sid);
        return { student_id: sid, name: row?.name ?? '', email: row?.email ?? '' };
      });
      db.prepare(
        `INSERT INTO email_log(sent_at, class_id, subject, body, recipients, self_copy)
         VALUES(?, ?, ?, ?, ?, ?)`,
      ).run(
        new Date().toISOString(),
        classId,
        '[Group assignment — individual emails]',
        '[Group assignment — individual bodies per student]',
        JSON.stringify(sentStudents),
        0,
      );
    }

    res.json({ sent, failed });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
