import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Extract input from a zip file or directory.
 * Returns { dataDir, format, cleanup } where dataDir is the root data directory
 * and format is 'html' or 'znote'.
 */
export function extractInput(inputPath) {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isFile() && resolved.endsWith('.zip')) {
    return extractZip(resolved);
  }

  if (stat.isDirectory()) {
    return extractDir(resolved);
  }

  throw new Error(`Input must be a .zip file or directory: ${inputPath}`);
}

function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-notebook-to-obsidian-'));

  const cleanup = () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  try {
    const resolvedTemp = path.resolve(tempDir);
    for (const entry of zip.getEntries()) {
      if (entry.entryName.includes('\x00')) {
        throw new Error(`ZIP entry name contains null byte`);
      }
      const entryPath = path.resolve(tempDir, entry.entryName);
      if (!entryPath.startsWith(resolvedTemp + path.sep) && entryPath !== resolvedTemp) {
        throw new Error(`ZIP entry "${entry.entryName}" would extract outside temp directory`);
      }
    }
    zip.extractAllTo(tempDir, true);
    const dataDir = findDataDir(tempDir);
    const format = detectFormat(dataDir);
    return { dataDir, format, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

function extractDir(dirPath) {
  const dataDir = findDataDir(dirPath);
  const format = detectFormat(dataDir);
  const cleanup = () => {};
  return { dataDir, format, cleanup };
}

function findDataDir(baseDir) {
  // Check if baseDir itself contains note files (HTML or Znote)
  if (hasNoteFiles(baseDir)) {
    return baseDir;
  }

  // Look for numbered subfolder (Zoho export ID like 60040376304)
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
      const subDir = path.join(baseDir, entry.name);
      if (hasNoteFiles(subDir)) {
        return subDir;
      }
    }
  }

  // Check one level deeper (zip may have an extra wrapper folder)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(baseDir, entry.name);
      const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
      for (const subEntry of subEntries) {
        if (subEntry.isDirectory() && /^\d+$/.test(subEntry.name)) {
          const deepDir = path.join(subDir, subEntry.name);
          if (hasNoteFiles(deepDir)) {
            return deepDir;
          }
        }
      }
    }
  }

  throw new Error(
    'No Zoho Notebook export files found. Expected HTML files or Znote folders ' +
    '(typically inside a numbered subfolder like 60040376304/).'
  );
}

/**
 * Check if a directory contains note files — either HTML or Znote format.
 */
function hasNoteFiles(dir) {
  return hasHtmlFiles(dir) || hasZnoteFiles(dir);
}

function hasHtmlFiles(dir) {
  const entries = fs.readdirSync(dir);
  return entries.some(f => f.endsWith('.html') && f !== 'index.html');
}

/**
 * Check if a directory contains Znote notebook folders (subfolders with meta.json).
 */
function hasZnoteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some(entry => {
    if (!entry.isDirectory()) return false;
    return fs.existsSync(path.join(dir, entry.name, 'meta.json'));
  });
}

/**
 * Detect whether dataDir contains an HTML or Znote format export.
 * Returns 'znote' if notebook subfolders with meta.json exist, 'html' otherwise.
 */
export function detectFormat(dataDir) {
  // Znote: has subfolders with meta.json files
  if (hasZnoteFiles(dataDir) && !hasHtmlFiles(dataDir)) {
    return 'znote';
  }
  // If both exist, prefer znote (richer data) but warn
  if (hasZnoteFiles(dataDir) && hasHtmlFiles(dataDir)) {
    console.warn('  WARN: Both HTML and Znote files found. Using Znote format (richer metadata).');
    return 'znote';
  }
  return 'html';
}
