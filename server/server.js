const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.static(path.join(__dirname, '..')));
app.use(express.json());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.password !== password) return res.status(401).json({ error: 'Incorrect password' });

  const { password: _, ...safe } = user;
  res.json(safe);
});

app.post('/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email format' });

  const lEmail = email.toLowerCase();
  if (!lEmail.endsWith('@mcgill.ca') && !lEmail.endsWith('@mail.mcgill.ca')) {
    return res.status(400).json({ error: 'Use McGill email' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const role = email.toLowerCase().endsWith('@mcgill.ca') && !email.toLowerCase().endsWith('@mail.mcgill.ca')
    ? 'owner'
    : 'student';

  const result = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(email, password, role);
  res.json({ id: result.lastInsertRowid, email, role });
});

app.post('/slots/create', (req, res) => {
  const { owner_id, date, time, type, invite_token } = req.body;
  if (!owner_id || !date || !time) return res.status(400).json({ error: 'Missing fields' });

  const result = db.prepare(
    'INSERT INTO slots (owner_id, date, time, type, active, invite_token) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(owner_id, date, time, type ?? 'office_hours', invite_token ?? null);

  res.json({ id: result.lastInsertRowid });
});

app.get('/slots', (req, res) => {
  res.json(db.prepare('SELECT * FROM slots').all());
});

app.get('/slots/active', (req, res) => {
  res.json(db.prepare('SELECT * FROM slots WHERE active = 1').all());
});

app.get('/slots/owner/:ownerId', (req, res) => {
  res.json(db.prepare('SELECT * FROM slots WHERE owner_id = ?').all(req.params.ownerId));
});

app.put('/slots/:id/toggle', (req, res) => {
  db.prepare('UPDATE slots SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  res.json({ message: 'Slot toggled' });
});

app.delete('/slots/:id', (req, res) => {
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  res.json({ message: 'Slot deleted' });
});

app.post('/bookings', (req, res) => {
  const { student_id, slot_id, message } = req.body;
  const result = db.prepare('INSERT INTO bookings (student_id, slot_id, message) VALUES (?, ?, ?)').run(student_id, slot_id, message ?? null);
  res.json({ id: result.lastInsertRowid });
});

app.get('/bookings/slot/:slotId', (req, res) => {
  res.json(db.prepare('SELECT * FROM bookings WHERE slot_id = ?').all(req.params.slotId));
});

app.get('/bookings/student/:studentId', (req, res) => {
  res.json(db.prepare('SELECT * FROM bookings WHERE student_id = ?').all(req.params.studentId));
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
