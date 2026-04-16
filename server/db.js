const Database = require('better-sqlite3');
const db = new Database('./uni_booker.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    password TEXT,
    role TEXT
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER,
    date TEXT,
    time TEXT,
    type TEXT DEFAULT 'office_hours',
    active INTEGER DEFAULT 1,
    invite_token TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    slot_id INTEGER,
    message TEXT
  );
`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('prof@mcgill.ca', 'pass123', 'owner');
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('student@mcgill.ca', 'pass123', 'student');
  console.log('Seed users created: prof@mcgill.ca, student@mcgill.ca (password: pass123)');
}

module.exports = db;
