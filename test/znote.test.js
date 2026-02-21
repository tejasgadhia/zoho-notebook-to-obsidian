import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as cheerio from 'cheerio';
import { create as tarCreate } from 'tar';
import { convertNote } from '../src/convert.js';
import { parseZnoteExport, preprocessZnoteHtml } from '../src/parse-znote.js';

/**
 * Build a synthetic NoteData object from Znote-style content HTML.
 * Uses the same preprocessZnoteHtml() that parse-znote.js uses in production
 * so convertNote() receives the same shape it gets in the real pipeline.
 */
function znoteNoteData(contentHtml, overrides = {}) {
  let html = preprocessZnoteHtml(contentHtml);

  const $ = cheerio.load(html, { xmlMode: false });

  let $content = $('content').first();
  if ($content.length === 0) {
    $content = $.root();
  } else if ($content.children().length === 1 && $content.children().first().is('content')) {
    $content = $content.children().first();
  }

  return {
    sourceFile: 'test.znote',
    noteId: 'test123',
    notebook: overrides.notebook || 'Test Notebook',
    title: overrides.title || 'Test Note',
    color: overrides.color || '#FEBF59',
    createdDate: overrides.createdDate || '2024-01-15T10:00:00+0530',
    modifiedDate: overrides.modifiedDate || '2024-06-20T14:30:00+0530',
    noteType: overrides.noteType || null,
    contentNode: $content[0],
    images: overrides.images || [],
    attachments: overrides.attachments || [],
    attachmentDir: overrides.attachmentDir || '/tmp/test',
  };
}

// --- Section 1: <checkbox> conversion ---

describe('Znote <checkbox> conversion', () => {
  it('unchecked checkbox renders as - [ ]', () => {
    const note = znoteNoteData('<checkbox checked="false">Buy milk</checkbox>');
    const { body } = convertNote(note);
    assert.ok(body.includes('- [ ] Buy milk'), `Got: ${body}`);
  });

  it('checked checkbox renders as - [x]', () => {
    const note = znoteNoteData('<checkbox checked="true">Done item</checkbox>');
    const { body } = convertNote(note);
    assert.ok(body.includes('- [x] Done item'), `Got: ${body}`);
  });

  it('mixed checklist preserves per-line state', () => {
    const note = znoteNoteData(
      '<div class="checklist"><div><checkbox checked="true">Task A</checkbox></div><div><checkbox checked="false">Task B</checkbox></div><div><checkbox checked="true">Task C</checkbox></div></div>'
    );
    const { body } = convertNote(note);
    const lines = body.split('\n').filter(l => l.startsWith('- ['));
    assert.equal(lines.length, 3, `Expected 3 checkbox lines, got: ${lines}`);
    assert.ok(lines[0].includes('- [x] Task A'));
    assert.ok(lines[1].includes('- [ ] Task B'));
    assert.ok(lines[2].includes('- [x] Task C'));
  });

  it('checkbox without checked attribute defaults to unchecked', () => {
    const note = znoteNoteData('<checkbox>Pending item</checkbox>');
    const { body } = convertNote(note);
    assert.ok(body.includes('- [ ] Pending item'), `Got: ${body}`);
  });

  it('rich text inside checkbox is converted', () => {
    const note = znoteNoteData('<checkbox checked="false"><b>Important</b> task</checkbox>');
    const { body } = convertNote(note);
    assert.ok(body.includes('- [ ] **Important** task'), `Got: ${body}`);
  });
});

// --- Section 2: <znresource> conversion ---

