window.bookSlot = async (slotId) => {
  const user = JSON.parse(sessionStorage.getItem('user'));

  if (!user || user.role !== 'student') {
    alert('Only students can book slots');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: user.id,
        slot_id: slotId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Booking failed');
      return;
    }

    alert('Booked successfully!');
    await window.loadCalendarSlots();
  } catch (error) {
    console.error('Error booking slot:', error);
    alert('Server error');
  }
};

window.loadCalendarSlots = async () => {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  const response = await fetch('http://localhost:3000/slots/active');
  const slots = await response.json();

  const events = slots.map(slot => ({
    id: String(slot.id),
    title: 'Available',
    start: `${slot.date.split('T')[0]}T${slot.time}`,
    color: 'green'
  }));

  calendarEl.innerHTML = '';

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    events,
    eventClick: function(info) {
      const confirmBooking = confirm('Book this slot?');
      if (confirmBooking) {
        window.bookSlot(info.event.id);
      }
    }
  });

  calendar.render();
};