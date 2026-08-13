const express = require('express');
const { randomUUID } = require('crypto');

const { getDb } = require('../db');
const { serializeProjectSummary } = require('../projectHelpers');
const { setSessionCookie } = require('../session');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// Session restore — returns the current user if cookie is valid
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
    .get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const projects = db
    .prepare(
      `SELECT id, title, status, step_state, error_message, created_at
       FROM projects WHERE user_id = ? ORDER BY datetime(created_at) DESC`
    )
    .all(user.id)
    .map(serializeProjectSummary);

  return res.json({ user, projects });
});

router.post('/', (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (!email || !name) {
    return res.status(400).json({ error: 'email and name are required' });
  }

  const db = getDb();
  let user = db.prepare('SELECT id, email, name, created_at FROM users WHERE email = ?').get(email);

  if (!user) {
    const userId = randomUUID();
    db.prepare(
      `
      INSERT INTO users (id, email, name)
      VALUES (?, ?, ?)
    `
    ).run(userId, email, name);
    user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(userId);
  }

  const projects = db
    .prepare(
      `
      SELECT id, title, status, step_state, error_message, created_at
      FROM projects
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
    `
    )
    .all(user.id)
    .map(serializeProjectSummary);

  setSessionCookie(res, user.id);

  return res.json({
    user,
    projects,
  });
});

module.exports = router;
