/** @param {import('better-sqlite3').Database} db */
exports.up = (db) => {
  db.exec(`
    ALTER TABLE projects ADD COLUMN text_interaction_id TEXT;
    ALTER TABLE projects ADD COLUMN portrait_interaction_id TEXT;
  `);
};
