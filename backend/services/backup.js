const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'ta_tool.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 14;

async function saveBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.warn('[backup] Database file not found at', DB_PATH);
    return null;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ta_tool_backup_${dateStr}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  fs.copyFileSync(DB_PATH, destPath);
  console.log(`[backup] Saved backup: ${filename} (${(fs.statSync(destPath).size / 1024).toFixed(1)} KB)`);

  // Prune old backups, keep last MAX_BACKUPS
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('ta_tool_backup_') && f.endsWith('.db'))
    .sort();

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[backup] Pruned old backup: ${f}`);
    }
  }

  return filename;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('ta_tool_backup_') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map(filename => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      return { filename, size: stat.size, created_at: stat.mtime.toISOString() };
    });
}

function getBackupPath(filename) {
  // Sanitize filename to prevent path traversal
  const safe = path.basename(filename);
  if (!safe.startsWith('ta_tool_backup_') || !safe.endsWith('.db')) return null;
  const filePath = path.join(BACKUP_DIR, safe);
  return fs.existsSync(filePath) ? filePath : null;
}

function scheduleBackups() {
  // Run daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', () => {
    console.log('[backup] Running scheduled backup...');
    saveBackup();
  });
  console.log('[backup] Daily backup scheduled at 03:00 UTC');
}

module.exports = { scheduleBackups, saveBackup, listBackups, getBackupPath };
