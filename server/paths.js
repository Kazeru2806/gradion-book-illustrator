const fs = require('fs');
const path = require('path');

const SERVER_ROOT = __dirname;

function getImagesDir() {
  if (process.env.IMAGES_DIR) {
    return path.resolve(process.env.IMAGES_DIR);
  }
  return path.join(SERVER_ROOT, 'data', 'images');
}

function imageStoragePath(projectId, filename) {
  return path.join(getImagesDir(), projectId, filename);
}

/** Stable path stored in the database (relative to server root). */
function imageDbPath(projectId, filename) {
  return path.join('data', 'images', projectId, filename);
}

function resolveStoredImagePath(storedPath) {
  if (!storedPath) {
    return null;
  }
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  const normalized = storedPath.replace(/^\.\.\//, '');
  return path.join(SERVER_ROOT, normalized);
}

function deleteProjectImages(projectId) {
  const dir = path.join(getImagesDir(), projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  SERVER_ROOT,
  deleteProjectImages,
  getImagesDir,
  imageDbPath,
  imageStoragePath,
  resolveStoredImagePath,
};
