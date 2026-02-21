/**
 * Convert a NoteData object to Obsidian-compatible Markdown.
 */

import path from 'node:path';
import { normalizeFilename } from './utils.js';
import { getAttr, getText, findByTag } from './node-helpers.js';

const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov', '.avi', '.mkv'];

/**
 * Convert a parsed note to markdown.
 * @param {object} noteData - from parseNote()
 * @param {Map} noteIdToTitle - map of note IDs to titles for internal link resolution
 */
export function convertNote(noteData, noteIdToTitle = new Map()) {
  const frontmatter = buildFrontmatter(noteData);
  const body = convertBody(noteData, noteIdToTitle);
  const markdown = frontmatter + '\n' + body;
  return { frontmatter, body, markdown };
}

function buildFrontmatter(noteData) {
  const created = formatDate(noteData.createdDate);
  const modified = formatDate(noteData.modifiedDate);
  const notebookTag = slugify(noteData.notebook);
  const title = normalizeText(noteData.title);
  const notebook = normalizeText(noteData.notebook);

  const lines = [
    '---',
    `title: "${escapeYaml(title)}"`,
    `notebook: "${escapeYaml(notebook)}"`,
  ];

  if (created) lines.push(`created: ${created}`);
  if (modified) lines.push(`modified: ${modified}`);

  lines.push('tags:');
  lines.push('  - zoho-notebook');
  if (notebookTag && notebookTag !== 'zoho-notebook') {
    lines.push(`  - ${notebookTag}`);
  }

  lines.push('aliases:');
  lines.push(`  - "${escapeYaml(title)}"`);
  lines.push('source: zoho-notebook');
  lines.push('---');

  return lines.join('\n');
}

function convertBody(noteData, noteIdToTitle) {
  const { contentNode, title } = noteData;

  // Detect card type from content structure
  const children = contentNode.children || [];
  const nonEmptyChildren = children.filter(c => c.type === 'tag');

  // Video card: empty content, title suggests video OR noteType says video
  if (nonEmptyChildren.length === 0 && getText(contentNode).trim() === '') {
    const isVideo = VIDEO_EXTENSIONS.some(ext => title.toLowerCase().endsWith(ext))
      || noteData.noteType === 'note/video';
    if (isVideo) {
      return `> **Warning**: Video content was not included in Zoho's export. The original file "${title}" could not be recovered.\n`;
    }
    // Truly empty note
    return '';
  }

  // Photo/Sketch card: single <img> child
  if (nonEmptyChildren.length === 1 && nonEmptyChildren[0].tagName?.toLowerCase() === 'img') {
    const src = getAttr(nonEmptyChildren[0], 'src');
    if (src) {
      const cleanSrc = normalizeFilename(src);
      return `![[attachments/${cleanSrc}]]\n`;
    }
  }

  // Znote resource card: single <znresource> child (image, file, audio, sketch)
  if (nonEmptyChildren.length === 1 && nonEmptyChildren[0].tagName?.toLowerCase() === 'znresource') {
    return handleZnresourceCard(nonEmptyChildren[0], noteData);
  }

  // File card: single <a> child pointing to a local file
  if (nonEmptyChildren.length === 1 && nonEmptyChildren[0].tagName?.toLowerCase() === 'a') {
    const href = getAttr(nonEmptyChildren[0], 'href');
    if (href && !href.startsWith('http') && !href.startsWith('zohonotebook://')) {
      const cleanHref = normalizeFilename(href);
      // Audio card: file has no extension
      if (!path.extname(cleanHref)) {
        return `Attached audio: ![[attachments/${cleanHref}]]\n\n> **Note**: Audio file exported without extension. You may need to rename it (likely .m4a or .webm).\n`;
      }
      return `Attached file: ![[attachments/${cleanHref}]]\n`;
    }
  }

  // Standard text/checklist conversion
  const context = { listDepth: 0, listType: null };
  let result = walkChildren(contentNode, context, noteIdToTitle);

  // Post-process: collapse 3+ blank lines to max 2
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim trailing whitespace
  result = result.trimEnd() + '\n';

  return result;
}

