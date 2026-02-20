import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

/**
 * Parse a Zoho Notebook HTML file into a NoteData object.
 */
export function parseNote(htmlFilePath) {
  const html = fs.readFileSync(htmlFilePath, 'utf-8');
  const $ = cheerio.load(html, { xmlMode: false });

  const body = $('body');
  const title = $('title').text().trim() || 'Untitled';

  // Parse JSON from data attributes (cheerio auto-decodes HTML entities)
  const notebookData = parseJsonAttr(body.attr('data-notebook'));
  const notecardData = parseJsonAttr(body.attr('data-notecard'));

  // Get the <content> element — handle double-nested <content><content>
  let $content = $('content').first();
  if ($content.children().length === 1 && $content.children().first().is('content')) {
    $content = $content.children().first();
  }

  // Collect referenced images and files
  const images = [];
  const attachments = [];

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

  return {
    sourceFile: path.basename(htmlFilePath),
    notebook: notebookData?.name || 'Uncategorized',
    title: notecardData?.name || title,
    color: notecardData?.color || null,
    createdDate: notecardData?.created_date || notebookData?.created_date || null,
    modifiedDate: notecardData?.modified_date || notebookData?.modified_date || null,
    $content,
    $,
    images,
    attachments,
  };
}

function parseJsonAttr(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
