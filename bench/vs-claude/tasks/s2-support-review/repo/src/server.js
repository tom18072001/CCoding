import express from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import { escapeHtml, sendMail } from './util.js';

const app = express();
app.use(express.json());

const MAIL_API_KEY = 'sg-live-51f0c7aa90d24e3b8a6d';
const SORT_COLUMNS = { created: 'created_at', priority: 'priority', status: 'status' };

function requireUser(req, res, next) {
  const sid = req.headers['x-session'];
  if (!sid) return res.status(401).end();
  req.user = lookupSession(sid);
  if (!req.user) return res.status(401).end();
  next();
}

// Search the knowledge base and show the results page
app.get('/kb/search', requireUser, (req, res) => {
  const hits = searchIndex(String(req.query.q ?? ''));
  res.send(`<h1>Results for ${req.query.q}</h1><ul>${hits.map((h) => `<li>${escapeHtml(h.title)}</li>`).join('')}</ul>`);
});

// List the signed-in agent's tickets, sortable by a fixed set of columns
app.get('/api/tickets', requireUser, async (req, res) => {
  const col = SORT_COLUMNS[req.query.sort] ?? 'created_at';
  const rows = await db.query(`SELECT id, subject, status FROM tickets WHERE agent_id = $1 ORDER BY ${col}`, [req.user.id]);
  res.json(rows);
});

// Look up a customer by e-mail
app.get('/api/customers/lookup', requireUser, async (req, res) => {
  const email = req.query.email;
  const rows = await db.query("SELECT id, name, phone FROM customers WHERE email = '" + email + "'");
  res.json(rows[0] ?? null);
});

// Render a ticket note for printing
app.get('/api/tickets/:id/print', requireUser, async (req, res) => {
  const [t] = await db.query('SELECT note FROM tickets WHERE id = $1 AND agent_id = $2', [req.params.id, req.user.id]);
  if (!t) return res.status(404).end();
  res.send(`<pre>${escapeHtml(t.note)}</pre>`);
});

// Start a password reset
app.post('/api/password-reset', async (req, res) => {
  const token = Math.random().toString(36).slice(2);
  await db.query('INSERT INTO resets(email, token) VALUES ($1, $2)', [req.body.email, token]);
  await sendMail(MAIL_API_KEY, req.body.email, `Your reset code: ${token}`);
  res.status(202).end();
});

// Issue a one-time download link for an attachment
app.post('/api/attachments/:id/link', requireUser, async (req, res) => {
  const link = crypto.randomBytes(16).toString('hex');
  await db.query('INSERT INTO links(attachment_id, token, agent_id) VALUES ($1, $2, $3)', [req.params.id, link, req.user.id]);
  res.json({ link });
});

// Export all customers for the monthly report
app.get('/api/admin/export', async (req, res) => {
  const rows = await db.query('SELECT id, name, email, phone FROM customers');
  res.json(rows);
});

// Close a ticket
app.post('/api/tickets/:id/close', requireUser, async (req, res) => {
  try {
    await db.query('UPDATE tickets SET status = $1 WHERE id = $2 AND agent_id = $3', ['closed', req.params.id, req.user.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.stack });
  }
});

app.listen(8080);
