const Database = require('better-sqlite3');
const db = new Database('./uni_booker.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    password TEXT,
    role TEXT,
    invite_token TEXT
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER,
    date TEXT,
    time TEXT,
    type TEXT DEFAULT 'office_hours',
    active INTEGER DEFAULT 1,
    invite_token TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    slot_id INTEGER,
    message TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS pinned_profs (
    student_id INTEGER,
    owner_id INTEGER,
    PRIMARY KEY (student_id, owner_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_unique ON bookings(slot_id);
`);

const hasColumn = (table, col) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === col);

if (!hasColumn('users', 'invite_token')) db.exec('ALTER TABLE users ADD COLUMN invite_token TEXT');
if (!hasColumn('slots', 'created_at')) db.exec('ALTER TABLE slots ADD COLUMN created_at TEXT');
if (!hasColumn('bookings', 'created_at')) db.exec('ALTER TABLE bookings ADD COLUMN created_at TEXT');

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('prof@mcgill.ca', '123', 'owner');
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('student@mail.mcgill.ca', '123', 'student');
  console.log('Seed users created: prof@mcgill.ca, student@mail.mcgill.ca (password: 123)');
}

module.exports = db;
