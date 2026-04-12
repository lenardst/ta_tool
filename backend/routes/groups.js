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

/**
 * Replace template placeholders for one student.
 * Supported tags: {{name}}, {{first_name}}, {{last_name}},
 *                 {{group_number}}, {{date}}, {{role}}, {{group_members}}
 */
function personalize(template, student, groupNumber, { date = '', role = '', groupMembers = '' } = {}) {
  const parts = String(student.sortable_name || '').split(',');
  const lastName = parts[0]?.trim() || student.name;
  const firstName = parts[1]?.trim() || (student.name || '').split(' ')[0] || student.name;
  return String(template ?? '')
    .replace(/\{\{name\}\}/g, student.name)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{last_name\}\}/g, lastName)
    .replace(/\{\{group_number\}\}/g, String(groupNumber))
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{role\}\}/g, role)
    .replace(/\{\{group_members\}\}/g, groupMembers);
}

/** Format a list of names as "Alice", "Alice and Bob", or "Alice, Bob, and Carol". */
function formatNameList(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

// ─── System prompt ────────────────────────────────────────────────────────────
// Compact keys (sid/g/r) keep the output token count minimal.

const SYSTEM_PROMPT = `Randomly assign students to groups per the request (do not go alphabetically).
Return JSON: {"interp":"e.g. 9 triads + 2 observers","assignments":[{"sid":1,"g":1,"r":"Role"}]}
Rules: every student exactly once; g=0 for observers; use only the integer IDs given.`;

const DEFAULT_SUBJECT = 'Group assignment';
const DEFAULT_BODY =
  'Hi {{first_name}},\n\nFor the group exercise in the class on {{date}}, you are assigned to role {{role}}. Your group is {{group_members}}.';

// POST /api/groups/generate
// Body: { class_id, prompt, date?, email_template?: {subject, body}, role_descriptions? }
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

    // Email template (caller-supplied or default)
    const date = String(req.body.date || '').trim();
    const tplInput = req.body.email_template || {};
    const subjectTpl = String(tplInput.subject || DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;
    const bodyTpl = String(tplInput.body || DEFAULT_BODY).trim() || DEFAULT_BODY;

    // Build optional role descriptions block
    const roleDescriptions = Array.isArray(req.body.role_descriptions)
      ? req.body.role_descriptions.filter(
          (r) => r && typeof r.name === 'string' && r.name.trim(),
        )
      : [];

    let roleSection = '';
    if (roleDescriptions.length > 0) {
      const lines = roleDescriptions.map((r) => {
        const desc =
          typeof r.description === 'string' && r.description.trim()
            ? `: ${r.description.trim()}`
            : '';
        const attachNote = r.has_attachment
          ? ' (a document will be attached to this email)'
          : '';
        return `- ${r.name.trim()}${desc}${attachNote}`;
      });
      roleSection = `\nRole descriptions:\n${lines.join('\n')}\n`;
    }

    // Compact student list: "id:Name" (no spaces) saves tokens vs "id: Name"
    const studentList = students.map((s) => `${s.id}:${s.name}`).join('\n');

    const userMessage = `Students:\n${studentList}${roleSection}\nRequest: ${prompt}`;

    const rawResponse = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.9,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      },
    );

    // Extract JSON from LLM response (handles occasional markdown fences)
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

    // Build student lookup map
    const studentMap = new Map(students.map((s) => [s.id, s]));

    // Build group → member names map (for {{group_members}} substitution)
    const groupMembersMap = new Map(); // groupNumber -> string[]
    for (const a of result.assignments) {
      // Accept both compact (g) and verbose (group_number) keys for robustness
      const groupNum = Number(a.g ?? a.group_number) || 0;
      if (groupNum === 0) continue; // observers have no group peers
      const s = studentMap.get(Number(a.sid ?? a.student_id));
      if (!s) continue;
      const list = groupMembersMap.get(groupNum) || [];
      list.push(s.name);
      groupMembersMap.set(groupNum, list);
    }

    // Personalise each assignment using the single shared template
    const enriched = result.assignments
      .filter((a) => studentMap.has(Number(a.sid ?? a.student_id)))
      .map((a) => {
        const s = studentMap.get(Number(a.sid ?? a.student_id));
        const groupNum = Number(a.g ?? a.group_number) || 0;
        const roleName = String(a.r ?? a.role ?? '');

        // group_members = all other names in the same group
        const allGroupNames = groupMembersMap.get(groupNum) || [];
        const otherNames = allGroupNames.filter((name) => name !== s.name);
        const groupMembersStr = formatNameList(otherNames);

        const extra = { date, role: roleName, groupMembers: groupMembersStr };

        return {
          student_id: Number(a.student_id),
          student_name: s.name,
          student_sortable_name: s.sortable_name || '',
          student_email: s.email || '',
          group_number: groupNum,
          role: roleName,
          group_members: groupMembersStr,
          email_subject: personalize(subjectTpl, s, groupNum, extra),
          email_body: personalize(bodyTpl, s, groupNum, extra),
        };
      });

    const assignedIds = new Set(enriched.map((a) => a.student_id));
    const missed = students.filter((s) => !assignedIds.has(s.id));
    if (missed.length > 0) {
      console.warn(
        `Groups generate: LLM missed ${missed.length} student(s): ${missed.map((s) => s.name).join(', ')}`,
      );
    }

    res.json({
      interpretation: String(result.interp ?? result.interpretation ?? ''),
      assignments: enriched,
      missed_students: missed.map((s) => ({ id: s.id, name: s.name })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/send
// Body: { class_id, emails: [{student_id, subject, body, role}], smtp_pass?, role_attachments? }
router.post('/send', async (req, res, next) => {
  try {
    const smtpPass =
      typeof req.body.smtp_pass === 'string' ? req.body.smtp_pass : undefined;
    const transport = getTransport(smtpPass);
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

    if (!transport || !from) {
      return res.status(503).json({
        error: 'Email is not configured. Set SMTP_HOST and EMAIL_FROM in backend/.env',
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

    // Build role → nodemailer attachment map (case-insensitive key)
    const rawAttachments = Array.isArray(req.body.role_attachments)
      ? req.body.role_attachments
      : [];
    const attachmentByRole = new Map();
    for (const att of rawAttachments) {
      if (
        att &&
        typeof att.role === 'string' &&
        typeof att.filename === 'string' &&
        typeof att.content === 'string'
      ) {
        attachmentByRole.set(att.role.toLowerCase().trim(), {
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.content_type || 'application/octet-stream',
        });
      }
    }

    const getStudent = db.prepare(
      'SELECT id, name, email FROM students WHERE id=? AND class_id=?',
    );
    const sent = [];
    const failed = [];

    for (const item of emails) {
      const studentId = Number(item.student_id);
      const subject = String(item.subject || '').trim();
      const body = String(item.body || '');
      const role = String(item.role || '').toLowerCase().trim();

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

      const attachment = attachmentByRole.get(role);

      try {
        await transport.sendMail({
          from,
          to: addr,
          subject,
          text: body,
          attachments: attachment ? [attachment] : undefined,
        });
        sent.push(studentId);
      } catch (err) {
        failed.push({ student_id: studentId, error: err.message || 'send failed' });
      }
    }

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
