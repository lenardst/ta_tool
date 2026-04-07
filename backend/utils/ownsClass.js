const db = require('../db');

/** Returns true if the class exists and belongs to userId. */
function ownsClass(classId, userId) {
  const cls = db.prepare('SELECT id FROM classes WHERE id=? AND user_id=?').get(classId, userId);
  return !!cls;
}

module.exports = ownsClass;
