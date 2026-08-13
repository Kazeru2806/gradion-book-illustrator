const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { GoogleGenAI } = require('@google/genai');

const { getDb } = require('./db');
const { getImagesDir, imageDbPath, imageStoragePath, resolveStoredImagePath } = require('./paths');

const USE_STUB = process.env.GEMINI_USE_STUB === '1';

const CHARACTERS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
    },
    required: ['name', 'prompt'],
  },
};

const CHAPTERS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
      characters: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['name', 'prompt', 'characters'],
  },
};

const ADULT_CHARACTERS_PROMPT =
  'Identify the main adult characters in this book. Only include adult characters — no children or minors. ' +
  'The image model cannot generate child characters in some regions, so exclude anyone who is not clearly an adult. ' +
  'Return a JSON array of objects with "name" and "prompt", where prompt is a detailed portrait image prompt for that character.';

/** @type {GoogleGenAI | null} */
let client = null;

function getClient() {
  if (USE_STUB) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }

  return client;
}

function getTextModel() {
  const model = process.env.GEMINI_TEXT_MODEL;
  if (!model) {
    throw new Error('GEMINI_TEXT_MODEL is not configured');
  }
  return model;
}

function getImageModel() {
  const model = process.env.GEMINI_IMAGE_MODEL;
  if (!model) {
    throw new Error('GEMINI_IMAGE_MODEL is not configured');
  }
  return model;
}

function loadProjectRow(projectId) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

function saveBookInteractionId(projectId, interactionId) {
  getDb()
    .prepare('UPDATE projects SET book_interaction_id = ? WHERE id = ?')
    .run(interactionId, projectId);
}

function savePortraitInteractionId(projectId, interactionId) {
  getDb()
    .prepare('UPDATE projects SET portrait_interaction_id = ? WHERE id = ?')
    .run(interactionId, projectId);
}

function ensureImageDir(projectId) {
  const dir = path.join(getImagesDir(), projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const DEFAULT_IMAGE_MIME_TYPE = 'image/jpeg';

function extensionFromMimeType(mimeType) {
  const normalized = (mimeType || DEFAULT_IMAGE_MIME_TYPE).toLowerCase();
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  if (map[normalized]) {
    return map[normalized];
  }

  const subtype = normalized.split('/')[1];
  return subtype === 'jpeg' ? 'jpg' : subtype || 'jpg';
}

function mimeTypeFromPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext] || DEFAULT_IMAGE_MIME_TYPE;
}

function saveImage(absolutePath, base64Data) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, Buffer.from(base64Data, 'base64'));
}

/**
 * @param {import('@google/genai').GoogleGenAIInteraction} interaction
 * @returns {{ data: string, mimeType: string }}
 */
function extractOutputImage(interaction) {
  if (interaction.output_image?.data) {
    return {
      data: interaction.output_image.data,
      mimeType: interaction.output_image.mime_type || DEFAULT_IMAGE_MIME_TYPE,
    };
  }

  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') {
      continue;
    }
    for (const content of step.content ?? []) {
      if (content.type === 'image' && content.data) {
        return {
          data: content.data,
          mimeType: content.mime_type || DEFAULT_IMAGE_MIME_TYPE,
        };
      }
    }
  }

  throw new Error('Gemini returned no image data');
}

/**
 * @param {import('@google/genai').GoogleGenAIInteraction} interaction
 */
