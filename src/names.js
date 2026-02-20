/**
 * Generate safe filenames and folder names with deduplication.
 */

// Characters illegal on Windows/macOS/Linux filesystems
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;

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
    .toLowerCase()
    .replace(ILLEGAL_CHARS, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'uncategorized';
}

function sanitizeFilename(title) {
  return title
    .replace(/\u202f/g, ' ')  // Narrow no-break space → regular space
    .replace(/\u00a0/g, ' ')  // Non-breaking space → regular space
    .replace(ILLEGAL_CHARS, '')
    .trim() || 'Untitled';
}
