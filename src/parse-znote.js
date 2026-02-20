import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as cheerio from 'cheerio';
import { extract } from 'tar';

/**
 * Parse an entire Znote-format export directory.
 * Returns { notes: NoteData[], cleanup } where cleanup removes extracted tar temp dirs.
 */
export function parseZnoteExport(dataDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-znote-'));

  const cleanup = () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  try {
    const notes = [];
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const notebookDir = path.join(dataDir, entry.name);
      const metaPath = path.join(notebookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      const meta = readMetaJson(metaPath);
      if (!meta || meta.data_type !== 'NOTEBOOK') continue;

      // Find all .znote files in this notebook folder
      const znoteFiles = fs.readdirSync(notebookDir)
        .filter(f => f.endsWith('.znote'))
        .map(f => path.join(notebookDir, f));

      for (const znotePath of znoteFiles) {
        const note = parseZnote(znotePath, meta, tempDir);
        if (note) notes.push(note);
      }
    }

    return { notes, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Parse a single .znote tar archive into a NoteData object.
 */
function parseZnote(znotePath, notebookMeta, tempDir) {
  const znoteFilename = path.basename(znotePath);
  const noteId = path.basename(znotePath, '.znote');

  if (noteId === '.' || noteId === '..' || noteId.includes(path.sep)) {
    console.warn(`  WARN: Suspicious note ID "${noteId}" in ${znoteFilename}, skipping`);
    return null;
  }

  // Extract tar to temp directory
  const extractDir = path.join(tempDir, noteId);
  fs.mkdirSync(extractDir, { recursive: true });

  extract({
    file: znotePath,
    cwd: extractDir,
    sync: true,
  });

  // Find Note.znel inside the extracted tar
  const znelPath = path.join(extractDir, noteId, 'Note.znel');
  if (!fs.existsSync(znelPath)) {
    console.warn(`  WARN: No Note.znel found in ${znoteFilename}`);
    return null;
  }

  const znelContent = fs.readFileSync(znelPath, 'utf-8');

  // Parse XML envelope
  const $xml = cheerio.load(znelContent, { xmlMode: true });

  const title = $xml('ZTitle').first().text().trim() || 'Untitled';
  const createdDate = $xml('ZCreatedDate').first().text().trim() || null;
  const modifiedDate = $xml('ZModifiedDate').first().text().trim() || null;
  const color = $xml('ZNoteColor').first().text().trim() || null;
  const noteType = $xml('ZNoteType').first().text().trim() || null;

  // Extract CDATA content from ZContent
  const zContentEl = $xml('ZContent').first();
  let contentHtml = '';

  // cheerio in xmlMode may not parse CDATA properly — extract manually
  const cdataMatch = znelContent.match(/<ZContent><!\[CDATA\[([\s\S]*?)\]\]><\/ZContent>/);
  if (cdataMatch) {
    contentHtml = cdataMatch[1];
  } else {
    // Fallback: cheerio may have parsed it as text
    contentHtml = zContentEl.text() || '';
  }

  // Normalize Znote-specific self-closing tags before parsing.
  // In non-XML mode, cheerio treats unknown self-closing tags (like <znresource/>)
  // as unclosed — they swallow subsequent siblings as children. Convert to explicit
  // open+close pairs so cheerio handles them correctly.
  // The regex respects quoted attribute values (which may contain ">").
  const selfCloseAttrs = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
  contentHtml = contentHtml
    .replace(new RegExp(`<znresource(\\s${selfCloseAttrs})?/>`, 'g'), '<znresource$1></znresource>')
    .replace(new RegExp(`<checkbox(\\s${selfCloseAttrs})?/>`, 'g'), '<checkbox$1></checkbox>');

  // Parse the HTML content with cheerio (non-XML mode for Zoho HTML quirks)
  const $ = cheerio.load(contentHtml, { xmlMode: false });

  // Handle double-nested <content><content>
  let $content = $('content').first();
  if ($content.length === 0) {
    // Self-closing <content/> or empty — create a wrapper
    $content = $.root();
  } else if ($content.children().length === 1 && $content.children().first().is('content')) {
    $content = $content.children().first();
  }

  // Collect images and attachments from znresource elements
  const images = [];
  const attachments = [];

  $content.find('znresource').each((_, el) => {
    const relativePath = $(el).attr('relative-path');
    if (!relativePath) return;

    const type = $(el).attr('type') || '';
    const consumers = $(el).attr('consumers') || '';

    if (type.startsWith('image/') || consumers.includes('sketch')) {
      images.push(relativePath);
    } else {
      attachments.push(relativePath);
    }
  });

  // Also check for regular <img> and <a> tags (same as HTML parser)
  $content.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('http')) {
      images.push(src);
    }
  });

  $content.find('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('http') && !href.startsWith('zohonotebook://') && !href.startsWith('mailto:')) {
      attachments.push(href);
    }
  });

  // The directory where this note's attachments live (inside extracted tar)
  const attachmentDir = path.join(extractDir, noteId);

  return {
    sourceFile: znoteFilename,
    noteId,
    notebook: notebookMeta.name || 'Uncategorized',
    title,
    color,
    createdDate,
    modifiedDate,
    noteType,
    $content,
    $,
    images,
    attachments,
    attachmentDir,
  };
}

function readMetaJson(metaPath) {
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  WARN: Could not parse ${metaPath}: ${err.message}`);
    return null;
  }
}
