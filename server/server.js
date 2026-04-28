const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const mail = require("./mail");

const app = express();
app.use(express.json());

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_HASH_PREFIX = "scrypt";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

const nowIso = () => new Date().toISOString();
const hashPassword = (password) => {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const key = crypto.scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key}`;
};
const verifyHashedPassword = (password, storedHash) => {
  if (typeof storedHash !== "string") return false;
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) return false;
  const [, nRaw, rRaw, pRaw, salt, keyHex] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!n || !r || !p || !salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, Buffer.from(keyHex, "hex").length, {
    N: n,
    r,
    p,
  });
  const expected = Buffer.from(keyHex, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
};
const isPasswordHash = (value) => typeof value === "string" && value.startsWith(`${PASSWORD_HASH_PREFIX}$`);
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

  const lEmail = String(email).toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(lEmail);
  if (!user) return res.status(404).json({ error: "User not found" });
  let isValid = false;
  if (isPasswordHash(user.password)) {
    isValid = verifyHashedPassword(password, user.password);
  } else {
    isValid = user.password === password;
    if (isValid) {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(password), user.id);
    }
  }
  if (!isValid) return res.status(401).json({ error: "Incorrect password" });

  const { password: _p, invite_token: _t, ...safe } = user;
  res.json(safe);
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "All fields required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email format" });

  const lEmail = String(email).toLowerCase();
  if (!lEmail.endsWith("@mcgill.ca") && !lEmail.endsWith("@mail.mcgill.ca")) {
    return res.status(400).json({ error: "Use McGill email" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(lEmail);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const role = lEmail.endsWith("@mcgill.ca") && !lEmail.endsWith("@mail.mcgill.ca") ? "owner" : "student";
  const passwordHash = hashPassword(password);

  const result = db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run(lEmail, passwordHash, role);
  res.json({ id: result.lastInsertRowid, email: lEmail, role });
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
    SELECT s.id, s.date, s.time, s.active, s.type, s.group_title,
           vb.id AS booking_id, vb.student_id AS booker_id
    FROM slots s
    LEFT JOIN bookings vb ON vb.slot_id = s.id AND vb.student_id = ?
    WHERE s.owner_id = ?
      AND s.active = 1
      AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
      AND (
        s.type = 'group'
        OR NOT EXISTS (
          SELECT 1
          FROM bookings bx
          WHERE bx.slot_id = s.id
            AND bx.student_id <> ?
        )
      )
    ORDER BY s.date ASC, s.time ASC
  `,
    )
    .all(viewerId, owner.id, viewerId);
  res.json({ owner, slots });
});

