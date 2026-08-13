/** @param {import('better-sqlite3').Database} db */
exports.up = (db) => {
  const columns = db.prepare('PRAGMA table_info(projects)').all();
  const hasTextInteraction = columns.some((column) => column.name === 'text_interaction_id');
  const hasBookInteraction = columns.some((column) => column.name === 'book_interaction_id');

  if (hasTextInteraction && !hasBookInteraction) {
    db.exec(`ALTER TABLE projects RENAME COLUMN text_interaction_id TO book_interaction_id`);
    return;
  }

  if (!hasBookInteraction) {
    db.exec(`ALTER TABLE projects ADD COLUMN book_interaction_id TEXT`);
  }
};
