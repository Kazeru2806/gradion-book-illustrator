#!/usr/bin/env node
/**
 * Check text + image model access for the configured API key.
 * Probes several image models — free tier often shows limit:0 on ALL of them.
 *
 * Run: npm run check-quota   (from server/)
 */
require('../env.js');
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
const textModel = process.env.GEMINI_TEXT_MODEL;
const configuredImageModel = process.env.GEMINI_IMAGE_MODEL;

/** Image models to probe, oldest/cheapest first. IDs without "models/" prefix. */
const IMAGE_MODEL_CANDIDATES = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
];

if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in server/.env');
  process.exit(1);
}

if (!textModel) {
  console.error('GEMINI_TEXT_MODEL is not set in server/.env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

/**
 * @param {unknown} err
 * @returns {'ok' | '429_limit_0' | '429' | 'not_found' | 'other'}
 */
function classifyError(err) {
  const message = err instanceof Error ? err.message : String(err);
  if (/404|not found|NOT_FOUND/i.test(message)) return 'not_found';
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) {
    return /limit:\s*0|limit: 0|quotaValue.*["']0["']/i.test(message) ? '429_limit_0' : '429';
  }
  return 'other';
}

async function testText() {
  const res = await ai.models.generateContent({ model: textModel, contents: 'Reply with OK' });
  if (!res.text?.trim()) throw new Error('empty response');
}

async function testImageModel(model) {
  const interaction = await ai.interactions.create({
    model,
    store: false,
    stream: false,
    response_format: { type: 'image', mime_type: 'image/jpeg' },
    input: [{ type: 'text', text: 'A simple red circle on a white background' }],
  });
  if (!interaction.output_image?.data && !interaction.steps?.length) {
    throw new Error('no image in response');
  }
}

(async () => {
  console.log(`Text model:       ${textModel}`);
  console.log(`Configured image: ${configuredImageModel || '(not set)'}\n`);

  process.stdout.write(`Text (${textModel})… `);
  try {
    await testText();
    console.log('OK');
  } catch (err) {
    console.log('FAILED');
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log('\nImage model comparison (free tier is often limit:0 on all):');
  console.log('─'.repeat(56));

  /** @type {string | null} */
  let firstWorking = null;

  for (const model of IMAGE_MODEL_CANDIDATES) {
    const label = model.padEnd(32);
    process.stdout.write(`${label} `);
    try {
      await testImageModel(model);
      console.log('OK ✓');
      if (!firstWorking) firstWorking = model;
    } catch (err) {
      const kind = classifyError(err);
      if (kind === '429_limit_0') console.log('429 — free tier limit: 0 (not allocated)');
      else if (kind === '429') console.log('429 — quota/rate limit');
      else if (kind === 'not_found') console.log('not available for this key');
      else console.log(`FAILED — ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('─'.repeat(56));

  if (firstWorking) {
    if (configuredImageModel !== firstWorking) {
      console.log(`\nWorking model found: ${firstWorking}`);
      console.log(`Set in server/.env: GEMINI_IMAGE_MODEL=${firstWorking}`);
    } else {
      console.log(`\nConfigured model (${configuredImageModel}) works.`);
    }
    process.exit(0);
  }

  console.log(`
No image model worked on this key.

Google's official pricing lists "Not available" for free tier on all native
image models (2.5 Flash Image, 3.1 Flash Image, etc.). limit:0 means your
project has no free image allocation — not that you used it up. Switching
from 3.1 to 2.5 does not help when both show limit:0.

Options:
  1. Enable billing: https://aistudio.google.com/app/settings/billing
  2. Check limits:   https://ai.dev/rate-limit
  3. Local dev only: GEMINI_USE_STUB=1 in server/.env
`);
  process.exit(1);
})();
