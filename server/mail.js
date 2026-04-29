// Dean Barry, Mariana Diaz Betancourt

const { Resend } = require("resend");

const FROM = process.env.RESEND_FROM;
const API_KEY = process.env.RESEND_API_KEY;
const client = API_KEY ? new Resend(API_KEY) : null;
const DEMO_MAIL_TO = process.env.DEMO_MAIL_TO?.trim();

const resolveTo = (to) => {
  if (!DEMO_MAIL_TO) return to;
  if (Array.isArray(to)) return to.map(resolveTo);
  const key = String(to).trim().toLowerCase();
  if (key === "prof@mcgill.ca" || key === "student@mail.mcgill.ca") return DEMO_MAIL_TO;
  return to;
};

const send = async ({ to, subject, text }) => {
  if (!client || !FROM) {
    console.error("[mail] send skipped: missing RESEND_API_KEY or RESEND_FROM");
    return;
  }
  try {
    const { error } = await client.emails.send({ from: FROM, to: resolveTo(to), subject, text });
    if (error) console.error("[mail] send failed:", error.message);
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



exports.notifyPollInvite = ({ to, ownerEmail, title, token }) =>
  send({
    to,
    subject: `You're invited to vote: ${title}`,
    text: `${ownerEmail} invited you to pick a meeting time for "${title}".\n\nClick the link below to vote:\n${process.env.APP_URL || 'http://localhost:3000'}/#/poll/${token}`,
  });

exports.notifyPollFinalized = ({ to, ownerEmail, title, date, time, weeks }) => {
  const weekText = weeks > 1 ? ` (repeats for ${weeks} weeks)` : '';
  return send({
    to,
    subject: `Meeting time confirmed: ${title}`,
    text: `${ownerEmail} selected a time for "${title}".\n\nDate: ${date} at ${String(time).slice(0, 5)}${weekText}`,
  });
};

exports.notifyPasswordReset = ({ to, token }) =>
  send({
    to,
    subject: 'Reset your UniBooker password',
    text: `You requested a password reset.\n\nClick the link below to set a new password:\n${process.env.APP_URL || 'http://localhost:3000'}/#/reset/${token}\n\nThis link expires in 24 hours. If you didn't request this, you can ignore this email.`,
  });
