const { checkStuck } = require('./pipelineEngine');

const STATUS_ORDER = [
  'CREATED',
  'STYLE_SET',
  'CHARACTERS_GENERATED',
  'PORTRAITS_GENERATED',
  'CHAPTERS_GENERATED',
  'DONE',
];

function projectProgress(status) {
  const completedCount = STATUS_ORDER.indexOf(status);
  return {
    status,
    completedCount: completedCount < 0 ? 0 : completedCount,
    totalCount: 5,
    isDone: status === 'DONE',
  };
}

function serializeProjectSummary(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    step_state: row.step_state,
    error_message: row.error_message,
    created_at: row.created_at,
    progress: projectProgress(row.status),
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} projectId
 * @param {string} userId
 */
function getOwnedProject(db, projectId, userId) {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId) ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} projectId
 * @param {string} userId
 */
function getProjectDetail(db, projectId, userId) {
  const project = getOwnedProject(db, projectId, userId);
  if (!project) {
    return null;
  }

  const characters = db
    .prepare(
      `
      SELECT id, name, prompt, portrait_path, position
      FROM characters
      WHERE project_id = ?
      ORDER BY position
    `
    )
    .all(projectId);

  const chapters = db
    .prepare(
      `
      SELECT id, name, prompt, character_names_json, illustration_path, position
      FROM chapters
      WHERE project_id = ?
      ORDER BY position
    `
    )
    .all(projectId);

  const stuckInfo = checkStuck(projectId);

  return {
    id: project.id,
    title: project.title,
    status: project.status,
    step_state: project.step_state,
    step_started_at: project.step_started_at,
    error_message: project.error_message,
    style: project.style,
    stuck: stuckInfo.stuck,
    staleForMs: stuckInfo.staleForMs ?? null,
    progress: projectProgress(project.status),
    characters,
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      name: chapter.name,
      prompt: chapter.prompt,
      illustration_path: chapter.illustration_path,
      position: chapter.position,
      character_names: JSON.parse(chapter.character_names_json),
    })),
  };
}

module.exports = {
  getOwnedProject,
  getProjectDetail,
  projectProgress,
  serializeProjectSummary,
};
