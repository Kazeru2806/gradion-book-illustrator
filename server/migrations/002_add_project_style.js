/** @param {import('better-sqlite3').Database} db */
exports.up = (db) => {
  db.exec(`ALTER TABLE projects ADD COLUMN style TEXT`);
};
