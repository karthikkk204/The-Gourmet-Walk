import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.NOTIFICATION_FROM) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
  });
  return transporter;
}

export async function sendNotification({ to, subject, text }) {
  const mailer = getTransporter();
  if (!mailer) return false;
  await mailer.sendMail({ from: process.env.NOTIFICATION_FROM, to, subject, text });
  return true;
}
