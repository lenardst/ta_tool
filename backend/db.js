/**
 * Wraps sql.js (pure-JS WASM SQLite) with a better-sqlite3-compatible
 * synchronous API so every route works without changes.
 *
 * Initialization is async (WASM load), so call db.initDb() once at startup
 * and await it before listening. All subsequent db.prepare().xyz() calls are
 * synchronous.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'ta_tool.db');

/** @type {import('sql.js').Database | null} */
let _sqlDb = null;
let _inTransaction = false;

// ─── Persistence ──────────────────────────────────────────────────────────────

function save() {
  if (!_sqlDb || _inTransaction) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Named-param transformation ───────────────────────────────────────────────
// better-sqlite3: stmt.run({ class_id: 1 })  uses @class_id in SQL
// sql.js:         stmt.bind({ '@class_id': 1 })  needs the @ prefix

function toSqlJsParams(params) {
  if (!params || params.length === 0) return null;
  const first = params[0];
  if (
    params.length === 1 &&
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first)
  ) {
    // Named-params object — add @ prefix to each key if not already prefixed
    const out = {};
    for (const [k, v] of Object.entries(first)) {
      out[/^[@:$]/.test(k) ? k : `@${k}`] = v;
    }
    return out;
  }
  // Positional params
  return params;
}

// ─── Statement wrapper ────────────────────────────────────────────────────────

class Stmt {
  constructor(sql) {
    this._sql = sql;
  }

