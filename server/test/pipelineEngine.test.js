const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { randomUUID } = require('node:crypto');

const { createDatabase } = require('../db');
const { createPipelineEngine, STALE_THRESHOLD_MS } = require('../pipelineEngine');

function seedProject(db) {
  const userId = randomUUID();
  const projectId = randomUUID();

  db.prepare(
    `
    INSERT INTO users (id, email, name)
    VALUES (?, ?, ?)
  `
  ).run(userId, `${projectId}@example.com`, 'Test User');

  db.prepare(
    `
    INSERT INTO projects (id, user_id, title, book_text, status, step_state)
    VALUES (?, ?, ?, ?, 'CREATED', 'idle')
  `
  ).run(projectId, userId, 'Test Book', 'Once upon a time.');

  return projectId;
}

function runStartStepInWorker(dbPath, projectId, stepKey) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'workers', 'startStepWorker.js'), {
      workerData: { dbPath, projectId, stepKey },
    });

    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

test('startStep twice concurrently allows only one acquisition', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-engine-'));
  const dbPath = path.join(tmpDir, 'test.db');

  const setupDb = createDatabase(dbPath);
  const projectId = seedProject(setupDb);
  setupDb.close();

  const [first, second] = await Promise.all([
    runStartStepInWorker(dbPath, projectId, 'style'),
    runStartStepInWorker(dbPath, projectId, 'style'),
  ]);

  const winners = [first, second].filter((result) => result.started);
  const losers = [first, second].filter((result) => !result.started);

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(winners[0].project?.step_state, 'running');
  assert.equal(losers[0].reason, 'already_running');
  assert.equal(losers[0].project?.step_state, 'running');
});

test('completeStep advances status and clears running state', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-engine-')), 'test.db');
  const db = createDatabase(dbPath);
  const engine = createPipelineEngine(db);
  const projectId = seedProject(db);

  const started = engine.startStep(projectId, 'style');
  assert.equal(started.started, true);

  const completed = engine.completeStep(projectId, 'style', {
    style: 'Watercolor storybook',
    bookFileRef: 'files/abc123',
  });

  assert.equal(completed.ok, true);
  assert.equal(completed.project?.status, 'STYLE_SET');
  assert.equal(completed.project?.step_state, 'idle');
  assert.equal(completed.project?.style, 'Watercolor storybook');
  assert.equal(completed.project?.book_file_ref, 'files/abc123');

  db.close();
});

test('failStep keeps status and marks step failed', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-engine-')), 'test.db');
  const db = createDatabase(dbPath);
  const engine = createPipelineEngine(db);
  const projectId = seedProject(db);

  engine.startStep(projectId, 'style');
  const failed = engine.failStep(projectId, 'style', 'Gemini timeout');

  assert.equal(failed.ok, true);
  assert.equal(failed.project?.status, 'CREATED');
  assert.equal(failed.project?.step_state, 'failed');
  assert.equal(failed.project?.error_message, 'Gemini timeout');

  db.close();
});

test('retryStep can reclaim a failed step', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-engine-')), 'test.db');
  const db = createDatabase(dbPath);
  const engine = createPipelineEngine(db);
  const projectId = seedProject(db);

  engine.startStep(projectId, 'style');
  engine.failStep(projectId, 'style', 'Gemini timeout');

  const retried = engine.retryStep(projectId, 'style');
  assert.equal(retried.started, true);
  assert.equal(retried.project?.step_state, 'running');
  assert.equal(retried.project?.error_message, null);

  db.close();
});

test('checkStuck reports long-running steps without auto-retrying', () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-engine-')), 'test.db');
  const db = createDatabase(dbPath);
  const engine = createPipelineEngine(db);
  const projectId = seedProject(db);

  const staleStartedAt = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
  db.prepare(
    `
    UPDATE projects
    SET step_state = 'running',
        step_started_at = ?
    WHERE id = ?
  `
  ).run(staleStartedAt, projectId);

  const stuck = engine.checkStuck(projectId);
  assert.equal(stuck.stuck, true);
  assert.equal(stuck.project?.step_state, 'running');

  db.close();
});