app.post("/slots/create", (req, res) => {
  const { owner_id, date, time, type, repeat_weeks, group_title } = req.body;
  if (!owner_id || !date || !time) return res.status(400).json({ error: "Missing fields" });
  if (isPast(date, time)) return res.status(400).json({ error: "Cannot create a slot in the past" });
  const slotName = String(group_title || "").trim() || null;

  let weeks = Number(repeat_weeks) || 1;
  if (weeks < 1 || weeks > 52)
    return res.status(400).json({ error: "repeat_weeks must be between 1 and 52" });

  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(time).slice(0, 5).split(":").map(Number);
  const baseDate = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ error: "Invalid date/time" });

  const insert = db.prepare(
    "INSERT INTO slots (owner_id, date, time, type, group_title, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  );
  const createdIds = db.transaction(() => {
    const ids = [];
    for (let w = 0; w < weeks; w++) {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + w * 7);
      const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      const nextTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}:00`;
      if (isPast(nextDate, nextTime)) continue;
      const result = insert.run(owner_id, nextDate, nextTime, type ?? "onetime", slotName, nowIso());
      ids.push(result.lastInsertRowid);
    }
    return ids;
  })();

  if (!createdIds.length) return res.status(400).json({ error: "All generated slots are in the past" });
  res.json({ id: createdIds[0], ids: createdIds, created: createdIds.length });
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
      SELECT s.id, s.date, s.time, s.active, s.type, s.group_title,
             CASE WHEN s.active = 1 AND s.type <> 'group' THEN MAX(b.id) ELSE NULL END AS booking_id,
             CASE WHEN s.active = 1 AND s.type <> 'group' THEN MAX(u.email) ELSE NULL END AS booker_email,
             CASE WHEN s.active = 1 THEN COUNT(b.id) ELSE 0 END AS booking_count
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id
      LEFT JOIN users u ON u.id = b.student_id
      WHERE s.owner_id = ?
        AND datetime(s.date || ' ' || substr(s.time, 1, 5)) >= datetime('now', 'localtime')
      GROUP BY s.id, s.date, s.time, s.active, s.type, s.group_title
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
           owner.email AS owner_email
    FROM slots s
    JOIN users owner ON owner.id = s.owner_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  const bookedStudents = db
    .prepare(
      `
      SELECT u.email AS student_email
      FROM bookings b
      JOIN users u ON u.id = b.student_id
      WHERE b.slot_id = ?
    `,
    )
    .all(slot.id)
    .map((r) => r.student_email)
    .filter(Boolean);

  const nextActive = slot.active ? 0 : 1;
  db.prepare("UPDATE slots SET active = ? WHERE id = ?").run(nextActive, slot.id);

  if (!nextActive) {
    db.prepare("DELETE FROM bookings WHERE slot_id = ?").run(slot.id);
    await Promise.allSettled(
      bookedStudents.map((to) =>
        mail.notifySlotDeactivated({
          to,
          ownerEmail: slot.owner_email,
          date: slot.date,
          time: slot.time,
        }),
      ),
    );
  }

  res.json({ message: "Slot toggled", active: Boolean(nextActive) });
});

app.delete("/slots/:id", async (req, res) => {
  const slot = db
    .prepare(
      `
    SELECT s.id, s.date, s.time, s.owner_id, u.email AS owner_email
    FROM slots s
    JOIN users u ON u.id = s.owner_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  const bookedStudents = db
    .prepare(
      `
      SELECT u.email AS student_email
      FROM bookings b
      JOIN users u ON u.id = b.student_id
      WHERE b.slot_id = ?
    `,
    )
    .all(slot.id)
    .map((r) => r.student_email)
    .filter(Boolean);

  db.prepare("DELETE FROM bookings WHERE slot_id = ?").run(slot.id);
  db.prepare("DELETE FROM slots WHERE id = ?").run(slot.id);

  await Promise.allSettled(
    bookedStudents.map((to) =>
      mail.notifySlotDeleted({
        to,
        ownerEmail: slot.owner_email,
        date: slot.date,
        time: slot.time,
      }),
    ),
  );
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
    SELECT s.id, s.date, s.time, s.active, s.owner_id, s.type, u.email AS owner_email
    FROM slots s JOIN users u ON u.id = s.owner_id
    WHERE s.id = ?
  `,
    )
    .get(slot_id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (!slot.active) return res.status(400).json({ error: "Slot is not active" });
  if (slot.owner_id === Number(student_id)) return res.status(400).json({ error: "Cannot book your own slot" });
  if (isPast(slot.date, slot.time)) return res.status(400).json({ error: "Slot has already passed" });

  if (slot.type !== "group") {
    const existing = db.prepare("SELECT id FROM bookings WHERE slot_id = ? LIMIT 1").get(slot_id);
    if (existing) return res.status(409).json({ error: "Slot no longer available" });
  } else {
    const mine = db
      .prepare("SELECT id FROM bookings WHERE slot_id = ? AND student_id = ? LIMIT 1")
      .get(slot_id, student_id);
    if (mine) return res.status(409).json({ error: "You already booked this group slot" });
  }

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
      return res.status(409).json({ error: slot.type === "group" ? "You already booked this group slot" : "Slot no longer available" });
    }
    throw err;
  }
});

app.get("/bookings/slot/:slotId", (req, res) => {
  res.json(db.prepare("SELECT * FROM bookings WHERE slot_id = ?").all(req.params.slotId));
});

app.get("/slots/:id/attendees", (req, res) => {
  const slot = db.prepare("SELECT id, type FROM slots WHERE id = ?").get(req.params.id);
  if (!slot) return res.status(404).json({ error: "Slot not found" });

  const attendees = db
    .prepare(
      `
      SELECT u.id, u.email
      FROM bookings b
      JOIN users u ON u.id = b.student_id
      WHERE b.slot_id = ?
      ORDER BY u.email ASC
    `,
    )
    .all(req.params.id);

  res.json({ slot_id: slot.id, slot_type: slot.type, attendees });
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
    SELECT b.id AS booking_id, s.id AS slot_id, s.date, s.time, s.type, s.group_title,
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
  const slotName = String(req.body.slot_name || "").trim() || null;

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
        .prepare("INSERT INTO slots (owner_id, date, time, type, group_title, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .run(request.owner_id, request.date, request.time, "requested", slotName, nowIso());

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
app.post('/group-polls', (req, res) => {
  const owner_id = Number(req.body.owner_id);
  const title = String(req.body.title || '').trim() || 'Group meeting';
  const slots = Array.isArray(req.body.slots) ? req.body.slots : [];

  if (!owner_id || slots.length === 0) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const owner = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'owner'").get(owner_id);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });

  const created = db.transaction(() => {
    const poll = db
      .prepare("INSERT INTO group_polls (owner_id, title, created_at) VALUES (?, ?, ?)")
      .run(owner_id, title, nowIso());
    const pollId = poll.lastInsertRowid;
    const insertSlot = db.prepare("INSERT INTO group_poll_slots (poll_id, date, time) VALUES (?, ?, ?)");
    let inserted = 0;
    for (const s of slots) {
      if (!s?.date || !s?.time || isPast(s.date, s.time)) continue;
      insertSlot.run(pollId, s.date, s.time);
      inserted += 1;
    }
    if (inserted === 0) {
      db.prepare("DELETE FROM group_polls WHERE id = ?").run(pollId);
      return null;
    }
    return pollId;
  })();

  if (created == null) {
    return res.status(400).json({ error: "No valid time options (check date and time are in the future)" });
  }
  res.json({ id: created });
});

const getPollsForOwner = (ownerId) => {
  const polls = db.prepare("SELECT * FROM group_polls WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId);
  return polls.map((poll) => {
    const slots = db.prepare("SELECT * FROM group_poll_slots WHERE poll_id = ? ORDER BY date ASC, time ASC").all(poll.id);
    const slotsWithCounts = slots.map((slot) => {
      const countRow = db.prepare("SELECT COUNT(*) as count FROM group_poll_votes WHERE poll_slot_id = ?").get(slot.id);
      return { ...slot, vote_count: countRow.count };
    });
    return { ...poll, slots: slotsWithCounts };
  });
};

app.get('/group-polls/owner/:ownerId', (req, res) => {
  res.json(getPollsForOwner(req.params.ownerId));
});

app.get('/group-polls/invite/:token', (req, res) => {
  const owner = db.prepare("SELECT id, email FROM users WHERE invite_token = ? AND role = 'owner'").get(req.params.token);
  if (!owner) return res.status(404).json({ error: 'Invite link not found' });

  const pollsOpen = db
    .prepare("SELECT * FROM group_polls WHERE owner_id = ? ORDER BY created_at DESC")
    .all(owner.id);

  const viewerId = Number(req.query.viewer) || 0;

  if (!pollsOpen.length) {
    return res.json({ owner, polls: [], poll: null, slots: [], myVotes: [] });
  }

  const buildInvitePoll = (poll) => {
    const slots = db.prepare("SELECT * FROM group_poll_slots WHERE poll_id = ? ORDER BY date ASC, time ASC").all(poll.id);
    const slotIds = slots.map((s) => s.id);
    const voteCounts = new Map();
    for (const slot of slots) {
      const row = db.prepare("SELECT COUNT(*) as count FROM group_poll_votes WHERE poll_slot_id = ?").get(slot.id);
      voteCounts.set(slot.id, row.count);
    }
    let myVotes = [];
    if (viewerId && slotIds.length) {
      myVotes = db
        .prepare(
          `SELECT poll_slot_id
           FROM group_poll_votes
           WHERE voter_id = ?
             AND poll_slot_id IN (${slotIds.map(() => "?").join(",")})`,
        )
        .all(viewerId, ...slotIds)
        .map((r) => r.poll_slot_id);
    }
    return {
      poll,
      slots: slots.map((slot) => ({ ...slot, vote_count: voteCounts.get(slot.id) || 0 })),
      myVotes,
    };
  };

  const polls = pollsOpen.map(buildInvitePoll);
  const first = polls[0];
  res.json({
    owner,
    polls,
    poll: first.poll,
    slots: first.slots,
    myVotes: first.myVotes,
  });
});

app.post('/group-polls/invite/:token/vote', (req, res) => {
  const owner = db.prepare("SELECT id FROM users WHERE invite_token = ? AND role = 'owner'").get(req.params.token);
  if (!owner) return res.status(404).json({ error: 'Invite link not found' });

  const viewer_id = Number(req.body.viewer_id);
  if (!viewer_id) return res.status(400).json({ error: 'viewer_id is required' });

  const requestedPollId = Number(req.body.poll_id);
  const poll = Number.isFinite(requestedPollId) && requestedPollId > 0
    ? db
        .prepare("SELECT * FROM group_polls WHERE id = ? AND owner_id = ?")
        .get(requestedPollId, owner.id)
    : db
        .prepare("SELECT * FROM group_polls WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(owner.id);
  if (!poll) return res.status(400).json({ error: 'No active poll for this owner' });

  const pollSlots = db.prepare("SELECT id FROM group_poll_slots WHERE poll_id = ?").all(poll.id);
  const pollSlotIds = new Set(pollSlots.map((s) => Number(s.id)));
  const requested = Array.isArray(req.body.slot_ids) ? req.body.slot_ids.map(Number) : [];
  const slot_ids = requested.filter((id) => pollSlotIds.has(id));

  db.transaction(() => {
    db.prepare(
      "DELETE FROM group_poll_votes WHERE voter_id = ? AND poll_slot_id IN (SELECT id FROM group_poll_slots WHERE poll_id = ?)",
    ).run(viewer_id, poll.id);

    const insertVote = db.prepare(
      "INSERT OR IGNORE INTO group_poll_votes (poll_slot_id, voter_id, voter_email) VALUES (?, ?, ?)",
    );
    for (const slotId of slot_ids) {
      insertVote.run(slotId, viewer_id, "");
    }
  })();

  res.json({ message: 'Votes saved' });
});

app.post('/group-polls/:id/finalize', (req, res) => {
  const slot_id = req.body.slot_id;
  const weeks = req.body.weeks;

  if (!slot_id) return res.status(400).json({ error: 'Missing slot_id' });

  const poll = db.prepare("SELECT * FROM group_polls WHERE id = ?").get(req.params.id);
  if (!poll) return res.status(400).json({ error: 'Poll not found' });

  const chosenSlot = db.prepare("SELECT * FROM group_poll_slots WHERE id = ? AND poll_id = ?").get(slot_id, poll.id);
  if (!chosenSlot) return res.status(404).json({ error: 'Slot not found' });

  let repeatWeeks = Number(weeks) || 1;
  if (repeatWeeks < 1) repeatWeeks = 1;
  if (repeatWeeks > 26) repeatWeeks = 26;

  const createFinalizedSlots = db.transaction(() => {
    const insertSlot = db.prepare(
      "INSERT INTO slots (owner_id, date, time, type, group_title, active, created_at) VALUES (?, ?, ?, 'group', ?, 1, ?)",
    );
    for (let w = 0; w < repeatWeeks; w++) {
      const d = new Date(`${chosenSlot.date}T${chosenSlot.time}`);
      d.setDate(d.getDate() + w * 7);
      const date = d.toISOString().slice(0, 10);
      const time = chosenSlot.time;
      insertSlot.run(poll.owner_id, date, time, poll.title, nowIso());
    }
    db.prepare("DELETE FROM group_poll_votes WHERE poll_slot_id IN (SELECT id FROM group_poll_slots WHERE poll_id = ?)").run(poll.id);
    db.prepare("DELETE FROM group_poll_slots WHERE poll_id = ?").run(poll.id);
    db.prepare("DELETE FROM group_poll_invites WHERE poll_id = ?").run(poll.id);
    db.prepare("DELETE FROM group_polls WHERE id = ?").run(poll.id);
  });

  createFinalizedSlots();

  const owner = db.prepare("SELECT email FROM users WHERE id = ?").get(poll.owner_id);
  const recipients = db
    .prepare(
      `
      SELECT DISTINCT u.email
      FROM group_poll_votes v
      JOIN group_poll_slots s ON s.id = v.poll_slot_id
      JOIN users u ON u.id = v.voter_id
      WHERE s.poll_id = ?
        AND u.email IS NOT NULL
        AND u.email <> ''
    `,
    )
    .all(poll.id)
    .map((r) => r.email);

  if (owner?.email && recipients.length) {
    Promise.allSettled(
      recipients.map((to) =>
        mail.notifyPollFinalized({
          to,
          ownerEmail: owner.email,
          title: poll.title,
          date: chosenSlot.date,
          time: chosenSlot.time,
          weeks: repeatWeeks,
        }),
      ),
    ).catch((err) => {
      console.error("[group-poll] finalize notifications failed:", err);
    });
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

app.use(express.static(path.join(__dirname, "..")));

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
