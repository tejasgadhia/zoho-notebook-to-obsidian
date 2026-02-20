/**
 * Generate .expected.md snapshot files for all test fixtures.
 * Run: node test/gen-snapshots.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseNote } from '../src/parse-note.js';
import { convertNote } from '../src/convert.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures');

const htmlFiles = fs.readdirSync(fixturesDir)
  .filter(f => f.endsWith('.html'))
  .sort();

// Build a mock idMap for internal-links fixture
const idMap = new Map();
idMap.set('gsgjktest123', 'Resolved Target Note');

let count = 0;
for (const file of htmlFiles) {
  const htmlPath = path.join(fixturesDir, file);
  const noteData = parseNote(htmlPath);
  const { markdown } = convertNote(noteData, idMap);
  const outPath = path.join(fixturesDir, file.replace('.html', '.expected.md'));
  fs.writeFileSync(outPath, markdown, 'utf-8');
  console.log(`  ${file} → ${path.basename(outPath)}`);
  count++;
}

console.log(`\nGenerated ${count} snapshots.`);
