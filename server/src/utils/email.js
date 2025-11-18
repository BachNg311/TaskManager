const nodemailer = require('nodemailer');

// SendGrid via SMTP using Nodemailer
// Required env vars:
// - SENDGRID_API_KEY
// - SENDGRID_FROM_EMAIL
// Optional:
// - SENDGRID_FROM_NAME
// - SENDGRID_HOST (default: smtp.sendgrid.net)
// - SENDGRID_PORT (default: 587)

const transporter = nodemailer.createTransport({
  host: process.env.SENDGRID_HOST || 'smtp.sendgrid.net',
  port: Number(process.env.SENDGRID_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SENDGRID_USER || 'apikey',
    pass: process.env.SENDGRID_API_KEY,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.warn('SendGrid environment variables are not set. Email will not be sent.');
    return;
  }

  const fromName = process.env.SENDGRID_FROM_NAME || 'Task Manager';

  const mailOptions = {
    from: `"${fromName}" <${process.env.SENDGRID_FROM_EMAIL}>`,
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, '') || '',
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendEmail,
};


