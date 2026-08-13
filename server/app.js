const cors = require('cors');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

// Serve generated images with ownership enforcement
app.get('/api/images/:projectId/:file', (req, res) => {
  const { requireAuth } = require('./middleware/requireAuth');
  requireAuth(req, res, () => {
    const { getDb } = require('./db');
    const db = getDb();
    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
      .get(req.params.projectId, req.userId);
    if (!project) {
      return res.status(404).json({ error: 'Not found' });
    }
    const imagesBase = process.env.IMAGES_DIR || '../data/images';
    const filePath = path.resolve(imagesBase, req.params.projectId, req.params.file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.sendFile(filePath);
  });
});

// Sign out — clear the session cookie
app.post('/api/auth/signout', (req, res) => {
  res.clearCookie('session', { path: '/', httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = app;