function walkChildren(node, context, noteIdToTitle) {
  let result = '';
  const children = node.children || [];
  const skipSet = context._skipNodes || new Set();

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (skipSet.has(child)) continue;

    // Checkbox pattern: <input type="checkbox"><span>text</span>
    // Mark the span as consumed so it's not emitted twice
    if (child.type === 'tag' && child.tagName?.toLowerCase() === 'input') {
      const inputType = getAttr(child, 'type');
      if (inputType === 'checkbox') {
        const nextSib = children[i + 1];
        if (nextSib && nextSib.type === 'tag' && nextSib.tagName?.toLowerCase() === 'span') {
          skipSet.add(nextSib);
        }
      }
    }

    result += walkNode(child, context, noteIdToTitle);
  }

  return result;
}

function walkNode(node, context, noteIdToTitle) {
  // Text node — use node.data directly (not getText)
  if (node.type === 'text') {
    let text = node.data || '';
    // Normalize &nbsp; and \u202f to regular space
    text = text.replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ');
    return text;
  }

  if (node.type !== 'tag') return '';

  const tag = node.tagName.toLowerCase();

  // --- Block elements ---

  if (tag === 'br') {
    // Check if this is the last child of its parent
    const parent = node.parent;
    if (parent) {
      const siblings = parent.children.filter(c => c.type === 'tag' || (c.type === 'text' && c.data?.trim()));
      const lastSibling = siblings[siblings.length - 1];
      if (lastSibling === node) {
        return ''; // Trailing <br> — ignore
      }
    }
    // Check for consecutive <br> (paragraph break)
    const nextSib = node.next;
    if (nextSib && nextSib.type === 'tag' && nextSib.tagName?.toLowerCase() === 'br') {
      return '\n'; // Will combine with next br's \n to make \n\n
    }
    return '\n';
  }

  if (tag === 'hr') {
    return '---\n\n';
  }

  if (tag === 'div') {
    return handleDiv(node, context, noteIdToTitle);
  }

  if (tag === 'p') {
    const content = walkChildren(node, context, noteIdToTitle).trim();
    if (!content) return '\n';
    return content + '\n\n';
  }

  if (tag === 'blockquote') {
    const inner = walkChildren(node, context, noteIdToTitle).trim();
    const quoted = inner.split('\n').map(line => `> ${line}`).join('\n');
    return quoted + '\n\n';
  }

  if (tag === 'pre') {
    const text = getText(node);
    return '```\n' + text + '\n```\n\n';
  }

  if (tag === 'table') {
    return handleTable(node, context, noteIdToTitle);
  }

  // --- Lists ---

  if (tag === 'ul' || tag === 'ol') {
    const prevType = context.listType;
    const prevDepth = context.listDepth;

    // If nested list directly inside another list (invalid HTML from Zoho)
    const parentTag = node.parent?.tagName?.toLowerCase();
    if (parentTag === 'ul' || parentTag === 'ol') {
      context.listDepth += 1;
    }

    context.listType = tag === 'ul' ? 'ul' : 'ol';
    const result = walkChildren(node, context, noteIdToTitle);

    context.listType = prevType;
    context.listDepth = prevDepth;

    // Add trailing newline after top-level list
    if (parentTag !== 'ul' && parentTag !== 'ol' && parentTag !== 'li') {
      return result + '\n';
    }
    return result;
  }

  if (tag === 'li') {
    return handleListItem(node, context, noteIdToTitle);
  }

  // --- Inline elements ---

  if (tag === 'strong' || tag === 'b') {
    const inner = walkChildren(node, context, noteIdToTitle);
    const trimmed = inner.trim();
    if (!trimmed) return inner;
    return `**${trimmed}**`;
  }

  if (tag === 'em' || tag === 'i') {
    const inner = walkChildren(node, context, noteIdToTitle);
    const trimmed = inner.trim();
    if (!trimmed) return inner;
    return `*${trimmed}*`;
  }

  if (tag === 'u') {
    const inner = walkChildren(node, context, noteIdToTitle);
    const trimmed = inner.trim();
    if (!trimmed) return inner;
    return `<u>${trimmed}</u>`;
  }

  if (tag === 'strike' || tag === 's' || tag === 'del') {
    const inner = walkChildren(node, context, noteIdToTitle);
    const trimmed = inner.trim();
    if (!trimmed) return inner;
    return `~~${trimmed}~~`;
  }

  if (tag === 'span') {
    const cls = getAttr(node, 'class') || '';
    if (cls.includes('highlight')) {
      const inner = walkChildren(node, context, noteIdToTitle);
      const trimmed = inner.trim();
      if (!trimmed) return inner;
      return `==${trimmed}==`;
    }
    // All other spans: pass through (strip color, etc.)
    return walkChildren(node, context, noteIdToTitle);
  }

  if (tag === 'a') {
    return handleLink(node, context, noteIdToTitle);
  }

  if (tag === 'img') {
    const src = getAttr(node, 'src');
    if (src) {
      const cleanSrc = normalizeFilename(src);
      if (src.startsWith('http')) {
        return `![](${src})`;
      }
      return `![[attachments/${cleanSrc}]]`;
    }
    return '';
  }

  if (tag === 'input') {
    const type = getAttr(node, 'type');
    if (type === 'checkbox') {
      const checked = getAttr(node, 'checked') !== undefined;
      // Get the next sibling <span> for the label text
      const nextSib = node.next;
      let labelText = '';
      if (nextSib) {
        if (nextSib.type === 'tag' && nextSib.tagName?.toLowerCase() === 'span') {
          labelText = getText(nextSib).trim();
        } else if (nextSib.type === 'text') {
          labelText = nextSib.data?.trim() || '';
        }
      }
      return checked ? `- [x] ${labelText}\n` : `- [ ] ${labelText}\n`;
    }
    return '';
  }

  // Znote <checkbox> element: text is direct child content
  // Uses data-znote-checked (renamed from checked in parse-znote.js to survive cheerio normalization)
  if (tag === 'checkbox') {
    const checked = getAttr(node, 'data-znote-checked') === 'true';
    const labelText = walkChildren(node, context, noteIdToTitle).trim();
    return checked ? `- [x] ${labelText}\n` : `- [ ] ${labelText}\n`;
  }

  // Znote <znresource> element: inline image/file reference
  if (tag === 'znresource') {
    return handleZnresource(node);
  }

  // Headings
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1]);
    const inner = walkChildren(node, context, noteIdToTitle).trim();
    return '#'.repeat(level) + ' ' + inner + '\n\n';
  }

  // Inline code
  if (tag === 'code') {
    const inner = walkChildren(node, context, noteIdToTitle);
    if (!inner.trim()) return inner;
    return '`' + inner + '`';
  }

  // <content> tag: just recurse (it's a Zoho wrapper)
  if (tag === 'content') {
    return walkChildren(node, context, noteIdToTitle);
  }

  // Unknown tag: recurse children to never silently drop content
  return walkChildren(node, context, noteIdToTitle);
}

