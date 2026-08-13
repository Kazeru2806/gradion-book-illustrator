/** @param {import('better-sqlite3').Database} db */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      book_text TEXT NOT NULL,
      book_file_ref TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED'
        CHECK (status IN (
          'CREATED',
          'STYLE_SET',
          'CHARACTERS_GENERATED',
          'PORTRAITS_GENERATED',
          'CHAPTERS_GENERATED',
          'DONE'
        )),
      step_state TEXT NOT NULL DEFAULT 'idle'
        CHECK (step_state IN ('idle', 'running', 'failed')),
      step_started_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_projects_user_id ON projects(user_id);

    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      portrait_path TEXT,
      position INTEGER NOT NULL,
      UNIQUE (project_id, position)
    );

    CREATE INDEX idx_characters_project_id ON characters(project_id);

    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      character_names_json TEXT NOT NULL,
      illustration_path TEXT,
      position INTEGER NOT NULL,
      UNIQUE (project_id, position)
    );

    CREATE INDEX idx_chapters_project_id ON chapters(project_id);
  `);
};
