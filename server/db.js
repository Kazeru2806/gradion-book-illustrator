const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

require('./env');

const DEFAULT_DATABASE_PATH = './data/app.db';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

function getDatabasePath() {
  return process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
}

/** @param {import('better-sqlite3').Database} database */
function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    database
      .prepare('SELECT name FROM schema_migrations ORDER BY id')
      .all()
      .map((row) => row.name)
  );

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  for (const file of migrationFiles) {
    const name = path.basename(file, '.js');
    if (applied.has(name)) {
      continue;
    }

    const migration = require(path.join(migrationsDir, file));
    const applyMigration = database.transaction(() => {
      migration.up(database);
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    });

    applyMigration();
    console.log(`Applied migration: ${name}`);
  }
}

function createDatabase(dbPath = getDatabasePath()) {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const database = new Database(resolved);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  runMigrations(database);

  return database;
}

function openDatabase() {
  return createDatabase(getDatabasePath());
}

function getDb() {
  if (!db) {
    db = openDatabase();
  }
  return db;
}

module.exports = {
  createDatabase,
  getDb,
  getDatabasePath,
  runMigrations,
};
