const { workerData, parentPort } = require('worker_threads');
const Database = require('better-sqlite3');
const { createPipelineEngine } = require('../../pipelineEngine');

const db = new Database(workerData.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const engine = createPipelineEngine(db);
const result = engine.startStep(workerData.projectId, workerData.stepKey);

db.close();
parentPort.postMessage(result);