function parseJsonOutput(interaction) {
  const text = interaction.output_text?.trim();
  if (!text) {
    throw new Error('Gemini returned no text output');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

function wrapGeminiError(err, context) {
  if (err instanceof Error) {
    return new Error(`${context}: ${err.message}`);
  }
  return new Error(`${context}: ${String(err)}`);
}

async function createTextInteraction(params) {
  try {
    const ai = getClient();
    return await ai.interactions.create({
      model: getTextModel(),
      store: true,
      stream: false,
      ...params,
    });
  } catch (err) {
    throw wrapGeminiError(err, 'Gemini text interaction failed');
  }
}

async function createImageInteraction(params) {
  try {
    const ai = getClient();
    return await ai.interactions.create({
      model: getImageModel(),
      store: true,
      stream: false,
      response_format: {
        type: 'image',
        mime_type: DEFAULT_IMAGE_MIME_TYPE,
      },
      ...params,
    });
  } catch (err) {
    throw wrapGeminiError(err, 'Gemini image interaction failed');
  }
}

async function uploadBookFile(bookText, title) {
  const ai = getClient();
  const tmpPath = path.join(os.tmpdir(), `book-${randomUUID()}.txt`);

  try {
    fs.writeFileSync(tmpPath, bookText, 'utf8');
    const file = await ai.files.upload({
      file: tmpPath,
      config: {
        mimeType: 'text/plain',
        displayName: title || 'book.txt',
      },
    });

    if (!file.uri) {
      throw new Error('Gemini File API did not return a file reference');
    }

    return file.uri;
  } catch (err) {
    throw wrapGeminiError(err, 'Gemini book upload failed');
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

async function startBookInteraction(bookFileRef) {
  const interaction = await createTextInteraction({
    input: [
      {
        type: 'document',
        uri: bookFileRef,
        mime_type: 'text/plain',
      },
      {
        type: 'text',
        text: 'Read this book in full. You will be asked to define an illustration style, identify adult characters, and propose chapter scenes in later steps. Remember the story, tone, and setting.',
      },
    ],
  });

  if (!interaction.id) {
    throw new Error('Gemini did not return an interaction id for the book');
  }

  return interaction.id;
}

/**
 * Upload book text once via File API and seed the text interaction chain.
 *
 * @param {string} bookText
 * @param {string} title
 * @returns {Promise<{ bookFileRef: string, bookInteractionId: string }>}
 */
async function uploadBookAndInitialize(bookText, title) {
  if (!bookText?.trim()) {
    throw new Error('Book text is empty');
  }

  if (USE_STUB) {
    return {
      bookFileRef: `files/stub-${randomUUID()}`,
      bookInteractionId: `interaction/stub-${randomUUID()}`,
    };
  }

  const bookFileRef = await uploadBookFile(bookText, title);
  const bookInteractionId = await startBookInteraction(bookFileRef);

  return { bookFileRef, bookInteractionId };
}

/**
 * @param {import('./pipelineEngine').StepKey} stepKey
 * @param {import('./pipelineEngine').PipelineProject} project
 * @param {{ userStyle?: string }} [options]
 */
async function runStep(stepKey, project, options = {}) {
  if (USE_STUB) {
    return runStepStub(stepKey, project);
  }

  const row = loadProjectRow(project.id);
  if (!row) {
    throw new Error('Project not found');
  }

  switch (stepKey) {
    case 'style':
      return runStyleStep(row, options.userStyle);
    case 'characters':
      return runCharactersStep(row);
    case 'portraits':
      return runPortraitsStep(row);
    case 'chapters':
      return runChaptersStep(row);
    case 'illustrations':
      return runIllustrationsStep(row);
    default:
      throw new Error(`Unknown step: ${stepKey}`);
  }
}

/**
 * @param {Record<string, unknown>} project
 * @param {string | undefined} userStyle
 */
async function runStyleStep(project, userStyle) {
  if (!project.book_interaction_id) {
    throw new Error('Book interaction has not been initialized for this project');
  }

  const prompt = userStyle?.trim()
    ? `Use this illustration style for all artwork in this project:\n\n${userStyle.trim()}`
    : 'Propose a single cohesive illustration style for this book that will work for character portraits and chapter scenes. Reply with only the style description in 2-4 sentences.';

  const interaction = await createTextInteraction({
    previous_interaction_id: project.book_interaction_id,
    input: prompt,
  });

  const style = interaction.output_text?.trim();
  if (!style) {
    throw new Error('Gemini returned no style description');
  }

  saveBookInteractionId(project.id, interaction.id);

  return {
    style: userStyle?.trim() || style,
  };
}

/** @param {Record<string, unknown>} project */
async function runCharactersStep(project) {
  if (!project.book_interaction_id) {
    throw new Error('Style interaction has not been established for this project');
  }

  const interaction = await createTextInteraction({
    previous_interaction_id: project.book_interaction_id,
    input: ADULT_CHARACTERS_PROMPT,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: CHARACTERS_SCHEMA,
    },
  });

  const parsed = parseJsonOutput(interaction);
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini characters response was not an array');
  }

  saveBookInteractionId(project.id, interaction.id);

  return {
    characters: parsed.slice(0, 2).map((character, index) => ({
      id: randomUUID(),
      name: character.name,
      prompt: character.prompt,
      position: index,
    })),
  };
}

/** @param {Record<string, unknown>} project */
async function runPortraitsStep(project) {
  if (!project.style) {
    throw new Error('Illustration style must be set before generating portraits');
  }

  const characters = getDb()
    .prepare('SELECT id, name, prompt FROM characters WHERE project_id = ? ORDER BY position')
    .all(project.id)
    .slice(0, 2);

  if (characters.length === 0) {
    throw new Error('No characters found to illustrate');
  }

  ensureImageDir(project.id);

  let previousInteractionId = project.portrait_interaction_id || undefined;
  const portraits = [];

  for (const character of characters) {
    const interaction = await createImageInteraction({
      previous_interaction_id: previousInteractionId,
      input: [
        {
          type: 'text',
          text:
            `Illustration style: ${project.style}\n\n` +
            `Generate a character portrait for ${character.name}. ${character.prompt}`,
        },
      ],
    });

    const { data, mimeType } = extractOutputImage(interaction);
    const ext = extensionFromMimeType(mimeType);
    const filename = `${character.id}.${ext}`;
    saveImage(imageStoragePath(project.id, filename), data);

    portraits.push({
      characterId: character.id,
      portraitPath: imageDbPath(project.id, filename),
    });

    previousInteractionId = interaction.id;
  }

  if (previousInteractionId) {
    savePortraitInteractionId(project.id, previousInteractionId);
  }

  return { portraits };
}

/** @param {Record<string, unknown>} project */
async function runChaptersStep(project) {
  if (!project.book_interaction_id) {
    throw new Error('Characters interaction has not been established for this project');
  }

  const interaction = await createTextInteraction({
    previous_interaction_id: project.book_interaction_id,
    input:
      'Propose chapter illustration scenes for this book. Return a JSON array of objects with "name", "prompt", and "characters", ' +
      'where "characters" lists the names of adult characters who appear in that scene.',
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: CHAPTERS_SCHEMA,
    },
  });

  const parsed = parseJsonOutput(interaction);
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini chapters response was not an array');
  }

  saveBookInteractionId(project.id, interaction.id);

  return {
    chapters: parsed.slice(0, 1).map((chapter, index) => ({
      id: randomUUID(),
      name: chapter.name,
      prompt: chapter.prompt,
      characterNames: chapter.characters,
      position: index,
    })),
  };
}

