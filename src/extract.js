import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Extract input from a zip file or directory.
 * Returns { dataDir, cleanup } where dataDir is the path containing HTML files.
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-to-obsidian-'));

  const cleanup = () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  try {
    zip.extractAllTo(tempDir, true);
    // Look for a numbered subfolder (Zoho export ID)
    const dataDir = findDataDir(tempDir);
    return { dataDir, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

function extractDir(dirPath) {
  const dataDir = findDataDir(dirPath);
  const cleanup = () => {};
  return { dataDir, cleanup };
}

function findDataDir(baseDir) {
  // Check if baseDir itself contains HTML files
  if (hasHtmlFiles(baseDir)) {
    return baseDir;
  }

  // Look for numbered subfolder (Zoho export ID like 60040376304)
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
      const subDir = path.join(baseDir, entry.name);
      if (hasHtmlFiles(subDir)) {
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
          if (hasHtmlFiles(deepDir)) {
            return deepDir;
          }
        }
      }
    }
  }

  throw new Error(
    'No Zoho Notebook HTML files found. Expected a folder containing .html files ' +
    '(typically inside a numbered subfolder like 60040376304/).'
  );
}

function hasHtmlFiles(dir) {
  const entries = fs.readdirSync(dir);
  return entries.some(f => f.endsWith('.html') && f !== 'index.html');
}
