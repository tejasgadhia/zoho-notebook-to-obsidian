/**
 * Generate safe filenames and folder names with deduplication.
 */

// Characters illegal on Windows/macOS/Linux filesystems
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;

// Windows device names that silently discard data or cause I/O errors
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

/**
 * Build a map from note index to { folder, filename }.
 * Deduplicates titles within the same notebook folder.
 */
export function buildNameMap(notes) {
  const nameMap = new Map();

  // Group notes by notebook folder
  const byFolder = new Map();
  for (let i = 0; i < notes.length; i++) {
    const folder = toFolderName(notes[i].notebook);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(i);
  }

  // Within each folder, deduplicate titles (ordered by creation date)
  for (const [folder, indices] of byFolder) {
    // Sort by creation date for consistent dedup numbering
    indices.sort((a, b) => {
      const dateA = notes[a].createdDate || '';
      const dateB = notes[b].createdDate || '';
      return dateA.localeCompare(dateB);
    });

    const titleCounts = new Map();
    for (const idx of indices) {
      const baseTitle = sanitizeFilename(notes[idx].title || 'Untitled');

      const count = titleCounts.get(baseTitle) || 0;
      titleCounts.set(baseTitle, count + 1);

      const filename = count === 0
        ? `${baseTitle}.md`
        : `${baseTitle} ${count + 1}.md`;

      nameMap.set(idx, { folder, filename });
    }
  }

  return nameMap;
}

function toFolderName(notebook) {
  return notebook
    .replace(/\u202f/g, ' ')         // Narrow no-break space → regular space
    .replace(/\u00a0/g, ' ')         // Non-breaking space → regular space
    .toLowerCase()
    .replace(ILLEGAL_CHARS, '')
    .replace(/\.+/g, '')             // Strip dots (prevents ".." path traversal)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'uncategorized';
}

function sanitizeFilename(title) {
  let name = title
    .replace(/\u202f/g, ' ')    // Narrow no-break space → regular space
    .replace(/\u00a0/g, ' ')    // Non-breaking space → regular space
    .replace(/[\x00-\x1F\x7F]/g, '') // Strip all control characters (null, newline, tab, etc.)
    .replace(/[\u0080-\u009F]/g, '') // Strip C1 control characters
    .replace(/[\u2028\u2029]/g, ' ') // Unicode line/paragraph separators → space
    .replace(ILLEGAL_CHARS, '')
    .trim() || 'Untitled';

  // Avoid Windows device names (NUL.md silently discards data)
  if (WINDOWS_RESERVED.test(name)) {
    name = `_${name}`;
  }

  // Cap filename length (255 bytes on most filesystems, leave room for .md + dedup suffix)
  const MAX_FILENAME_BYTES = 200;
  if (Buffer.byteLength(name, 'utf8') > MAX_FILENAME_BYTES) {
    while (Buffer.byteLength(name, 'utf8') > MAX_FILENAME_BYTES) {
      name = name.slice(0, -1);
    }
    // Avoid leaving a lone high surrogate from emoji/CJK truncation
    const lastCode = name.charCodeAt(name.length - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      name = name.slice(0, -1);
    }
    name = name.trimEnd();
  }

  return name || 'Untitled';
}
