//Zheng Ye, Dean Barry

const Database = require("better-sqlite3");
const crypto = require("crypto");
const db = new Database("./uni_booker.db");
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${key}`;
};

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
    group_title TEXT,
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
    voter_id INTEGER,
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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_student_unique ON bookings(slot_id, student_id);
`);

const hasColumn = (table, col) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((r) => r.name === col);

if (!hasColumn("users", "invite_token")) db.exec("ALTER TABLE users ADD COLUMN invite_token TEXT");
if (!hasColumn("slots", "created_at")) db.exec("ALTER TABLE slots ADD COLUMN created_at TEXT");
if (!hasColumn("slots", "group_title")) db.exec("ALTER TABLE slots ADD COLUMN group_title TEXT");
if (!hasColumn("bookings", "created_at")) db.exec("ALTER TABLE bookings ADD COLUMN created_at TEXT");
if (!hasColumn("group_poll_votes", "voter_id")) db.exec("ALTER TABLE group_poll_votes ADD COLUMN voter_id INTEGER");

const hasIndex = (name) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
if (hasIndex("idx_bookings_slot_unique")) db.exec("DROP INDEX idx_bookings_slot_unique");
if (!hasIndex("idx_bookings_slot_student_unique")) {
  db.exec("CREATE UNIQUE INDEX idx_bookings_slot_student_unique ON bookings(slot_id, student_id)");
}

const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
if (userCount === 0) {
  db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run("prof@mcgill.ca", hashPassword("123"), "owner");
  db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run("student@mail.mcgill.ca", hashPassword("123"), "student");
  console.log("Seed users created: prof@mcgill.ca, student@mail.mcgill.ca (password: 123)");
}

module.exports = db;