  _fetchRows(params) {
    if (!_sqlDb) throw new Error('DB not initialised — call db.initDb() first');
    const stmt = _sqlDb.prepare(this._sql);
    const bound = toSqlJsParams(params);
    if (bound) stmt.bind(bound);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /** Returns all matching rows as plain objects. */
  all(...params) {
    return this._fetchRows(params);
  }

  /** Returns the first matching row or undefined. */
  get(...params) {
    return this._fetchRows(params)[0];
  }

  /**
   * Executes a write statement.
   * Returns { lastInsertRowid } matching better-sqlite3.
   */
  run(...params) {
    if (!_sqlDb) throw new Error('DB not initialised — call db.initDb() first');
    const stmt = _sqlDb.prepare(this._sql);
    const bound = toSqlJsParams(params);
    if (bound) stmt.bind(bound);
    stmt.step();
    stmt.free();
    const rowid = _sqlDb.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0;
    save();
    return { lastInsertRowid: rowid };
  }
}

// ─── Database wrapper (mimics better-sqlite3 db object) ───────────────────────

const db = {
  /** Create a prepared statement. */
  prepare(sql) {
    return new Stmt(sql);
  },

  /** Run raw SQL (used for DDL / multi-statement schema). */
  exec(sql) {
    if (!_sqlDb) throw new Error('DB not initialised');
    _sqlDb.exec(sql);
    save();
  },

  /** Run a PRAGMA. */
  pragma(str) {
    if (!_sqlDb) throw new Error('DB not initialised');
    _sqlDb.run(`PRAGMA ${str}`);
  },

  /**
   * Wraps a function in a SQLite transaction.
   * Returns a new function; call it with the same args as fn.
   */
  transaction(fn) {
    return (...args) => {
      if (!_sqlDb) throw new Error('DB not initialised');
      _inTransaction = true;
      _sqlDb.run('BEGIN');
      try {
        const result = fn(...args);
        _sqlDb.run('COMMIT');
        _inTransaction = false;
        save();
        return result;
      } catch (err) {
        _sqlDb.run('ROLLBACK');
        _inTransaction = false;
        throw err;
      }
    };
  },

  // ─── Async initialisation (call once in server.js) ──────────────────────────

  async initDb() {
    const SQL = await initSqlJs({
      // Tell WASM loader where to find the .wasm file inside node_modules
      locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
    });

    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      _sqlDb = new SQL.Database(new Uint8Array(buf));
    } else {
      _sqlDb = new SQL.Database();
    }

    _sqlDb.run('PRAGMA foreign_keys = ON');

    // ── Migrations for existing databases ─────────────────────────────────────
    try { _sqlDb.run('ALTER TABLE classes ADD COLUMN canvas_section_id TEXT'); } catch (_) {}
    try { _sqlDb.run('ALTER TABLE classes ADD COLUMN canvas_section_name TEXT'); } catch (_) {}

    // Migration: add user_id to classes (existing rows get user_id=0, orphaned)
    try { _sqlDb.run('ALTER TABLE classes ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

    // Migration: add is_admin column to users
    try { _sqlDb.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

    // Migration: add role column to class_members ('admin' | 'member')
    try { _sqlDb.run("ALTER TABLE class_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'"); } catch (_) {}

    // Migration: soft deletes on classes
    try { _sqlDb.run('ALTER TABLE classes ADD COLUMN deleted_at TEXT'); } catch (_) {}

    // Migration: set lenard as admin
    try { _sqlDb.run("UPDATE users SET is_admin=1 WHERE username='lenard'"); } catch (_) {}

    // Migration: recreate settings table with per-user composite primary key
    try {
      _sqlDb.exec('SELECT user_id FROM settings LIMIT 0');
      // Column already exists — no migration needed
    } catch (e) {
      const msg = String(e?.message ?? '');
      if (!msg.includes('no such table')) {
        // Table exists but lacks user_id column — recreate it
        _sqlDb.run('ALTER TABLE settings RENAME TO _settings_legacy');
        _sqlDb.run(`
          CREATE TABLE settings (
            user_id INTEGER NOT NULL,
            key     TEXT    NOT NULL,
            value   TEXT    NOT NULL,
            PRIMARY KEY(user_id, key)
          )
        `);
        _sqlDb.run('DROP TABLE IF EXISTS _settings_legacy');
      }
      // If "no such table": table will be created fresh by the exec block below
    }

    _sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS class_members (
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        user_id  INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        role     TEXT    NOT NULL DEFAULT 'member',
        PRIMARY KEY(class_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        user_id INTEGER NOT NULL,
        key     TEXT    NOT NULL,
        value   TEXT    NOT NULL,
        PRIMARY KEY(user_id, key)
      );

      CREATE TABLE IF NOT EXISTS classes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        canvas_course_id    TEXT    NOT NULL,
        name                TEXT    NOT NULL,
        canvas_base_url     TEXT    NOT NULL,
        canvas_section_id   TEXT,
        canvas_section_name TEXT,
        user_id             INTEGER NOT NULL DEFAULT 0,
        deleted_at          TEXT
      );

      CREATE TABLE IF NOT EXISTS students (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id        INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        canvas_user_id  TEXT    NOT NULL,
        name            TEXT    NOT NULL,
        email           TEXT    NOT NULL DEFAULT '',
        sortable_name   TEXT    NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        session_number INTEGER NOT NULL,
        date           TEXT,
        label          TEXT,
        notes          TEXT,
        UNIQUE(class_id, session_number)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        status     TEXT    NOT NULL DEFAULT 'present',
        UNIQUE(session_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS participation (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id          INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        interruptions       INTEGER NOT NULL DEFAULT 0,
        contribution_rating INTEGER,
        contribution_note   TEXT    NOT NULL DEFAULT '',
        UNIQUE(session_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        max_points  REAL    NOT NULL DEFAULT 100,
        description TEXT    NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS grades (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        points        REAL,
        UNIQUE(assignment_id, student_id)
      );
    `);

    // Migration for existing databases created before session notes.
    try { _sqlDb.run('ALTER TABLE sessions ADD COLUMN notes TEXT'); } catch (_) {}

    // Migration: email log table.
    try {
      _sqlDb.run(`
        CREATE TABLE IF NOT EXISTS email_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sent_at    TEXT    NOT NULL,
          class_id   INTEGER NOT NULL,
          subject    TEXT    NOT NULL,
          body       TEXT    NOT NULL,
          recipients TEXT    NOT NULL,
          self_copy  INTEGER NOT NULL DEFAULT 0
        )
      `);
    } catch (_) {}

    // Migration: ensure one student row per (class_id, canvas_user_id).
    // Merge dependent rows onto the kept student id before removing duplicates.
    const dedupeStudents = db.transaction(() => {
      const duplicates = db.prepare(`
        SELECT
          class_id,
          canvas_user_id,
          MIN(id) AS keep_id,
          GROUP_CONCAT(id) AS all_ids
        FROM students
        GROUP BY class_id, canvas_user_id
        HAVING COUNT(*) > 1
      `).all();

      const moveAttendance = db.prepare(`
        INSERT OR IGNORE INTO attendance(session_id, student_id, status)
        SELECT session_id, ?, status
        FROM attendance
        WHERE student_id=?
      `);
      const moveParticipation = db.prepare(`
        INSERT OR IGNORE INTO participation(
          session_id,
          student_id,
          interruptions,
          contribution_rating,
          contribution_note
        )
        SELECT
          session_id,
          ?,
          interruptions,
          contribution_rating,
          contribution_note
        FROM participation
        WHERE student_id=?
      `);
      const moveGrades = db.prepare(`
        INSERT OR IGNORE INTO grades(assignment_id, student_id, points)
        SELECT assignment_id, ?, points
        FROM grades
        WHERE student_id=?
      `);
      const deleteAttendance = db.prepare('DELETE FROM attendance WHERE student_id=?');
      const deleteParticipation = db.prepare('DELETE FROM participation WHERE student_id=?');
      const deleteGrades = db.prepare('DELETE FROM grades WHERE student_id=?');
      const deleteStudent = db.prepare('DELETE FROM students WHERE id=?');

      for (const row of duplicates) {
        const keepId = Number(row.keep_id);
        const allIds = String(row.all_ids ?? '')
          .split(',')
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value !== keepId);

        for (const duplicateId of allIds) {
          moveAttendance.run(keepId, duplicateId);
          moveParticipation.run(keepId, duplicateId);
          moveGrades.run(keepId, duplicateId);

          deleteAttendance.run(duplicateId);
          deleteParticipation.run(duplicateId);
          deleteGrades.run(duplicateId);
          deleteStudent.run(duplicateId);
        }
      }
    });
    dedupeStudents();

    // Enforce idempotent student syncs at the DB level.
    _sqlDb.run(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_class_canvas_user ON students(class_id, canvas_user_id)'
    );

    // Migration: seed class_members for any existing classes/users that aren't yet linked.
    _sqlDb.run(`
      INSERT OR IGNORE INTO class_members(class_id, user_id)
      SELECT c.id, u.id FROM classes c CROSS JOIN users u
    `);

    save();
    return db;
  },
};

module.exports = db;
