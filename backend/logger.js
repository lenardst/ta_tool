const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'edits.log');

function appendLog(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_PATH, line, 'utf8');
}

module.exports = { appendLog };
