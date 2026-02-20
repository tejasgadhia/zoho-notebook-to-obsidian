import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseNote } from '../src/parse-note.js';
import { convertNote } from '../src/convert.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures');

const fixtures = fs.readdirSync(fixturesDir)
  .filter(f => f.endsWith('.html'))
  .sort()
  .map(f => f.replace('.html', ''));

// Mock idMap for internal-links fixture
const idMap = new Map();
idMap.set('gsgjktest123', 'Resolved Target Note');

// --- Metadata tests ---

describe('parseNote metadata', () => {
  it('simple-note: extracts title, notebook, dates, color', () => {
    const note = parseNote(path.join(fixturesDir, 'simple-note.html'));
    assert.equal(note.title, 'Simple Note');
    assert.equal(note.notebook, 'Test Notebook');
    assert.equal(note.color, '#FEBF59');
    assert.ok(note.createdDate.startsWith('2024-01-15'));
    assert.ok(note.modifiedDate.startsWith('2024-06-20'));
  });

  it('photo-card: detects image in content', () => {
    const note = parseNote(path.join(fixturesDir, 'photo-card.html'));
    assert.equal(note.title, 'Photo Card');
    assert.equal(note.notebook, 'Photo Album');
    assert.deepEqual(note.images, ['gsgjkphoto456.png']);
    assert.deepEqual(note.attachments, []);
  });

  it('file-card: detects attachment link', () => {
    const note = parseNote(path.join(fixturesDir, 'file-card.html'));
    assert.equal(note.title, 'File Card');
    assert.equal(note.notebook, 'Documents');
    assert.deepEqual(note.images, []);
    assert.deepEqual(note.attachments, ['gsgjkfile789.zip']);
  });

  it('audio-card: detects attachment without extension', () => {
    const note = parseNote(path.join(fixturesDir, 'audio-card.html'));
    assert.equal(note.title, 'Audio Card');
    assert.equal(note.notebook, 'Recordings');
    assert.deepEqual(note.attachments, ['gsgjkaudio012']);
  });

  it('video-card: has empty content', () => {
    const note = parseNote(path.join(fixturesDir, 'video-card.html'));
    assert.equal(note.title, 'demo-recording.webm');
    assert.equal(note.notebook, 'Videos');
    assert.deepEqual(note.images, []);
    assert.deepEqual(note.attachments, []);
  });

  it('image-note: detects inline image', () => {
    const note = parseNote(path.join(fixturesDir, 'image-note.html'));
    assert.equal(note.title, 'Image Note');
    assert.deepEqual(note.images, ['gsgjktest123.jpeg']);
  });

  it('checkboxes: no images or attachments', () => {
    const note = parseNote(path.join(fixturesDir, 'checkboxes.html'));
    assert.equal(note.title, 'Checkboxes');
    assert.deepEqual(note.images, []);
    assert.deepEqual(note.attachments, []);
  });

  it('internal-links: no images, href="#" collected as attachment', () => {
    const note = parseNote(path.join(fixturesDir, 'internal-links.html'));
    assert.equal(note.title, 'Internal Links');
    assert.deepEqual(note.images, []);
    // The rte-link has href="#" which parseNote collects (it's not http/zohonotebook/mailto)
    assert.deepEqual(note.attachments, ['#']);
  });

  it('all fixtures have required metadata fields', () => {
    for (const name of fixtures) {
      const note = parseNote(path.join(fixturesDir, `${name}.html`));
      assert.ok(note.title, `${name}: missing title`);
      assert.ok(note.notebook, `${name}: missing notebook`);
      assert.ok(note.createdDate, `${name}: missing createdDate`);
      assert.ok(note.modifiedDate, `${name}: missing modifiedDate`);
      assert.ok(note.sourceFile, `${name}: missing sourceFile`);
      assert.ok(note.noteId, `${name}: missing noteId`);
    }
  });
});

// --- Snapshot tests ---

describe('convertNote snapshots', () => {
  for (const name of fixtures) {
    it(`${name}: matches expected output`, () => {
      const note = parseNote(path.join(fixturesDir, `${name}.html`));
      const { markdown } = convertNote(note, idMap);
      const expectedPath = path.join(fixturesDir, `${name}.expected.md`);
      const expected = fs.readFileSync(expectedPath, 'utf-8');
      assert.equal(markdown, expected, `Snapshot mismatch for ${name}`);
    });
  }
});
