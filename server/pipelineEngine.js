const { getDb } = require('./db');

/** Gemini steps can run for minutes; use a generous stale threshold. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

const STEPS = {
  style: {
    requiredStatus: 'CREATED',
    nextStatus: 'STYLE_SET',
  },
  characters: {
    requiredStatus: 'STYLE_SET',
    nextStatus: 'CHARACTERS_GENERATED',
  },
  portraits: {
    requiredStatus: 'CHARACTERS_GENERATED',
    nextStatus: 'PORTRAITS_GENERATED',
  },
  chapters: {
    requiredStatus: 'PORTRAITS_GENERATED',
    nextStatus: 'CHAPTERS_GENERATED',
  },
  illustrations: {
    requiredStatus: 'CHAPTERS_GENERATED',
    nextStatus: 'DONE',
  },
};

/** @typedef {'style' | 'characters' | 'portraits' | 'chapters' | 'illustrations'} StepKey */

/**
 * @typedef {Object} PipelineProject
 * @property {string} id
 * @property {string} user_id
 * @property {string} title
 * @property {string} book_text
 * @property {string | null} book_file_ref
 * @property {string | null} style
 * @property {string} status
 * @property {'idle' | 'running' | 'failed'} step_state
 * @property {string | null} step_started_at
 * @property {string | null} error_message
 * @property {string} created_at
 */

/**
 * @typedef {Object} StepAttemptResult
 * @property {boolean} ok
 * @property {boolean} started
 * @property {PipelineProject | null} project
 * @property {'project_not_found' | 'invalid_step' | 'wrong_status' | 'already_running' | 'failed' | 'not_retryable' | 'conflict' | undefined} [reason]
 * @property {boolean} [stuck]
 */

