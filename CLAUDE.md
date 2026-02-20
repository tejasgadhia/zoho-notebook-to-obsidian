# CLAUDE.md

## What This Is

CLI tool and npm package that converts Zoho Notebook HTML exports into clean Obsidian Markdown. Handles all 8 Zoho card types (text, checklist, photo, sketch, file, audio, video, internal link). Validated against a real 31-note, 6-notebook export.

## Architecture

5-module pipeline:

```
bin/cli.js          Entry point, argument parsing (commander)
  → src/extract.js  Unzip or locate HTML files in a directory
  → src/parse-note.js  Parse HTML into NoteData objects (cheerio)
  → src/convert.js  Recursive HTML→Markdown walker, frontmatter builder
  → src/names.js    Safe folder/filenames, deduplication
  → src/writer.js   Write .md files, copy attachments
  → src/utils.js    Shared normalizeFilename utility
```

Key data flow: `extractInput()` → `parseNote()` per file → `buildNameMap()` → `convertNote()` per note → `writeOutput()`.

## Commands

```bash
# Convert a Zoho export
node bin/cli.js <input.zip|folder> <output-dir> [--skip-empty] [--verbose]

# Run tests
npm test

# Regenerate test snapshots (after changing convert logic)
npm run test:gen
```

## Security Patterns

These are intentional security hardening — do not remove or simplify:

- **`toFolderName`** (`names.js`): Strips ALL dots via `/\.+/g` to prevent `..` path traversal. Falls back to `"uncategorized"` on empty result.
- **`safeCopy`** (`writer.js`): `path.resolve` + `startsWith` boundary check on BOTH source and destination before any `copyFileSync`.
- **Writer folder check** (`writer.js`): `path.resolve(folderPath).startsWith(path.resolve(outputDir))` before `mkdirSync` — defense-in-depth against folder escape.
- **`escapeYaml`** (`convert.js`): Escapes `\`, `"`, `\n`, `\r`, strips null bytes, C0/C1 controls, converts U+0085/U+2028/U+2029 to `\n`.
- **`sanitizeFilename`** (`names.js`): Strips control chars (C0, C1, Unicode line separators), illegal filesystem chars, Windows reserved names (CON, NUL, etc.), caps at 200 bytes with safe surrogate handling.
- **Comment injection** (`convert.js`): `-->` in unresolved internal link hrefs is sanitized with zero-width space.

## Test Layout

```
test/
  convert.test.js           20 fixture round-trip tests (metadata + snapshot)
  security.test.js          Security regression tests (path traversal, injection, etc.)
  gen-snapshots.js          One-time script to regenerate .expected.md files
  fixtures/
    *.html                  20 synthetic test fixtures (one per card type / edge case)
    *.expected.md           Expected markdown output snapshots
    security/
      *.html                5 adversarial input fixtures
```

## Personal Data Safety

- **NEVER** commit `test-output-real/` or any real Zoho export data to this repo
- **NEVER** reference content from `~/DEV/obsidian/zoho-notebook-obsidian/` in code or tests
- The `test/fixtures/` directory contains only synthetic HTML — no personal data
- `.gitignore` excludes `test-output-*/` directories
