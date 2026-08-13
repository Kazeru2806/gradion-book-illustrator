const { randomUUID } = require('crypto');
const { getDb } = require('./db');

const STUB_DELAY_MS = 300;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload book text to Gemini File API once per project.
 * Stubbed for now — returns a fake file reference.
 *
 * @param {string} bookText
 * @returns {Promise<string>}
 */
async function uploadBookText(bookText) {
  if (!bookText?.trim()) {
    throw new Error('Book text is empty');
  }

  await delay(50);
  return `files/stub-${randomUUID()}`;
}

/**
 * Run a single pipeline step against Gemini.
 * Stubbed with setTimeout + fake structured data.
 *
 * @param {import('./pipelineEngine').StepKey} stepKey
 * @param {import('./pipelineEngine').PipelineProject} project
 */
async function runStep(stepKey, project) {
  await delay(STUB_DELAY_MS);

  const db = getDb();

  switch (stepKey) {
    case 'style':
      return {
        style: 'Warm storybook watercolor with soft edges, muted earth tones, and gentle golden light',
      };
    case 'characters': {
      const characterOneId = randomUUID();
      const characterTwoId = randomUUID();
      return {
        characters: [
          {
            id: characterOneId,
            name: 'Mole',
            prompt: 'Adult mole scholar in a velvet waistcoat, gentle and curious expression',
            position: 0,
          },
          {
            id: characterTwoId,
            name: 'Rat',
            prompt: 'Adult river rat in boating attire, relaxed and confident posture',
            position: 1,
          },
        ],
      };
    }
    case 'portraits': {
      const characters = db
        .prepare('SELECT id FROM characters WHERE project_id = ? ORDER BY position')
        .all(project.id);

      return {
        portraits: characters.map((character) => ({
          characterId: character.id,
          portraitPath: `data/images/${project.id}/${character.id}-portrait.png`,
        })),
      };
    }
    case 'chapters': {
      const characterNames = db
        .prepare('SELECT name FROM characters WHERE project_id = ? ORDER BY position')
        .all(project.id)
        .map((row) => row.name);

      return {
        chapters: [
          {
            id: randomUUID(),
            name: 'Chapter 1',
            prompt: 'Mole and Rat picnicking by the riverbank at sunset, wide establishing shot',
            characterNames: characterNames.slice(0, 2),
            position: 0,
          },
        ],
      };
    }
    case 'illustrations': {
      const chapters = db
        .prepare('SELECT id FROM chapters WHERE project_id = ? ORDER BY position')
        .all(project.id);

      return {
        illustrations: chapters.map((chapter) => ({
          chapterId: chapter.id,
          illustrationPath: `data/images/${project.id}/${chapter.id}-illustration.png`,
        })),
      };
    }
    default:
      throw new Error(`Unknown step: ${stepKey}`);
  }
}

module.exports = {
  runStep,
  uploadBookText,
};
