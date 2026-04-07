const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'ta_tool.db');
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || process.env.EMAIL_FROM;

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host || !BACKUP_EMAIL) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true' || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
}

async function sendBackup() {
  const transport = getTransport();
  if (!transport) {
    console.warn('[backup] SMTP not configured — skipping backup email');
    return;
  }

  if (!fs.existsSync(DB_PATH)) {
    console.warn('[backup] Database file not found at', DB_PATH);
    return;
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `ta_tool_backup_${dateStr}.db`;

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: BACKUP_EMAIL,
      subject: `TA Tool — daily backup ${dateStr}`,
      text: `Automated daily backup of the TA Tool database.\n\nDate: ${dateStr}\nSize: ${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB\n\nTo restore: replace the database file on the server with this attachment.`,
      attachments: [{ filename, path: DB_PATH }],
    });
    console.log(`[backup] Sent backup to ${BACKUP_EMAIL} (${filename})`);
  } catch (err) {
    console.error('[backup] Failed to send backup email:', err.message);
  }
}

function scheduleBackups() {
  // Run daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', () => {
    console.log('[backup] Running scheduled backup...');
    sendBackup();
  });
  console.log('[backup] Daily backup scheduled at 03:00 UTC');
}

module.exports = { scheduleBackups, sendBackup };