describe('Znote <znresource> conversion', () => {
  it('card-level image znresource renders as wikilink embed', () => {
    const note = znoteNoteData(
      '<content><znresource relative-path="abc123/photo.jpg" type="image/jpeg" file-name="photo.jpg"/></content>',
      { noteType: 'note/image' }
    );
    const { body } = convertNote(note);
    assert.ok(body.includes('![[attachments/abc123/photo.jpg]]'), `Got: ${body}`);
  });

  it('card-level audio znresource renders with audio prefix', () => {
    const note = znoteNoteData(
      '<content><znresource relative-path="abc123/recording" type="audio/m4a" file-name="recording"/></content>',
      { noteType: 'note/audio' }
    );
    const { body } = convertNote(note);
    assert.ok(body.includes('Attached audio:'), `Got: ${body}`);
    assert.ok(body.includes('![[attachments/abc123/recording]]'), `Got: ${body}`);
  });

  it('card-level file znresource renders with file prefix', () => {
    const note = znoteNoteData(
      '<content><znresource relative-path="abc123/report.pdf" type="application/pdf" file-name="report.pdf" consumers="com.zoho.notebook.file"/></content>',
      { noteType: 'note/file' }
    );
    const { body } = convertNote(note);
    assert.ok(body.includes('Attached file:'), `Got: ${body}`);
    assert.ok(body.includes('![[attachments/abc123/report.pdf]]'), `Got: ${body}`);
  });

  it('inline znresource between text renders as embedded wikilink', () => {
    const note = znoteNoteData(
      '<content><div>See this image: <znresource relative-path="abc123/diagram.png" type="image/png" file-name="diagram.png"/> and continue reading.</div></content>'
    );
    const { body } = convertNote(note);
    assert.ok(body.includes('![[attachments/abc123/diagram.png]]'), `Got: ${body}`);
    assert.ok(body.includes('See this image:'), `Got: ${body}`);
  });

  it('U+202F in filename is normalized to regular space', () => {
    const narrowNbsp = '\u202f';
    const filename = `Screenshot${narrowNbsp}2024-01-15.png`;
    const note = znoteNoteData(
      `<content><znresource relative-path="abc123/${filename}" type="image/png" file-name="${filename}"/></content>`,
      { noteType: 'note/image' }
    );
    const { body } = convertNote(note);
    // normalizeFilename replaces U+202F with regular space
    assert.ok(body.includes('Screenshot 2024-01-15.png'), `Got: ${body}`);
    assert.ok(!body.includes('\u202f'), 'Should not contain narrow no-break space');
  });
});

// --- Section 3: Bookmark card ---

describe('Znote bookmark card', () => {
  it('bookmark with link renders as markdown link', () => {
    const note = znoteNoteData(
      '<content><div><a href="https://example.com">Example Site</a></div></content>',
      { noteType: 'note/bookmark', title: 'Example Bookmark' }
    );
    const { body } = convertNote(note);
    assert.ok(body.includes('[Example Site](https://example.com)'), `Got: ${body}`);
  });
});

// --- Section 4: Corrupt znote resilience ---

describe('corrupt znote resilience (#8)', () => {
  let tempDir;
  let exportDir;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'znote-corrupt-'));
    exportDir = path.join(tempDir, 'export');

    const notebookDir = path.join(exportDir, 'TestNotebook');
    fs.mkdirSync(notebookDir, { recursive: true });

    fs.writeFileSync(path.join(notebookDir, 'meta.json'), JSON.stringify({
      data_type: 'NOTEBOOK',
      name: 'Test Notebook',
      notebook_id: 'nb-corrupt',
    }));

    // Valid .znote
    const znelXml = `<?xml version="1.0" encoding="UTF-8"?>
<ZNote>
  <ZMeta><ZTitle>Good Note</ZTitle><ZCreatedDate>2024-01-01T00:00:00+0000</ZCreatedDate><ZModifiedDate>2024-01-01T00:00:00+0000</ZModifiedDate><ZNoteColor>#FFF</ZNoteColor><ZNoteType>note/text</ZNoteType></ZMeta>
  <ZContent><![CDATA[<content><div>Hello</div></content>]]></ZContent>
</ZNote>`;

    const noteDir = path.join(tempDir, 'tar-staging', 'validnote');
    fs.mkdirSync(noteDir, { recursive: true });
    fs.writeFileSync(path.join(noteDir, 'Note.znel'), znelXml);

    await tarCreate(
      { file: path.join(notebookDir, 'validnote.znote'), cwd: path.join(tempDir, 'tar-staging') },
      ['validnote']
    );

    // Corrupt .znote (invalid tar — just garbage bytes)
    fs.writeFileSync(path.join(notebookDir, 'corrupt.znote'), 'not-a-tar-file');
  });

  after(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns valid note and skips corrupt one without throwing', () => {
    const { notes, cleanup } = parseZnoteExport(exportDir);
    try {
      assert.equal(notes.length, 1, `Expected 1 note, got ${notes.length}`);
      assert.equal(notes[0].title, 'Good Note');
    } finally {
      cleanup();
    }
  });
});

