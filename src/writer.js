import fs from 'node:fs';
import path from 'node:path';
import { normalizeFilename } from './utils.js';

/**
 * Write converted notes and copy referenced files to the output directory.
 */
export function writeOutput(notes, converted, nameMap, dataDir, outputDir, options = {}) {
  const stats = {
    total: notes.length,
    empty: 0,
    videoLost: 0,
    images: 0,
    files: 0,
    audio: 0,
    notebooks: new Set(),
  };

  // Create output and attachments directories
  const attachmentsDir = path.join(outputDir, 'attachments');
  fs.mkdirSync(attachmentsDir, { recursive: true });

  const copiedFiles = new Set();
  const warnedFiles = new Set();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const { markdown, body } = converted[i];
    const { folder, filename } = nameMap.get(i);

    stats.notebooks.add(folder);

    // Skip empty notes if requested
    if (options.skipEmpty && !body.trim()) {
      stats.empty++;
      if (options.verbose) {
        console.log(`  SKIP (empty): ${note.title}`);
      }
      continue;
    }

    // Track empty/video notes for summary
    if (!body.trim()) {
      stats.empty++;
    }
    if (body.includes('Video content was not included')) {
      stats.videoLost++;
    }

    // Create notebook folder (with path traversal guard)
    const folderPath = path.join(outputDir, folder);
    if (!path.resolve(folderPath).startsWith(path.resolve(outputDir) + path.sep)) {
      console.warn(`  SKIP: notebook folder "${folder}" would escape output directory`);
      continue;
    }
    fs.mkdirSync(folderPath, { recursive: true });

    // Write markdown file
    const filePath = path.join(folderPath, filename);
    fs.writeFileSync(filePath, markdown, 'utf-8');

    if (options.verbose) {
      console.log(`  ${folder}/${filename}`);
    }

    // Copy referenced images
    for (const img of note.images) {
      if (copiedFiles.has(img) || warnedFiles.has(img)) continue;
      if (safeCopy(dataDir, img, attachmentsDir, normalizeFilename(img))) {
        copiedFiles.add(img);
        stats.images++;
      } else {
        warnedFiles.add(img);
      }
    }

    // Copy referenced attachments
    for (const att of note.attachments) {
      if (copiedFiles.has(att) || warnedFiles.has(att)) continue;
      const destName = normalizeFilename(att);
      if (safeCopy(dataDir, att, attachmentsDir, destName)) {
        copiedFiles.add(att);
        const ext = path.extname(destName);
        if (!ext) {
          stats.audio++;
        } else {
          stats.files++;
        }
      } else {
        warnedFiles.add(att);
      }
    }
  }

  // Print summary
  const parts = [`Converted ${stats.total} notes`];
  if (stats.empty > 0) parts.push(`${stats.empty} empty`);
  if (stats.videoLost > 0) parts.push(`${stats.videoLost} video lost`);
  parts.push(`across ${stats.notebooks.size} notebooks`);

  const fileParts = [];
  if (stats.images > 0) fileParts.push(`${stats.images} images`);
  if (stats.files > 0) fileParts.push(`${stats.files} files`);
  if (stats.audio > 0) fileParts.push(`${stats.audio} audio`);

  let summary = parts.join(', ') + '.';
  if (fileParts.length > 0) {
    summary += ' ' + fileParts.join(', ') + ' copied.';
  }

  console.log(summary);
  return stats;
}

function safeCopy(srcBase, filename, destBase, destFilename) {
  const src = path.resolve(srcBase, filename);
  const dest = path.resolve(destBase, destFilename);
  if (!src.startsWith(path.resolve(srcBase) + path.sep)) {
    console.warn(`  WARN: Skipping file outside source directory: ${filename}`);
    return false;
  }
  if (!dest.startsWith(path.resolve(destBase) + path.sep)) {
    console.warn(`  WARN: Skipping file outside attachments directory: ${destFilename}`);
    return false;
  }
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  console.warn(`  WARN: File not found: ${filename}`);
  return false;
}