/** @param {Record<string, unknown>} project */
async function runIllustrationsStep(project) {
  if (!project.style) {
    throw new Error('Illustration style must be set before generating illustrations');
  }

  const chapters = getDb()
    .prepare(
      `
      SELECT id, name, prompt, character_names_json
      FROM chapters
      WHERE project_id = ?
      ORDER BY position
    `
    )
    .all(project.id)
    .slice(0, 1);

  if (chapters.length === 0) {
    throw new Error('No chapters found to illustrate');
  }

  ensureImageDir(project.id);

  const illustrations = [];

  for (const chapter of chapters) {
    const characterNames = JSON.parse(chapter.character_names_json);
    const characters = getDb()
      .prepare(
        `
        SELECT id, name, portrait_path
        FROM characters
        WHERE project_id = ?
        ORDER BY position
      `
      )
      .all(project.id);

    const referencedCharacters = characters.filter((character) => characterNames.includes(character.name));

    if (referencedCharacters.length === 0) {
      throw new Error(`Chapter "${chapter.name}" references no known characters with saved portraits`);
    }

    /** @type {Array<{ type: string, text?: string, data?: string, mime_type?: string }>} */
    const input = [
      {
        type: 'text',
        text:
          `Illustration style: ${project.style}\n\n` +
          `Generate a chapter illustration scene for "${chapter.name}". ${chapter.prompt}\n\n` +
          'Use the attached portrait reference images so the characters stay visually consistent.',
      },
    ];

    for (const character of referencedCharacters) {
      if (!character.portrait_path) {
        throw new Error(`Portrait file missing for character "${character.name}"`);
      }

      const absolutePortraitPath = resolveStoredImagePath(character.portrait_path);
      if (!absolutePortraitPath || !fs.existsSync(absolutePortraitPath)) {
        throw new Error(`Portrait file not found on disk for character "${character.name}"`);
      }

      input.push({
        type: 'image',
        data: fs.readFileSync(absolutePortraitPath).toString('base64'),
        mime_type: mimeTypeFromPath(absolutePortraitPath),
      });
    }

    const interaction = await createImageInteraction({ input });
    const { data, mimeType } = extractOutputImage(interaction);
    const ext = extensionFromMimeType(mimeType);
    const filename = `chapter-${chapter.id}.${ext}`;
    saveImage(imageStoragePath(project.id, filename), data);

    illustrations.push({
      chapterId: chapter.id,
      illustrationPath: imageDbPath(project.id, filename),
    });
  }

  return { illustrations };
}

/** Stub path for tests without API quota. */
async function runStepStub(stepKey, project) {
  await new Promise((resolve) => setTimeout(resolve, 50));
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
      ensureImageDir(project.id);
      const characters = db
        .prepare('SELECT id FROM characters WHERE project_id = ? ORDER BY position')
        .all(project.id)
        .slice(0, 2);

      return {
        portraits: characters.map((character) => {
          const filename = `${character.id}.jpg`;
          saveImage(imageStoragePath(project.id, filename), Buffer.from('stub').toString('base64'));
          return {
            characterId: character.id,
            portraitPath: imageDbPath(project.id, filename),
          };
        }),
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
        .all(project.id)
        .slice(0, 1);

      ensureImageDir(project.id);

      return {
        illustrations: chapters.map((chapter) => {
          const filename = `chapter-${chapter.id}.jpg`;
          saveImage(imageStoragePath(project.id, filename), Buffer.from('stub').toString('base64'));
          return {
            chapterId: chapter.id,
            illustrationPath: imageDbPath(project.id, filename),
          };
        }),
      };
    }
    default:
      throw new Error(`Unknown step: ${stepKey}`);
  }
}

module.exports = {
  runStep,
  uploadBookAndInitialize,
};