// --- Section 5: parseZnoteExport end-to-end ---

describe('parseZnoteExport end-to-end', () => {
  let tempDir;
  let exportDir;

  before(async () => {
    // Build a minimal Znote export structure:
    //   exportDir/
    //     MyNotebook/
    //       meta.json
    //       testnote123.znote  (tar containing testnote123/Note.znel)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'znote-test-'));
    exportDir = path.join(tempDir, 'export');

    const notebookDir = path.join(exportDir, 'MyNotebook');
    fs.mkdirSync(notebookDir, { recursive: true });

    // Write meta.json
    fs.writeFileSync(path.join(notebookDir, 'meta.json'), JSON.stringify({
      data_type: 'NOTEBOOK',
      name: 'My Notebook',
      notebook_id: 'nb001',
    }));

    // Build Note.znel XML
    const znelXml = `<?xml version="1.0" encoding="UTF-8"?>
<ZNote>
  <ZMeta>
    <ZTitle>Grocery List</ZTitle>
    <ZCreatedDate>2024-03-10T09:00:00+0530</ZCreatedDate>
    <ZModifiedDate>2024-03-10T10:30:00+0530</ZModifiedDate>
    <ZNoteColor>#4CAF50</ZNoteColor>
    <ZNoteType>note/checklist</ZNoteType>
  </ZMeta>
  <ZContent><![CDATA[<content><div class="checklist"><div><checkbox checked="true">Eggs</checkbox></div><div><checkbox checked="false">Bread</checkbox></div></div></content>]]></ZContent>
</ZNote>`;

    // Create the directory structure for the tar
    const noteDir = path.join(tempDir, 'tar-staging', 'testnote123');
    fs.mkdirSync(noteDir, { recursive: true });
    fs.writeFileSync(path.join(noteDir, 'Note.znel'), znelXml);

    // Create tar archive
    await tarCreate(
      {
        file: path.join(notebookDir, 'testnote123.znote'),
        cwd: path.join(tempDir, 'tar-staging'),
      },
      ['testnote123']
    );
  });

  after(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses metadata correctly from znote export', () => {
    const { notes, cleanup } = parseZnoteExport(exportDir);
    try {
      assert.equal(notes.length, 1, `Expected 1 note, got ${notes.length}`);
      const note = notes[0];
      assert.equal(note.title, 'Grocery List');
      assert.equal(note.notebook, 'My Notebook');
      assert.equal(note.noteType, 'note/checklist');
      assert.equal(note.noteId, 'testnote123');
      assert.ok(note.createdDate.includes('2024-03-10'));
      assert.equal(note.color, '#4CAF50');
    } finally {
      cleanup();
    }
  });

  it('full pipeline: parseZnoteExport → convertNote produces correct markdown', () => {
    const { notes, cleanup } = parseZnoteExport(exportDir);
    try {
      const note = notes[0];
      const { markdown } = convertNote(note);

      // Frontmatter present
      assert.ok(markdown.includes('title: "Grocery List"'), `Got: ${markdown}`);
      assert.ok(markdown.includes('notebook: "My Notebook"'), `Got: ${markdown}`);

      // Checkboxes rendered correctly
      assert.ok(markdown.includes('- [x] Eggs'), `Got: ${markdown}`);
      assert.ok(markdown.includes('- [ ] Bread'), `Got: ${markdown}`);
    } finally {
      cleanup();
    }
  });
});
