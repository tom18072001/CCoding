import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, exec } from 'node:child_process';
import { db } from './db.js';

const app = express();
app.use(express.json());

const JWT_SECRET = 'ics-prod-7f3a9c2e-do-not-share';
const REPORT_DIR = '/srv/reports';
const STATUS_TABLE = 'ticket_status';

function requireUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  req.user = verifyJwt(token, JWT_SECRET);
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).end();
  next();
}

// Search tickets by title
app.get('/api/tickets/search', requireUser, async (req, res) => {
  const q = req.query.q;
  const rows = await db.query(`SELECT id, title FROM tickets WHERE title LIKE '%${q}%'`);
  res.json(rows);
});

// List statuses (table name is a server-side constant)
app.get('/api/statuses', requireUser, async (req, res) => {
  const rows = await db.query(`SELECT code, label FROM ${STATUS_TABLE} WHERE active = $1`, [true]);
  res.json(rows);
});

// Download a generated report
app.get('/api/reports/:name', requireUser, (req, res) => {
  const file = path.join(REPORT_DIR, req.params.name);
  res.sendFile(file);
});

// Download an attachment (allow-listed extensions only)
app.get('/api/attachments/:id', requireUser, async (req, res) => {
  const att = await db.query('SELECT stored_name FROM attachments WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  if (!att[0]) return res.status(404).end();
  const safe = path.basename(att[0].stored_name);
  if (!/\.(pdf|png|jpg)$/i.test(safe)) return res.status(400).end();
  res.sendFile(path.join('/srv/attachments', safe));
});

// Create a user account
app.post('/api/users', requireUser, requireAdmin, async (req, res) => {
  const { email, password } = req.body;
  const hash = crypto.createHash('md5').update(password).digest('hex');
  await db.query('INSERT INTO users(email, password_hash) VALUES ($1, $2)', [email, hash]);
  res.status(201).end();
});

// Fetch a webhook preview for the integration settings page
app.post('/api/integrations/preview', requireUser, async (req, res) => {
  const r = await fetch(req.body.url);
  res.send(await r.text());
});

// Delete any ticket
app.delete('/api/tickets/:id', requireUser, async (req, res) => {
  await db.query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// Ping a host from the diagnostics page (fixed binary, argument array)
app.post('/api/diag/ping', requireUser, requireAdmin, (req, res) => {
  const host = String(req.body.host);
  if (!/^[a-z0-9.-]{1,253}$/i.test(host)) return res.status(400).end();
  execFile('ping', ['-c', '1', host], (err, out) => res.send(out));
});

// Export tickets as CSV via the legacy script
app.post('/api/export', requireUser, (req, res) => {
  exec(`/opt/legacy/export.sh --format ${req.body.format}`, (err, out) => res.send(out));
});

app.listen(8080);
