const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');

const { getDb } = require('../db');
const { runStep, uploadBookAndInitialize } = require('../gemini');
const { requireAuth } = require('../middleware/requireAuth');
const { getProjectDetail, getOwnedProject, serializeProjectSummary } = require('../projectHelpers');
const { STEPS, completeStep, failStep, retryStep, startStep } = require('../pipelineEngine');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** @type {Set<string>} */
const STEP_KEYS = new Set(Object.keys(STEPS));

function isValidStepKey(stepKey) {
  return STEP_KEYS.has(stepKey);
}

async function executeStep(req, res, { isRetry }) {
  const { id: projectId, stepKey } = req.params;

  if (!isValidStepKey(stepKey)) {
    return res.status(400).json({ error: 'Invalid step key' });
  }

  const db = getDb();
  const project = getOwnedProject(db, projectId, req.userId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const attempt = isRetry ? retryStep(projectId, stepKey) : startStep(projectId, stepKey);

  if (!attempt.started) {
    if (attempt.reason === 'already_running') {
      return res.status(200).json({
        started: false,
        inFlight: true,
        stuck: attempt.stuck ?? false,
        reason: attempt.reason,
        project: getProjectDetail(db, projectId, req.userId),
      });
    }

    return res.status(409).json({
      started: false,
      reason: attempt.reason,
      project: getProjectDetail(db, projectId, req.userId),
    });
  }

  try {
    const userStyle = typeof req.body?.style === 'string' ? req.body.style : undefined;
    const resultData = await runStep(stepKey, project, { userStyle });
    const completed = completeStep(projectId, stepKey, resultData);

    if (!completed.ok) {
      return res.status(409).json({
        started: true,
        completed: false,
        reason: completed.reason,
        project: getProjectDetail(db, projectId, req.userId),
      });
    }

    return res.json({
      started: true,
      completed: true,
      project: getProjectDetail(db, projectId, req.userId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Step failed';
    failStep(projectId, stepKey, message);

    return res.status(502).json({
      started: true,
      completed: false,
      error: message,
      project: getProjectDetail(db, projectId, req.userId),
    });
  }
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const projects = db
    .prepare(
      `
      SELECT id, title, status, step_state, error_message, created_at
      FROM projects
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
    `
    )
    .all(req.userId)
    .map(serializeProjectSummary);

  res.json({ projects });
});

router.post('/', requireAuth, upload.single('book_file'), async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  let bookText = typeof req.body.book_text === 'string' ? req.body.book_text : '';

  if (req.file) {
    bookText = req.file.buffer.toString('utf8');
  }

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  if (!bookText.trim()) {
    return res.status(400).json({ error: 'book_text or book_file is required' });
  }

  try {
    const { bookFileRef, bookInteractionId } = await uploadBookAndInitialize(bookText, title);
    const projectId = randomUUID();
    const db = getDb();

    db.prepare(
      `
      INSERT INTO projects (
        id, user_id, title, book_text, book_file_ref, book_interaction_id, status, step_state
      )
      VALUES (?, ?, ?, ?, ?, ?, 'CREATED', 'idle')
    `
    ).run(projectId, req.userId, title, bookText, bookFileRef, bookInteractionId);

    return res.status(201).json({
      project: getProjectDetail(db, projectId, req.userId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create project';
    return res.status(502).json({ error: message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const project = getProjectDetail(db, req.params.id, req.userId);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ project });
});

router.get('/:id/book_text', requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT book_text FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  return res.json({ book_text: row.book_text });
});

router.post('/:id/steps/:stepKey/run', requireAuth, async (req, res) => {
  await executeStep(req, res, { isRetry: false });
});

router.post('/:id/steps/:stepKey/retry', requireAuth, async (req, res) => {
  await executeStep(req, res, { isRetry: true });
});

module.exports = router;
