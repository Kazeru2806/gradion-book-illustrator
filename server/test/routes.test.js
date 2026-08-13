const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

process.env.SESSION_SECRET = 'test-session-secret';
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'routes-test-')),
  'test.db'
);

const app = require('../app');
const { getDb } = require('../db');

function request(port, method, urlPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const json = raw ? JSON.parse(raw) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

let server;
let port;
let sessionCookie;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

test.after(() => {
  server.close();
  getDb().close();
});

async function api(method, pathname, options = {}) {
  return request(port, method, pathname, options);
}

test('auth + project pipeline end-to-end with stubs', async () => {
  const auth = await api('POST', '/api/auth', {
    body: { email: 'mole@example.com', name: 'Mole' },
  });

  assert.equal(auth.status, 200);
  assert.match(auth.headers['set-cookie'][0], /session=/);
  sessionCookie = auth.headers['set-cookie'][0].split(';')[0];

  const created = await api('POST', '/api/projects', {
    cookie: sessionCookie,
    body: {
      title: 'The Wind in the Willows',
      book_text: 'The Mole had been working very hard all the morning.',
    },
  });

  assert.equal(created.status, 201);
  assert.equal(created.json.project.status, 'CREATED');
  assert.ok(created.json.project.progress);

  const projectId = created.json.project.id;
  const db = getDb();
  const row = db.prepare('SELECT book_file_ref FROM projects WHERE id = ?').get(projectId);
  assert.match(row.book_file_ref, /^files\/stub-/);

  for (const stepKey of ['style', 'characters', 'portraits', 'chapters', 'illustrations']) {
    const result = await api('POST', `/api/projects/${projectId}/steps/${stepKey}/run`, {
      cookie: sessionCookie,
    });
    assert.equal(result.status, 200, stepKey);
    assert.equal(result.json.completed, true, stepKey);
  }

  const done = await api('GET', `/api/projects/${projectId}`, {
    cookie: sessionCookie,
  });
  assert.equal(done.json.project.status, 'DONE');
  assert.equal(done.json.project.characters.length, 2);
  assert.equal(done.json.project.chapters.length, 1);

  db.prepare(
    `
    UPDATE projects
    SET step_state = 'running',
        step_started_at = datetime('now'),
        status = 'CREATED'
    WHERE id = ?
  `
  ).run(projectId);

  const inFlight = await api('POST', `/api/projects/${projectId}/steps/style/run`, {
    cookie: sessionCookie,
  });
  assert.equal(inFlight.status, 200);
  assert.equal(inFlight.json.started, false);
  assert.equal(inFlight.json.inFlight, true);
  assert.equal(inFlight.json.reason, 'already_running');
});
