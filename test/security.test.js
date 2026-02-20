import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseNote } from '../src/parse-note.js';
import { convertNote } from '../src/convert.js';
import { toFolderName, sanitizeFilename } from '../src/names.js';

const securityDir = path.join(import.meta.dirname, 'fixtures', 'security');

describe('path traversal prevention', () => {
  it('toFolderName("..") returns "uncategorized"', () => {
    assert.equal(toFolderName('..'), 'uncategorized');
  });

  it('toFolderName("...") returns "uncategorized"', () => {
    assert.equal(toFolderName('...'), 'uncategorized');
  });

  it('toFolderName("../../../etc") strips dots', () => {
    const result = toFolderName('../../../etc');
    assert.ok(!result.includes('..'), `Result "${result}" contains ".."` );
    assert.ok(!result.startsWith('/'), `Result "${result}" starts with /`);
  });

  it('dotdot-notebook fixture: notebook resolves safely', () => {
    const note = parseNote(path.join(securityDir, 'dotdot-notebook.html'));
    assert.equal(note.notebook, '..');
    assert.equal(toFolderName(note.notebook), 'uncategorized');
  });
});

describe('YAML injection prevention', () => {
  it('escapeYaml strips newlines from title in frontmatter', () => {
    const note = parseNote(path.join(securityDir, 'newline-in-title.html'));
    const { markdown } = convertNote(note);
    const titleLine = markdown.split('\n').find(l => l.startsWith('title:'));
    assert.ok(titleLine, 'No title line found in frontmatter');
    // The raw title value between quotes should not contain actual newlines
    assert.ok(!titleLine.includes('\n', titleLine.indexOf('"') + 1),
      `Title line contains raw newline: ${JSON.stringify(titleLine)}`);
  });

  it('escapeYaml strips null bytes from title in frontmatter', () => {
    const note = parseNote(path.join(securityDir, 'null-byte-title.html'));
    const { markdown } = convertNote(note);
    assert.ok(!markdown.includes('\x00'), 'Markdown contains null byte');
  });
});

describe('filename sanitization', () => {
  it('sanitizeFilename("NUL") prefixes with underscore', () => {
    assert.equal(sanitizeFilename('NUL'), '_NUL');
  });

  it('sanitizeFilename("CON") prefixes with underscore', () => {
    assert.equal(sanitizeFilename('CON'), '_CON');
  });

  it('sanitizeFilename("COM1") prefixes with underscore', () => {
    assert.equal(sanitizeFilename('COM1'), '_COM1');
  });

  it('sanitizeFilename("LPT1") prefixes with underscore', () => {
    assert.equal(sanitizeFilename('LPT1'), '_LPT1');
  });

  it('sanitizeFilename strips control characters', () => {
    const result = sanitizeFilename('Title\x00\x01\x0A\x0D\x1Fend');
    assert.ok(!result.match(/[\x00-\x1F]/), `Result contains control chars: ${JSON.stringify(result)}`);
  });

  it('sanitizeFilename caps length at 200 bytes', () => {
    const longTitle = 'A'.repeat(300);
    const result = sanitizeFilename(longTitle);
    assert.ok(Buffer.byteLength(result, 'utf8') <= 200,
      `Result is ${Buffer.byteLength(result, 'utf8')} bytes, expected <= 200`);
  });

  it('sanitizeFilename handles lone surrogates from truncation', () => {
    // Emoji are 4 bytes in UTF-8; create a title that truncates mid-emoji
    const emoji = '\u{1F600}'; // grinning face, 4 bytes
    const longTitle = emoji.repeat(60); // 240 bytes
    const result = sanitizeFilename(longTitle);
    // Should not end with a lone high surrogate
    const lastCode = result.charCodeAt(result.length - 1);
    assert.ok(!(lastCode >= 0xD800 && lastCode <= 0xDBFF),
      `Result ends with lone high surrogate: U+${lastCode.toString(16)}`);
  });

  it('long-title fixture: filename stays under 200 bytes', () => {
    const note = parseNote(path.join(securityDir, 'long-title.html'));
    const result = sanitizeFilename(note.title);
    assert.ok(Buffer.byteLength(result, 'utf8') <= 200,
      `Result is ${Buffer.byteLength(result, 'utf8')} bytes`);
  });

  it('windows-reserved-name fixture: NUL gets prefixed', () => {
    const note = parseNote(path.join(securityDir, 'windows-reserved-name.html'));
    const result = sanitizeFilename(note.title);
    assert.equal(result, '_NUL');
  });
});

describe('normalizeFilename', () => {
  it('toFolderName normalizes U+202F and U+00A0', () => {
    // U+202F narrow no-break space, U+00A0 no-break space
    const result = toFolderName('My\u202fNotebook\u00a0Name');
    assert.ok(!result.includes('\u202f'), 'Contains U+202F');
    assert.ok(!result.includes('\u00a0'), 'Contains U+00A0');
    assert.equal(result, 'my-notebook-name');
  });
});
