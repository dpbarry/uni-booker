const Database = require("better-sqlite3");
const db = new Database("./uni_booker.db");

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
    type TEXT DEFAULT 'onetime',
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

  CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'pending',
  student_id INTEGER,
  owner_id INTEGER,
  created_at TEXT,
  message TEXT,
  date TEXT,
  time TEXT
  );

  CREATE TABLE IF NOT EXISTS group_polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_poll_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES group_polls(id)
  );

  CREATE TABLE IF NOT EXISTS group_poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_slot_id INTEGER NOT NULL,
    voter_email TEXT NOT NULL,
    UNIQUE(poll_slot_id, voter_email),
    FOREIGN KEY (poll_slot_id) REFERENCES group_poll_slots(id)
  );

  CREATE TABLE IF NOT EXISTS group_poll_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    FOREIGN KEY (poll_id) REFERENCES group_polls(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_unique ON bookings(slot_id);
`);

const hasColumn = (table, col) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((r) => r.name === col);

if (!hasColumn("users", "invite_token")) db.exec("ALTER TABLE users ADD COLUMN invite_token TEXT");
if (!hasColumn("slots", "created_at")) db.exec("ALTER TABLE slots ADD COLUMN created_at TEXT");
if (!hasColumn("bookings", "created_at")) db.exec("ALTER TABLE bookings ADD COLUMN created_at TEXT");

const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
if (userCount === 0) {
  db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run("prof@mcgill.ca", "123", "owner");
  db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run("student@mail.mcgill.ca", "123", "student");
  console.log("Seed users created: prof@mcgill.ca, student@mail.mcgill.ca (password: 123)");
}

module.exports = db;
