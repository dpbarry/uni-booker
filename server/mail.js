const FROM = process.env.RESEND_FROM;

let client = null;
const getClient = () => {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = require("resend");
  client = new Resend(key);
  return client;
};

const send = async ({ to, subject, text }) => {
  const c = getClient();
  if (!c) {
    console.log("[mail stub]", { to, subject, text });
    return;
  }
  try {
    await c.emails.send({ from: FROM, to, subject, text });
  } catch (err) {
    console.error("[mail] send failed:", err?.message || err);
  }
};

const whenLabel = (date, time) => `${date} at ${String(time).slice(0, 5)}`;

exports.notifySlotDeleted = ({ to, ownerEmail, date, time }) =>
  send({
    to,
    subject: "Your appointment was cancelled",
    text: `${ownerEmail} cancelled the appointment on ${whenLabel(date, time)}.`,
  });

exports.notifySlotDeactivated = ({ to, ownerEmail, date, time }) =>
  send({
    to,
    subject: "Your appointment was cancelled",
    text: `${ownerEmail} cancelled the appointment on ${whenLabel(date, time)}.`,
  });

exports.notifyBookingCancelled = ({ to, studentEmail, date, time }) =>
  send({
    to,
    subject: "A booking was cancelled",
    text: `${studentEmail} cancelled their booking for ${whenLabel(date, time)}. The slot is available again.`,
  });

exports.notifyBookingCancelledByOwner = ({ to, ownerEmail, date, time }) =>
  send({
    to,
    subject: "Your booking was cancelled",
    text: `${ownerEmail} cancelled your booking for ${whenLabel(date, time)}.`,
  });

exports.notifySlotBooked = ({ to, studentEmail, date, time }) =>
  send({
    to,
    subject: "New booking on your slot",
    text: `${studentEmail} booked your slot on ${whenLabel(date, time)}.`,
  });

  
// Place holder for approval office hours emailing system
exports.notifyMeetingRequested = ({ to, studentEmail, date, time }) =>
  send({
    to,
    subject: "New meeting request",
    text: `${studentEmail} requested a meeting on ${whenLabel(date, time)}.`,
  });

exports.notifyRequestAccepted = ({ to, ownerEmail, date, time }) =>
  send({
    to,
    subject: "Your meeting request was accepted",
    text: `${ownerEmail} accepted your meeting request for ${whenLabel(date, time)}.`,
  });

exports.notifyRequestDeclined = ({ to, ownerEmail, date, time }) =>
  send({
    to,
    subject: "Your meeting request was declined",
    text: `${ownerEmail} declined your meeting request for ${whenLabel(date, time)}.`,
  });
