require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── Middleware ────────────────────────────────────────────────────────────── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

/* ─── Nodemailer transporter ────────────────────────────────────────────────
   Using port 587 + STARTTLS (NOT port 465/SSL) because Render free tier
   blocks outbound port 465 but allows 587.
─────────────────────────────────────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,        // STARTTLS — upgrades connection after handshake
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: true,
  },
});

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function sanitize(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── POST /api/feedback ────────────────────────────────────────────────────── */
app.post('/api/feedback', async (req, res) => {
  const name       = sanitize(req.body.name);
  const email      = sanitize(req.body.email);
  const occupation = sanitize(req.body.occupation);
  const message    = sanitize(req.body.message);

  console.log(`📩  Feedback received from: ${name} <${email}>`);

  const errors = [];
  if (!name)                errors.push('Full name is required.');
  if (!isValidEmail(email)) errors.push('A valid email address is required.');
  if (!message)             errors.push('Feedback message is required.');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const mailOptions = {
    from: `"RuralConnect Feedback" <${process.env.EMAIL_USER}>`,
    to: process.env.RECEIVER_EMAIL,
    replyTo: email,
    subject: `[RuralConnect CSP] New Feedback from ${name}`,
    text: buildTextBody(name, email, occupation, message),
    html: buildHtmlBody(name, email, occupation, message),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅  Email sent | MessageId: ${info.messageId}`);
    return res.status(200).json({
      success: true,
      message: 'Thank you! Your feedback has been submitted successfully.',
    });
  } catch (err) {
    console.error('❌  Send failed:', err.message);
    return res.status(500).json({
      success: false,
      errors: ['Failed to send feedback. Please try again later.'],
      debug: err.message,
    });
  }
});

/* ─── Health check ──────────────────────────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ─── Start server ──────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀  RuralConnect backend running on http://localhost:${PORT}`);
  console.log(`�  Sending from  : ${process.env.EMAIL_USER}`);
  console.log(`📬  Delivering to : ${process.env.RECEIVER_EMAIL}`);

  transporter.verify((err) => {
    if (err) {
      console.error('❌  SMTP verify failed:', err.message);
    } else {
      console.log('✅  SMTP ready (port 587 STARTTLS)');
    }
  });
});

/* ─── Email body builders ───────────────────────────────────────────────────── */
function buildTextBody(name, email, occupation, message) {
  return `
New Feedback — RuralConnect CSP Project
========================================
Name       : ${name}
Email      : ${email}
Occupation : ${occupation || 'Not specified'}
Submitted  : ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST

--- Message ---
${message}
========================================
Sent automatically by the RuralConnect feedback form.
  `.trim();
}

function buildHtmlBody(name, email, occupation, message) {
  const escapedMessage = message.replace(/\n/g, '<br/>');
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#f0f6ff;padding:32px;color:#1e2a3a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
              box-shadow:0 4px 24px rgba(26,109,194,0.10);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0a1f44,#1a6dc2);padding:28px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:1.4rem;">🌐 RuralConnect CSP</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:0.9rem;">New Feedback Received</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:0.93rem;">
        <tr>
          <td style="padding:8px 0;font-weight:700;color:#1a6dc2;width:130px;">Name</td>
          <td style="padding:8px 0;">${name}</td>
        </tr>
        <tr style="background:#f8fbff;">
          <td style="padding:8px 0;font-weight:700;color:#1a6dc2;">Email</td>
          <td style="padding:8px 0;"><a href="mailto:${email}" style="color:#1a6dc2;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:700;color:#1a6dc2;">Occupation</td>
          <td style="padding:8px 0;">${occupation || '<em style="color:#999">Not specified</em>'}</td>
        </tr>
        <tr style="background:#f8fbff;">
          <td style="padding:8px 0;font-weight:700;color:#1a6dc2;">Submitted</td>
          <td style="padding:8px 0;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #dde4ee;margin:20px 0;"/>
      <h3 style="margin:0 0 12px;font-size:1rem;color:#0f4f94;">💬 Feedback Message</h3>
      <div style="background:#f0f6ff;border-left:4px solid #1a6dc2;border-radius:8px;
                  padding:16px 18px;font-size:0.93rem;line-height:1.7;color:#1e2a3a;">
        ${escapedMessage}
      </div>
    </div>
    <div style="background:#f0f6ff;padding:16px 32px;text-align:center;
                font-size:0.78rem;color:#6b7a8d;">
      Sent automatically by the RuralConnect feedback form
    </div>
  </div>
</body>
</html>
  `.trim();
}
