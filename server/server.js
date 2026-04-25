const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const mail = require("./mail");

const app = express();
app.use(express.static(path.join(__dirname, "..")));
app.use(express.json());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nowIso = () => new Date().toISOString();
const isPast = (date, time) => {
  const when = new Date(`${date}T${time}`);
  return Number.isNaN(when.getTime()) || when.getTime() < Date.now();
};
const expiredSlotWhere = "datetime(date || ' ' || substr(time, 1, 5)) < datetime('now', 'localtime')";

const cleanupExpired = db.transaction(() => {
  const bookingsDeleted = db
    .prepare(
      `
    DELETE FROM bookings
    WHERE slot_id IN (
      SELECT id
      FROM slots
      WHERE ${expiredSlotWhere}
    )
  `,
    )
    .run().changes;
  const slotsDeleted = db.prepare(`DELETE FROM slots WHERE ${expiredSlotWhere}`).run().changes;
  return { bookingsDeleted, slotsDeleted };
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.password !== password) return res.status(401).json({ error: "Incorrect password" });

  const { password: _p, invite_token: _t, ...safe } = user;
  res.json(safe);
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "All fields required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });

  const lEmail = email.toLowerCase();
  if (!lEmail.endsWith("@mcgill.ca") && !lEmail.endsWith("@mail.mcgill.ca")) {
    return res.status(400).json({ error: "Use McGill email" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const role = lEmail.endsWith("@mcgill.ca") && !lEmail.endsWith("@mail.mcgill.ca") ? "owner" : "student";

  const result = db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run(email, password, role);
  res.json({ id: result.lastInsertRowid, email, role });
});

app.get("/owners", (_req, res) => {
  res.json(
    db
      .prepare(
        `
      SELECT id, email
      FROM users
      WHERE role = 'owner'
        AND EXISTS (
          SELECT 1
          FROM slots s
          WHERE s.owner_id = users.id
            AND s.active = 1
            AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
        )
      ORDER BY email
    `,
      )
      .all(),
  );
});

app.post("/owners/:id/invite-token", (req, res) => {
  const owner = db.prepare("SELECT id, invite_token FROM users WHERE id = ? AND role = 'owner'").get(req.params.id);
  if (!owner) return res.status(404).json({ error: "Owner not found" });
  let token = owner.invite_token;
  if (!token) {
    token = crypto.randomBytes(16).toString("base64url");
    db.prepare("UPDATE users SET invite_token = ? WHERE id = ?").run(token, owner.id);
  }
  res.json({ token });
});

app.get("/invite/:token", (req, res) => {
  const owner = db.prepare("SELECT id, email FROM users WHERE invite_token = ? AND role = 'owner'").get(req.params.token);
  if (!owner) return res.status(404).json({ error: "Invite link not found" });
  const viewerId = Number(req.query.viewer) || 0;
  const slots = db
    .prepare(
      `
    SELECT s.id, s.date, s.time, s.active,
           b.id AS booking_id, b.student_id AS booker_id
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE s.owner_id = ?
      AND s.active = 1
      AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
      AND (b.id IS NULL OR b.student_id = ?)
    ORDER BY s.date ASC, s.time ASC
  `,
    )
    .all(owner.id, viewerId);
  res.json({ owner, slots });
});

app.post("/slots/create", (req, res) => {
  const { owner_id, date, time, type } = req.body;
  if (!owner_id || !date || !time) return res.status(400).json({ error: "Missing fields" });
  if (isPast(date, time)) return res.status(400).json({ error: "Cannot create a slot in the past" });

  const result = db
    .prepare("INSERT INTO slots (owner_id, date, time, type, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
    .run(owner_id, date, time, type ?? "onetime", nowIso());

  res.json({ id: result.lastInsertRowid });
});

app.post("/slots/recurring", (req, res) => {
  const { owner_id, days, time, start_date, weeks } = req.body;

  if (!owner_id || !Array.isArray(days) || !days.length || !time || !start_date || !weeks)
    return res.status(400).json({ error: "Missing fields" });

  if (weeks < 1 || weeks > 52)
    return res.status(400).json({ error: "Invalid Number of Weeks selected" });

  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    return res.status(400).json({ error: "days must be integers 0–6 (Sun=0 … Sat=6)" });

  const pad = (n) => String(n).padStart(2, "0");
  const toYmd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const [sy, sm, sd] = start_date.split("-").map(Number);
  const anchorDate = new Date(sy, sm - 1, sd);

  const insertSlot = db.prepare("INSERT INTO slots (owner_id, date, time, type, active, created_at) VALUES (?, ?, ?, 'recurring', 1, ?)");

  const insertMany = db.transaction(() => {
    const slots = [];

    const anchorDay = anchorDate.getDay();
    for (let week = 0; week < weeks; week++) {
      for (let day of days) {
        const daysOffset = week * 7 + (day - anchorDay);
        const slotDate = new Date(anchorDate);
        slotDate.setDate(slotDate.getDate() + daysOffset);

        const dateStr = toYmd(slotDate);
        if (!isPast(dateStr, time)) {
          const result = insertSlot.run(owner_id, dateStr, time, nowIso());
          slots.push(result.lastInsertRowid);
        }
      }
    }

    return slots;
  });

  const created = insertMany();
  res.json({ created: created.length, ids: created });
});

app.get("/slots", (_req, res) => {
  res.json(db.prepare("SELECT * FROM slots").all());
});

app.get("/slots/active", (_req, res) => {
  res.json(
    db
      .prepare(
        `
      SELECT *
      FROM slots
      WHERE active = 1
        AND datetime(date || ' ' || substr(time, 1, 5)) >= datetime('now', 'localtime')
    `,
      )
      .all(),
  );
});

app.get("/slots/owner/:ownerId", (req, res) => {
  res.json(
    db
      .prepare(
        `
      SELECT s.id, s.date, s.time, s.active, s.type,
             CASE WHEN s.active = 1 THEN b.id ELSE NULL END AS booking_id,
             CASE WHEN s.active = 1 THEN u.email ELSE NULL END AS booker_email
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id
      LEFT JOIN users u ON u.id = b.student_id
      WHERE s.owner_id = ?
        AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
      ORDER BY s.date ASC, s.time ASC
    `,
      )
      .all(req.params.ownerId),
  );
});

app.put("/slots/:id/toggle", async (req, res) => {
  const slot = db
    .prepare(
      `
    SELECT s.id, s.date, s.time, s.active,
           owner.email AS owner_email,
           b.id AS booking_id,
           student.email AS booker_email
    FROM slots s
    JOIN users owner ON owner.id = s.owner_id
    LEFT JOIN bookings b ON b.slot_id = s.id
    LEFT JOIN users student ON student.id = b.student_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });

  const nextActive = slot.active ? 0 : 1;
  db.prepare("UPDATE slots SET active = ? WHERE id = ?").run(nextActive, slot.id);

  if (!nextActive) {
    db.prepare("DELETE FROM bookings WHERE slot_id = ?").run(slot.id);
    if (slot.booker_email) {
      await mail.notifySlotDeactivated({
        to: slot.booker_email,
        ownerEmail: slot.owner_email,
        date: slot.date,
        time: slot.time,
      });
    }
  }

  res.json({ message: "Slot toggled", active: Boolean(nextActive) });
});

app.delete("/slots/:id", async (req, res) => {
  const slot = db
    .prepare(
      `
    SELECT s.id, s.date, s.time, s.owner_id, u.email AS owner_email,
           b.id AS booking_id, bu.email AS booker_email
    FROM slots s
    JOIN users u ON u.id = s.owner_id
    LEFT JOIN bookings b ON b.slot_id = s.id
    LEFT JOIN users bu ON bu.id = b.student_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });

  db.prepare("DELETE FROM bookings WHERE slot_id = ?").run(slot.id);
  db.prepare("DELETE FROM slots WHERE id = ?").run(slot.id);

  if (slot.booker_email) {
    await mail.notifySlotDeleted({
      to: slot.booker_email,
      ownerEmail: slot.owner_email,
      date: slot.date,
      time: slot.time,
    });
  }
  res.json({ message: "Slot deleted" });
});

app.post("/bookings", async (req, res) => {
  const { student_id, slot_id } = req.body;
  if (!student_id || !slot_id) return res.status(400).json({ error: "Missing fields" });

  const student = db.prepare("SELECT id, email FROM users WHERE id = ?").get(student_id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const slot = db
    .prepare(
      `
    SELECT s.id, s.date, s.time, s.active, s.owner_id, u.email AS owner_email
    FROM slots s JOIN users u ON u.id = s.owner_id
    WHERE s.id = ?
  `,
    )
    .get(slot_id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (!slot.active) return res.status(400).json({ error: "Slot is not active" });
  if (slot.owner_id === Number(student_id)) return res.status(400).json({ error: "Cannot book your own slot" });
  if (isPast(slot.date, slot.time)) return res.status(400).json({ error: "Slot has already passed" });

  try {
    const result = db.prepare("INSERT INTO bookings (student_id, slot_id, created_at) VALUES (?, ?, ?)").run(student_id, slot_id, nowIso());

    await mail.notifySlotBooked({
      to: slot.owner_email,
      studentEmail: student.email,
      date: slot.date,
      time: slot.time,
    });

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Slot no longer available" });
    }
    throw err;
  }
});

app.get("/bookings/slot/:slotId", (req, res) => {
  res.json(db.prepare("SELECT * FROM bookings WHERE slot_id = ?").all(req.params.slotId));
});

app.get("/bookings/student/:studentId", (req, res) => {
  res.json(db.prepare("SELECT * FROM bookings WHERE student_id = ?").all(req.params.studentId));
});

app.delete("/bookings/:id", async (req, res) => {
  const row = db
    .prepare(
      `
    SELECT b.id, s.date, s.time, s.owner_id,
           owner.email AS owner_email,
           student.email AS student_email
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN users owner ON owner.id = s.owner_id
    JOIN users student ON student.id = b.student_id
    WHERE b.id = ?
  `,
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Booking not found" });

  db.prepare("DELETE FROM bookings WHERE id = ?").run(row.id);

  const cancelledByRole = req.body?.cancelled_by_role === "owner" ? "owner" : "student";
  if (cancelledByRole === "owner") {
    await mail.notifyBookingCancelledByOwner({
      to: row.student_email,
      ownerEmail: row.owner_email,
      date: row.date,
      time: row.time,
    });
  } else {
    await mail.notifyBookingCancelled({
      to: row.owner_email,
      studentEmail: row.student_email,
      date: row.date,
      time: row.time,
    });
  }
  res.json({ message: "Booking cancelled" });
});

app.get("/pins/:studentId", (req, res) => {
  res.json(
    db
      .prepare(
        `
      SELECT u.id, u.email
      FROM pinned_profs p JOIN users u ON u.id = p.owner_id
      WHERE p.student_id = ?
      ORDER BY u.email
    `,
      )
      .all(req.params.studentId),
  );
});

app.post("/pins", (req, res) => {
  const { student_id, owner_id } = req.body;
  if (!student_id || !owner_id) return res.status(400).json({ error: "Missing fields" });
  db.prepare("INSERT OR IGNORE INTO pinned_profs (student_id, owner_id) VALUES (?, ?)").run(student_id, owner_id);
  res.json({ message: "Pinned" });
});

app.delete("/pins/:studentId/:ownerId", (req, res) => {
  db.prepare("DELETE FROM pinned_profs WHERE student_id = ? AND owner_id = ?").run(req.params.studentId, req.params.ownerId);
  res.json({ message: "Unpinned" });
});

app.get("/upcoming/:userId", (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT b.id AS booking_id, s.id AS slot_id, s.date, s.time,
           CASE WHEN s.owner_id = ? THEN 'owner' ELSE 'booker' END AS role,
           CASE WHEN s.owner_id = ? THEN student.email ELSE owner.email END AS counterparty_email
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN users owner ON owner.id = s.owner_id
    JOIN users student ON student.id = b.student_id
    WHERE (s.owner_id = ? OR b.student_id = ?)
      AND s.active = 1
      AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
    ORDER BY s.date ASC, s.time ASC
  `,
    )
    .all(req.params.userId, req.params.userId, req.params.userId, req.params.userId);
  res.json(rows);
});


app.post("/requests", async (req, res) => {
  const { student_id, owner_id, date, time, message } = req.body;
  if (!student_id || !owner_id || !date || !time)
    return res.status(400).json({ error: "Missing fields" });

  if (isPast(date, time))
    return res.status(400).json({ error: "Cannot request a time in the past" });

  const student = db.prepare("SELECT id, email FROM users WHERE id = ?").get(student_id);
  if (!student)
    return res.status(404).json({ error: "Student not found" });

  const owner = db.prepare("SELECT id, email FROM users WHERE id = ? AND role = 'owner'").get(owner_id);
  if (!owner)
    return res.status(404).json({ error: "Professor not found" });

  const result = db.prepare("INSERT INTO requests (student_id, owner_id, date, time, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(student_id, owner_id, date, time, message ?? null, "pending", nowIso());

  await mail.notifyMeetingRequested({ to: owner.email, studentEmail: student.email, date, time });

  res.json({ id: result.lastInsertRowid });
});

app.get("/requests/owner/:ownerId", (req, res) => {
  const rows = db.prepare(
    `
    SELECT r.id, r.date, r.time, r.message, r.status, r.created_at,
           u.email AS student_email
    FROM requests r
    JOIN users u ON u.id = r.student_id
    WHERE r.owner_id = ? AND r.status = 'pending'
    ORDER BY r.date ASC, r.time ASC
  `,
  ).all(req.params.ownerId);

  res.json(rows);
});

app.patch("/requests/:id", async (req, res) => {
  const { status } = req.body;
  if (status !== "accepted" && status !== "declined")
    return res.status(400).json({ error: "status must be accepted or declined" });

  const request = db.prepare(
    `
    SELECT r.*, u_student.email AS student_email, u_owner.email AS owner_email
    FROM requests r
    JOIN users u_student ON u_student.id = r.student_id
    JOIN users u_owner   ON u_owner.id   = r.owner_id
    WHERE r.id = ? AND r.status = 'pending'
  `,
  ).get(req.params.id);

  if (!request)
    return res.status(404).json({ error: "Request not found or already resolved" });

  if (status === "accepted") {
    db.transaction(() => {
      const slot = db
        .prepare("INSERT INTO slots (owner_id, date, time, type, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
        .run(request.owner_id, request.date, request.time, "requested", nowIso());

      db.prepare("INSERT INTO bookings (student_id, slot_id, created_at) VALUES (?, ?, ?)").run(request.student_id, slot.lastInsertRowid, nowIso());

      db.prepare("UPDATE requests SET status = 'accepted' WHERE id = ?").run(request.id);
    })();

    await mail.notifyRequestAccepted({
      to: request.student_email,
      ownerEmail: request.owner_email,
      date: request.date,
      time: request.time,
    });
  }
  else {
    db.prepare("UPDATE requests SET status = 'declined' WHERE id = ?").run(request.id);

    await mail.notifyRequestDeclined({
      to: request.student_email,
      ownerEmail: request.owner_email,
      date: request.date,
      time: request.time,
    });
  }

  res.json({ message: `Request ${status}` });
});

app.delete("/requests/:id", (req, res) => {
  const result = db.prepare("DELETE FROM requests WHERE id = ?").run(req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: "Request not found" });

  res.json({ message: "Request deleted" });
});

//
app.post('/group-polls', async (req, res) => {
  const owner_id = req.body.owner_id;
  const title = req.body.title;
  const slots = req.body.slots;
  const invitees = req.body.invitees;

  if (!owner_id || !title || !slots || slots.length === 0 || !invitees || invitees.length === 0)
    return res.status(400).json({ error: 'Missing fields' });

  const owner = db.prepare("SELECT id, email FROM users WHERE id = ? AND role = 'owner'").get(owner_id);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });

  const poll = db.prepare(
    "INSERT INTO group_polls (owner_id, title, status, created_at) VALUES (?, ?, 'open', ?)"
  ).run(owner_id, title, nowIso());
  const pollId = poll.lastInsertRowid;

  for (const s of slots) {
    db.prepare("INSERT INTO group_poll_slots (poll_id, date, time) VALUES (?, ?, ?)").run(pollId, s.date, s.time);
  }

  for (const email of invitees) {
    const token = crypto.randomBytes(16).toString('base64url');
    db.prepare("INSERT INTO group_poll_invites (poll_id, email, token) VALUES (?, ?, ?)").run(pollId, email, token);
  }

  const invites = db.prepare("SELECT email, token FROM group_poll_invites WHERE poll_id = ?").all(pollId);
  for (const inv of invites) {
    await mail.notifyPollInvite({ to: inv.email, ownerEmail: owner.email, title, token: inv.token });
  }

  res.json({ id: pollId });
});

app.get('/group-polls/owner/:ownerId', (req, res) => {
  const polls = db.prepare(
    "SELECT * FROM group_polls WHERE owner_id = ? ORDER BY created_at DESC"
  ).all(req.params.ownerId);

  const result = [];
  for (const poll of polls) {
    const slots = db.prepare("SELECT * FROM group_poll_slots WHERE poll_id = ?").all(poll.id);
    const slotsWithCounts = [];
    for (const slot of slots) {
      const countRow = db.prepare("SELECT COUNT(*) as count FROM group_poll_votes WHERE poll_slot_id = ?").get(slot.id);
      slotsWithCounts.push({
        id: slot.id,
        poll_id: slot.poll_id,
        date: slot.date,
        time: slot.time,
        vote_count: countRow.count
      });
    }
    result.push({
      id: poll.id,
      owner_id: poll.owner_id,
      title: poll.title,
      status: poll.status,
      created_at: poll.created_at,
      slots: slotsWithCounts
    });
  }

  res.json(result);
});

app.get('/group-polls/vote/:token', (req, res) => {
  const invite = db.prepare("SELECT * FROM group_poll_invites WHERE token = ?").get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid link' });

  const poll = db.prepare(
    "SELECT p.*, u.email AS owner_email FROM group_polls p JOIN users u ON u.id = p.owner_id WHERE p.id = ?"
  ).get(invite.poll_id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const slots = db.prepare("SELECT * FROM group_poll_slots WHERE poll_id = ? ORDER BY date ASC, time ASC").all(poll.id);

  const myVotesRaw = db.prepare(
    "SELECT poll_slot_id FROM group_poll_votes WHERE voter_email = ? AND poll_slot_id IN (SELECT id FROM group_poll_slots WHERE poll_id = ?)"
  ).all(invite.email, poll.id);
  const myVotes = [];
  for (const v of myVotesRaw) {
    myVotes.push(v.poll_slot_id);
  }

  res.json({ poll, slots, myVotes, voterEmail: invite.email });
});

app.post('/group-polls/vote/:token', (req, res) => {
  const invite = db.prepare("SELECT * FROM group_poll_invites WHERE token = ?").get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid link' });

  const poll = db.prepare("SELECT * FROM group_polls WHERE id = ?").get(invite.poll_id);
  if (!poll || poll.status !== 'open') return res.status(400).json({ error: 'Poll is closed' });

  const slot_ids = req.body.slot_ids || [];

  const pollSlots = db.prepare("SELECT id FROM group_poll_slots WHERE poll_id = ?").all(poll.id);
  for (const s of pollSlots) {
    db.prepare("DELETE FROM group_poll_votes WHERE voter_email = ? AND poll_slot_id = ?").run(invite.email, s.id);
  }

  for (const slotId of slot_ids) {
    db.prepare("INSERT OR IGNORE INTO group_poll_votes (poll_slot_id, voter_email) VALUES (?, ?)").run(slotId, invite.email);
  }

  res.json({ message: 'Votes saved' });
});

app.post('/group-polls/:id/finalize', async (req, res) => {
  const slot_id = req.body.slot_id;
  const weeks = req.body.weeks;

  if (!slot_id) return res.status(400).json({ error: 'Missing slot_id' });

  const poll = db.prepare(
    "SELECT p.*, u.email AS owner_email FROM group_polls p JOIN users u ON u.id = p.owner_id WHERE p.id = ?"
  ).get(req.params.id);
  if (!poll || poll.status !== 'open') return res.status(400).json({ error: 'Poll not found or already closed' });

  const chosenSlot = db.prepare("SELECT * FROM group_poll_slots WHERE id = ? AND poll_id = ?").get(slot_id, poll.id);
  if (!chosenSlot) return res.status(404).json({ error: 'Slot not found' });

  const voterRows = db.prepare(
    "SELECT DISTINCT voter_email FROM group_poll_votes WHERE poll_slot_id = ?"
  ).all(slot_id);
  const voters = [];
  for (const row of voterRows) {
    voters.push(row.voter_email);
  }

  let repeatWeeks = Number(weeks) || 1;
  if (repeatWeeks < 1) repeatWeeks = 1;
  if (repeatWeeks > 26) repeatWeeks = 26;

  for (let w = 0; w < repeatWeeks; w++) {
    const d = new Date(`${chosenSlot.date}T${chosenSlot.time}`);
    d.setDate(d.getDate() + w * 7);
    const date = d.toISOString().slice(0, 10);
    const time = chosenSlot.time;

    const newSlot = db.prepare(
      "INSERT INTO slots (owner_id, date, time, type, active, created_at) VALUES (?, ?, ?, 'group', 1, ?)"
    ).run(poll.owner_id, date, time, nowIso());

    for (const email of voters) {
      const student = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (student) {
        db.prepare("INSERT OR IGNORE INTO bookings (student_id, slot_id, created_at) VALUES (?, ?, ?)").run(student.id, newSlot.lastInsertRowid, nowIso());
      }
    }
  }

  db.prepare("UPDATE group_polls SET status = 'closed' WHERE id = ?").run(poll.id);

  for (const email of voters) {
    await mail.notifyPollFinalized({ to: email, ownerEmail: poll.owner_email, title: poll.title, date: chosenSlot.date, time: chosenSlot.time, weeks: repeatWeeks });
  }

  res.json({ message: 'Poll finalized' });
});

//


app.delete('/group-polls/:id', (req, res) => {
  const poll = db.prepare("SELECT id FROM group_polls WHERE id = ?").get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  db.prepare("DELETE FROM group_poll_votes WHERE poll_slot_id IN (SELECT id FROM group_poll_slots WHERE poll_id = ?)").run(req.params.id);
  db.prepare("DELETE FROM group_poll_slots WHERE poll_id = ?").run(req.params.id);
  db.prepare("DELETE FROM group_poll_invites WHERE poll_id = ?").run(req.params.id);
  db.prepare("DELETE FROM group_polls WHERE id = ?").run(req.params.id);

  res.json({ message: 'Poll deleted' });
});


const CLEANUP_INTERVAL_MS = 60_000;
const runCleanup = () => {
  try { cleanupExpired(); }
  catch (err) { console.error("[cleanup] failed:", err?.message || err); }
};
runCleanup();
setInterval(runCleanup, CLEANUP_INTERVAL_MS);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "localhost";

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