function handleDiv(node, context, noteIdToTitle) {
  const cls = getAttr(node, 'class') || '';

  // Checklist wrapper: transparent, just recurse
  if (cls.includes('checklist')) {
    return walkChildren(node, context, noteIdToTitle);
  }

  const children = (node.children || []).filter(c =>
    c.type === 'tag' || (c.type === 'text' && c.data?.trim())
  );

  // Empty div with only <br>
  if (children.length === 0) {
    return '\n';
  }
  if (children.length === 1 && children[0].type === 'tag' && children[0].tagName?.toLowerCase() === 'br') {
    return '\n';
  }

  // Empty bold spacer: <div><b><br></b></div> or <div><strong><br></strong></div>
  if (children.length === 1) {
    const child = children[0];
    if (child.type === 'tag' && (child.tagName?.toLowerCase() === 'b' || child.tagName?.toLowerCase() === 'strong')) {
      const innerChildren = (child.children || []).filter(c =>
        c.type === 'tag' || (c.type === 'text' && c.data?.trim())
      );
      if (innerChildren.length === 0 || (innerChildren.length === 1 && innerChildren[0].type === 'tag' && innerChildren[0].tagName?.toLowerCase() === 'br')) {
        return ''; // Skip empty bold spacer
      }
    }
  }

  // Check if div contains checkbox content — pass through without extra paragraph spacing
  const hasCheckbox = children.some(c =>
    c.type === 'tag' && (
      (c.tagName?.toLowerCase() === 'input' && getAttr(c, 'type') === 'checkbox') ||
      c.tagName?.toLowerCase() === 'checkbox'
    )
  );
  if (hasCheckbox) {
    return walkChildren(node, context, noteIdToTitle);
  }

  // Check if div has block-level children
  const hasBlockChildren = children.some(c =>
    c.type === 'tag' && isBlockElement(c.tagName?.toLowerCase())
  );

  if (!hasBlockChildren) {
    // Inline-only div: serialize as paragraph
    const content = walkChildren(node, context, noteIdToTitle).trim();
    if (!content) return '\n';
    return content + '\n\n';
  }

  // Has block children: recurse each child
  // Handle mixed content (text nodes + block elements)
  let result = '';
  let pendingInline = '';

  for (const child of node.children || []) {
    if (child.type === 'text') {
      const text = child.data?.replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ') || '';
      // Preserve ALL text including whitespace-only nodes (they may be spaces
      // between inline elements like <b>text</b> <em>more</em>)
      pendingInline += text;
    } else if (child.type === 'tag') {
      if (isBlockElement(child.tagName?.toLowerCase())) {
        if (pendingInline.trim()) {
          result += pendingInline.trim() + '\n\n';
          pendingInline = '';
        }
        result += walkNode(child, context, noteIdToTitle);
      } else {
        pendingInline += walkNode(child, context, noteIdToTitle);
      }
    }
  }

  if (pendingInline.trim()) {
    result += pendingInline.trim() + '\n\n';
  }

  return result;
}