function createPipelineEngine(db = getDb()) {
  function getStep(stepKey) {
    const step = STEPS[stepKey];
    if (!step) {
      throw new Error(`Invalid step key: ${stepKey}`);
    }
    return step;
  }

  /** @returns {PipelineProject | null} */
  function loadProject(projectId) {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) ?? null;
  }

  /** @param {Record<string, unknown>} row */
  function mapProject(row) {
    return /** @type {PipelineProject} */ ({ ...row });
  }

  /** @param {PipelineProject | null} project */
  function isProjectStuck(project) {
    if (!project || project.step_state !== 'running' || !project.step_started_at) {
      return false;
    }
    return Date.now() - Date.parse(project.step_started_at) > STALE_THRESHOLD_MS;
  }

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @param {{ allowRetry: boolean }} options
   * @returns {StepAttemptResult}
   */
  function acquireStep(projectId, stepKey, { allowRetry }) {
    const step = getStep(stepKey);
    const now = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

    const project = loadProject(projectId);
    if (!project) {
      return { ok: false, started: false, project: null, reason: 'project_not_found' };
    }

    if (project.status !== step.requiredStatus) {
      return {
        ok: false,
        started: false,
        project: mapProject(project),
        reason: 'wrong_status',
      };
    }

    if (project.step_state === 'running') {
      const stuck = isProjectStuck(project);
      if (!allowRetry || !stuck) {
        return {
          ok: true,
          started: false,
          project: mapProject(project),
          reason: 'already_running',
          stuck,
        };
      }
    } else if (project.step_state === 'failed') {
      if (!allowRetry) {
        return {
          ok: false,
          started: false,
          project: mapProject(project),
          reason: 'failed',
        };
      }
    } else if (project.step_state === 'idle') {
      if (allowRetry) {
        return {
          ok: false,
          started: false,
          project: mapProject(project),
          reason: 'not_retryable',
        };
      }
    }

    const updateSql = allowRetry
      ? `
        UPDATE projects
        SET step_state = 'running',
            step_started_at = ?,
            error_message = NULL
        WHERE id = ?
          AND status = ?
          AND (
            step_state = 'failed'
            OR (step_state = 'running' AND step_started_at < ?)
          )
      `
      : `
        UPDATE projects
        SET step_state = 'running',
            step_started_at = ?,
            error_message = NULL
        WHERE id = ?
          AND status = ?
          AND step_state = 'idle'
      `;

    const updateParams = allowRetry
      ? [now, projectId, step.requiredStatus, staleCutoff]
      : [now, projectId, step.requiredStatus];

    const result = db.prepare(updateSql).run(...updateParams);
    const updated = loadProject(projectId);

    if (result.changes === 0) {
      const current = loadProject(projectId);
      return {
        ok: true,
        started: false,
        project: current ? mapProject(current) : null,
        reason: current?.step_state === 'running' ? 'already_running' : 'conflict',
        stuck: current ? isProjectStuck(current) : false,
      };
    }

    return {
      ok: true,
      started: true,
      project: updated ? mapProject(updated) : null,
    };
  }

  const acquireStepTxn = db.transaction(acquireStep);

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @returns {StepAttemptResult}
   */
  function startStep(projectId, stepKey) {
    try {
      return acquireStepTxn.immediate(projectId, stepKey, { allowRetry: false });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid step key:')) {
        return { ok: false, started: false, project: null, reason: 'invalid_step' };
      }
      throw err;
    }
  }

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @returns {StepAttemptResult}
   */
  function retryStep(projectId, stepKey) {
    try {
      return acquireStepTxn.immediate(projectId, stepKey, { allowRetry: true });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid step key:')) {
        return { ok: false, started: false, project: null, reason: 'invalid_step' };
      }
      throw err;
    }
  }

  /**
   * @param {string} projectId
   * @returns {{ stuck: boolean, project: PipelineProject | null, staleForMs?: number }}
   */
  function checkStuck(projectId) {
    const project = loadProject(projectId);
    if (!project) {
      return { stuck: false, project: null };
    }

    if (!isProjectStuck(project)) {
      return { stuck: false, project: mapProject(project) };
    }

    return {
      stuck: true,
      project: mapProject(project),
      staleForMs: Date.now() - Date.parse(project.step_started_at),
    };
  }

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @param {unknown} resultData
   */
  function persistStepResult(projectId, stepKey, resultData) {
    switch (stepKey) {
      case 'style': {
        const { style, bookFileRef = null } = /** @type {{ style: string, bookFileRef?: string | null }} */ (
          resultData
        );
        db.prepare(
          `
          UPDATE projects
          SET style = ?,
              book_file_ref = COALESCE(?, book_file_ref)
          WHERE id = ?
        `
        ).run(style, bookFileRef, projectId);
        break;
      }
      case 'characters': {
        db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId);
        const insert = db.prepare(`
          INSERT INTO characters (id, project_id, name, prompt, position)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const character of /** @type {{ id: string, name: string, prompt: string, position: number }[]} */ (
          /** @type {{ characters: unknown[] }} */ (resultData).characters.slice(0, 2)
        )) {
          insert.run(character.id, projectId, character.name, character.prompt, character.position);
        }
        break;
      }
      case 'portraits': {
        const update = db.prepare(`
          UPDATE characters
          SET portrait_path = ?
          WHERE id = ? AND project_id = ?
        `);
        for (const portrait of /** @type {{ characterId: string, portraitPath: string }[]} */ (
          /** @type {{ portraits: unknown[] }} */ (resultData).portraits
        )) {
          update.run(portrait.portraitPath, portrait.characterId, projectId);
        }
        break;
      }
      case 'chapters': {
        db.prepare('DELETE FROM chapters WHERE project_id = ?').run(projectId);
        const insert = db.prepare(`
          INSERT INTO chapters (id, project_id, name, prompt, character_names_json, position)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const chapter of /** @type {{ id: string, name: string, prompt: string, characterNames: string[], position: number }[]} */ (
          /** @type {{ chapters: unknown[] }} */ (resultData).chapters.slice(0, 1)
        )) {
          insert.run(
            chapter.id,
            projectId,
            chapter.name,
            chapter.prompt,
            JSON.stringify(chapter.characterNames),
            chapter.position
          );
        }
        break;
      }
      case 'illustrations': {
        const update = db.prepare(`
          UPDATE chapters
          SET illustration_path = ?
          WHERE id = ? AND project_id = ?
        `);
        for (const illustration of /** @type {{ chapterId: string, illustrationPath: string }[]} */ (
          /** @type {{ illustrations: unknown[] }} */ (resultData).illustrations
        )) {
          update.run(illustration.illustrationPath, illustration.chapterId, projectId);
        }
        break;
      }
      default:
        throw new Error(`Invalid step key: ${stepKey}`);
    }
  }

  const completeStepTxn = db.transaction((projectId, stepKey, resultData) => {
    const step = getStep(stepKey);
    const project = loadProject(projectId);

    if (!project) {
      return { ok: false, project: null, reason: 'project_not_found' };
    }

    if (project.status !== step.requiredStatus) {
      return { ok: false, project: mapProject(project), reason: 'wrong_status' };
    }

    if (project.step_state !== 'running') {
      return { ok: false, project: mapProject(project), reason: 'not_running' };
    }

    persistStepResult(projectId, stepKey, resultData);

    db.prepare(
      `
      UPDATE projects
      SET status = ?,
          step_state = 'idle',
          step_started_at = NULL,
          error_message = NULL
      WHERE id = ?
    `
    ).run(step.nextStatus, projectId);

    return { ok: true, project: mapProject(loadProject(projectId)) };
  });

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @param {unknown} resultData
   */
  function completeStep(projectId, stepKey, resultData) {
    try {
      return completeStepTxn.immediate(projectId, stepKey, resultData);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid step key:')) {
        return { ok: false, project: null, reason: 'invalid_step' };
      }
      throw err;
    }
  }

  const failStepTxn = db.transaction((projectId, stepKey, errorMessage) => {
    const step = getStep(stepKey);
    const project = loadProject(projectId);

    if (!project) {
      return { ok: false, project: null, reason: 'project_not_found' };
    }

    if (project.status !== step.requiredStatus) {
      return { ok: false, project: mapProject(project), reason: 'wrong_status' };
    }

    if (project.step_state !== 'running') {
      return { ok: false, project: mapProject(project), reason: 'not_running' };
    }

    db.prepare(
      `
      UPDATE projects
      SET step_state = 'failed',
          error_message = ?
      WHERE id = ?
    `
    ).run(errorMessage, projectId);

    return { ok: true, project: mapProject(loadProject(projectId)) };
  });

  /**
   * @param {string} projectId
   * @param {StepKey} stepKey
   * @param {string} errorMessage
   */
  function failStep(projectId, stepKey, errorMessage) {
    try {
      return failStepTxn.immediate(projectId, stepKey, errorMessage);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid step key:')) {
        return { ok: false, project: null, reason: 'invalid_step' };
      }
      throw err;
    }
  }

  return {
    checkStuck,
    completeStep,
    failStep,
    retryStep,
    startStep,
  };
}

const defaultEngine = createPipelineEngine();

module.exports = {
  STEPS,
  STALE_THRESHOLD_MS,
  checkStuck: defaultEngine.checkStuck,
  completeStep: defaultEngine.completeStep,
  createPipelineEngine,
  failStep: defaultEngine.failStep,
  retryStep: defaultEngine.retryStep,
  startStep: defaultEngine.startStep,
};
