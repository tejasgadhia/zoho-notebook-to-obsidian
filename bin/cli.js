#!/usr/bin/env node

import { createRequire } from 'node:module';
import { program } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { extractInput } from '../src/extract.js';
import { parseNote } from '../src/parse-note.js';
import { convertNote } from '../src/convert.js';
import { buildNameMap } from '../src/names.js';
import { writeOutput } from '../src/writer.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('zoho-to-obsidian')
  .description('Convert Zoho Notebook exports to Obsidian Markdown')
  .version(version)
  .argument('<input>', 'Path to Zoho export .zip or extracted folder')
  .argument('<output>', 'Path to output directory (created if needed)')
  .option('--skip-empty', 'Skip notes with no content', false)
  .option('--verbose', 'Log each file being processed', false)
  .action(run);

program.parse();

async function run(input, output, options) {
  try {
    // Step 1: Extract input
    console.log(`Reading from: ${input}`);
    const { dataDir, cleanup } = extractInput(input);

    try {
      // Step 2: Find all HTML note files
      const allFiles = fs.readdirSync(dataDir);
      const htmlFiles = allFiles
        .filter(f => f.endsWith('.html') && f !== 'index.html')
        .map(f => path.join(dataDir, f));

      if (htmlFiles.length === 0) {
        throw new Error('No note HTML files found in the export.');
      }

      console.log(`Found ${htmlFiles.length} notes.`);

      // Step 3: Parse all notes
      if (options.verbose) console.log('\nParsing notes...');
      const notes = htmlFiles.map(f => parseNote(f));

      // Step 4: Build note ID lookup for internal link resolution
      const noteIdToTitle = new Map();
      for (const note of notes) {
        noteIdToTitle.set(note.noteId, note.title);
      }

      // Step 5: Build filename map
      const nameMap = buildNameMap(notes);

      // Step 6: Convert each note
      if (options.verbose) console.log('\nConverting...');
      const converted = notes.map(note => convertNote(note, noteIdToTitle));

      // Step 7: Write output
      if (options.verbose) console.log('\nWriting output...');
      const outputDir = path.resolve(output);
      writeOutput(notes, converted, nameMap, dataDir, outputDir, options);

      console.log(`\nOutput written to: ${outputDir}`);
    } finally {
      cleanup();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