function handleListItem(node, context, noteIdToTitle) {
  const indent = '    '.repeat(context.listDepth);
  const marker = context.listType === 'ol' ? '1. ' : '- ';

  let content = '';
  let sublist = '';

  for (const child of node.children || []) {
    if (child.type === 'tag') {
      const childTag = child.tagName?.toLowerCase();
      if (childTag === 'ul' || childTag === 'ol') {
        // Nested list
        const prevDepth = context.listDepth;
        context.listDepth += 1;
        const prevType = context.listType;
        context.listType = childTag === 'ul' ? 'ul' : 'ol';
        sublist += walkChildren(child, context, noteIdToTitle);
        context.listDepth = prevDepth;
        context.listType = prevType;
      } else if (childTag === 'div') {
        // <li><div>text</div></li> — unwrap
        content += walkChildren(child, context, noteIdToTitle).trim();
      } else {
        content += walkNode(child, context, noteIdToTitle);
      }
    } else if (child.type === 'text') {
      const text = child.data?.replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ') || '';
      content += text;
    }
  }

  content = content.trim();
  let result = `${indent}${marker}${content}\n`;
  if (sublist) {
    result += sublist;
  }
  return result;
}

function handleLink(node, context, noteIdToTitle) {
  const href = getAttr(node, 'href') || '';
  const cls = getAttr(node, 'class') || '';
  const text = walkChildren(node, context, noteIdToTitle).trim();

  // Internal note link via class
  if (cls.includes('editor-note-link') || cls.includes('rte-link')) {
    if (text) return `[[${text}]]`;
  }

  // Zoho internal protocol link
  if (href.startsWith('zohonotebook://')) {
    // Extract note ID from URL
    const match = href.match(/zohonotebook:\/\/notes\/(\w+)/);
    if (match) {
      const noteId = match[1];
      const targetTitle = noteIdToTitle.get(noteId);
      if (targetTitle) {
        // If link text is auto-generated "link", use target title
        if (text.toLowerCase() === 'link') {
          return `[[${targetTitle}]]`;
        }
        return `[[${targetTitle}|${text}]]`;
      }
    }
    // Fallback: use link text as wikilink if it's meaningful
    if (text && text.toLowerCase() !== 'link') {
      return `[[${text}]]`;
    }
    const safeHref = href.replace(/-->/g, '--\u200B>');
    return `<!-- zoho internal link (unresolved): ${safeHref} -->`;
  }

  // Local file attachment
  if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
    const cleanHref = normalizeFilename(href);
    return `![[attachments/${cleanHref}]]`;
  }

  // External URL
  if (text === href || !text) {
    return href;
  }
  return `[${text}](${href})`;
}

