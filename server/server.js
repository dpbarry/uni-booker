const express = require('express');
const app = express();
const db = require('./db');
const cors = require('cors');
app.use(cors());

app.use(express.json());

app.post('/login', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';

  db.query(query, [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al buscar usuario' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(results[0]);
  });
});

app.post('/bookings', (req, res) => {
  const { student_id, slot_id } = req.body;

  const query = `
    INSERT INTO bookings (student_id, slot_id)
    VALUES (?, ?)
  `;

  db.query(query, [student_id, slot_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error creating booking' });
    }

    res.json({ message: 'Booking created' });
  });
});

app.get('/slots/owner/:ownerId', (req, res) => {
  const { ownerId } = req.params;

  const query = 'SELECT * FROM slots WHERE owner_id = ?';

  db.query(query, [ownerId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener slots del owner' });
    }

    res.json(results);
  });
});

app.get('/slots/active', (req, res) => {
  const query = 'SELECT * FROM slots WHERE active = 1';

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener slots activos' });
    }

    res.json(results);
  });
});

app.put('/slots/:id/toggle', (req, res) => {
  const { id } = req.params;

  const query = 'UPDATE slots SET active = NOT active WHERE id = ?';

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al actualizar' });
    }

    res.json({
      message: 'Slot actualizado 🔄'
    });
  });
});

// DELETE
app.delete('/slots/:id', (req, res) => {
  const { id } = req.params;

  const query = 'DELETE FROM slots WHERE id = ?';

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al eliminar' });
    }

    res.json({
      message: 'Slot eliminado 🗑️'
    });
  });
});

// 👉 GET slots (ponlo aquí)
app.get('/slots', (req, res) => {
  const query = 'SELECT * FROM slots';

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener slots' });
    }

    res.json(results);
  });
});

// 👉 POST create
app.post('/slots/create', (req, res) => {
  const { owner_id, date, time } = req.body;

  if (!owner_id || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const query = 'INSERT INTO slots (owner_id, date, time, active) VALUES (?, ?, ?, 1)';

  db.query(query, [owner_id, date, time], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al guardar slot' });
    }

    res.json({
      message: 'Slot guardado con owner',
      id: result.insertId
    });
  });
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
