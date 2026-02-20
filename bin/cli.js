#!/usr/bin/env node

import { createRequire } from 'node:module';
import { program } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { extractInput } from '../src/extract.js';
import { parseNote } from '../src/parse-note.js';
import { parseZnoteExport } from '../src/parse-znote.js';
import { convertNote } from '../src/convert.js';
import { buildNameMap } from '../src/names.js';
import { writeOutput } from '../src/writer.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('zoho-notebook-to-obsidian')
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
    const { dataDir, format, cleanup } = extractInput(input);

    let znoteCleanup = () => {};
    try {
      let notes;

      if (format === 'znote') {
        // Znote format: parse notebook folders with .znote tar archives
        console.log('Detected Znote format export.');
        if (options.verbose) console.log('\nParsing Znote files...');

        const result = parseZnoteExport(dataDir);
        notes = result.notes;
        znoteCleanup = result.cleanup;

        if (notes.length === 0) {
          throw new Error('No Znote files found in the export.');
        }

        console.log(`Found ${notes.length} notes across Znote format.`);
      } else {
        // HTML format: parse flat .html files
        console.log('Detected HTML format export.');
        const allFiles = fs.readdirSync(dataDir);
        const htmlFiles = allFiles
          .filter(f => f.endsWith('.html') && f !== 'index.html')
          .map(f => path.join(dataDir, f));

        if (htmlFiles.length === 0) {
          throw new Error('No note HTML files found in the export.');
        }

        console.log(`Found ${htmlFiles.length} notes.`);

        if (options.verbose) console.log('\nParsing notes...');
        notes = htmlFiles.map(f => parseNote(f));
      }

      // Build note ID lookup for internal link resolution
      const noteIdToTitle = new Map();
      for (const note of notes) {
        noteIdToTitle.set(note.noteId, note.title);
      }

      // Build filename map
      const nameMap = buildNameMap(notes);

      // Convert each note
      if (options.verbose) console.log('\nConverting...');
      const converted = notes.map(note => convertNote(note, noteIdToTitle));

      // Write output
      if (options.verbose) console.log('\nWriting output...');
      const outputDir = path.resolve(output);
      writeOutput(notes, converted, nameMap, dataDir, outputDir, options);

      console.log(`\nOutput written to: ${outputDir}`);
    } finally {
      znoteCleanup(); // safe: initialized as () => {} for HTML format
      cleanup();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