function handleTable(node, context, noteIdToTitle) {
  const rows = [];
  for (const tr of findByTag(node, 'tr')) {
    const cells = [];
    // Use direct children to preserve td/th document order (won't leak nested table cells)
    const cellNodes = (tr.children || []).filter(c =>
      c.type === 'tag' && ['td', 'th'].includes(c.tagName?.toLowerCase())
    );
    for (const cell of cellNodes) {
      const text = walkChildren(cell, context, noteIdToTitle).trim().replace(/\|/g, '\\|');
      cells.push(text);
    }
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  // Determine column count
  const colCount = Math.max(...rows.map(r => r.length));

  let result = '';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Pad row to full column count
    while (row.length < colCount) row.push('');
    result += '| ' + row.join(' | ') + ' |\n';

    // Add header separator after first row
    if (i === 0) {
      result += '| ' + row.map(() => '---').join(' | ') + ' |\n';
    }
  }
  result += '\n';
  return result;
}

// --- Znote resource handlers ---

/**
 * Handle a <znresource> when it's the sole child of <content> (card-level).
 * Uses noteData.noteType for accurate card identification.
 */
function handleZnresourceCard(node, noteData) {
  const relativePath = getAttr(node, 'relative-path') || '';
  const type = getAttr(node, 'type') || '';
  const consumers = getAttr(node, 'consumers') || '';
  const noteType = noteData?.noteType;

  const cleanPath = normalizeFilename(relativePath);

  // Audio card
  if (type.startsWith('audio/') || noteType === 'note/audio') {
    return `Attached audio: ![[attachments/${cleanPath}]]\n\n> **Note**: Audio file exported without extension. You may need to rename it (likely .m4a or .webm).\n`;
  }

  // File card
  if (consumers.includes('com.zoho.notebook.file') || noteType === 'note/file') {
    return `Attached file: ![[attachments/${cleanPath}]]\n`;
  }

  // Image or sketch card
  return `![[attachments/${cleanPath}]]\n`;
}

/**
 * Handle an inline <znresource> element within note body.
 */
function handleZnresource(node) {
  const relativePath = getAttr(node, 'relative-path') || '';
  const type = getAttr(node, 'type') || '';
  const consumers = getAttr(node, 'consumers') || '';

  const cleanPath = normalizeFilename(relativePath);

  // File attachment (inline)
  if (consumers.includes('com.zoho.notebook.file')) {
    return `![[attachments/${cleanPath}]]`;
  }

  // Audio
  if (type.startsWith('audio/')) {
    return `![[attachments/${cleanPath}]]`;
  }

  // Image or sketch (default)
  return `![[attachments/${cleanPath}]]`;
}

// --- Helpers ---

function isBlockElement(tag) {
  return ['div', 'p', 'blockquote', 'pre', 'table', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
}

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeYaml(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\x00/g, '')                        // Strip null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip C0 controls
    .replace(/\u0085/g, '\\n')                    // Next Line → escaped newline
    .replace(/\u2028/g, '\\n')                    // Line Separator → escaped newline
    .replace(/\u2029/g, '\\n')                    // Paragraph Separator → escaped newline
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function normalizeText(text) {
  return text.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ');
}
