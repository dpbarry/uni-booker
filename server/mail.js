const { Resend } = require("resend");

const FROM = process.env.RESEND_FROM;
const client = new Resend(process.env.RESEND_API_KEY);

const send = async ({ to, subject, text }) => {
  const { error } = await client.emails.send({ from: FROM, to, subject, text });
  if (error) console.error("[mail] send failed:", error.message);
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
