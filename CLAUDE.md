# CLAUDE.md

## What This Is

**zoho-notebook-to-obsidian** — CLI tool and npm package that converts Zoho Notebook HTML exports into clean Obsidian Markdown. Handles all 8 Zoho card types (text, checklist, photo, sketch, file, audio, video, internal link). Validated against a real 31-note, 6-notebook export.

## Architecture

6-module pipeline with dual-format support:

```
bin/cli.js             Entry point, argument parsing (commander)
  → src/extract.js     Unzip, locate data dir, detect format ('html' or 'znote')
  → src/parse-note.js  HTML format: parse .html into NoteData (cheerio)
  → src/parse-znote.js Znote format: extract .znote tars, parse XML+CDATA (tar, cheerio)
  → src/convert.js     Recursive HTML→Markdown walker, frontmatter builder
  → src/names.js       Safe folder/filenames, deduplication
  → src/writer.js      Write .md files, copy attachments (per-note dirs for Znote)
  → src/utils.js       Shared normalizeFilename utility
```

Key data flow: `extractInput()` → auto-detect format → `parseNote()` or `parseZnoteExport()` → both produce `NoteData[]` → `buildNameMap()` → `convertNote()` per note → `writeOutput()`.

## Commands

```bash
# Convert a Zoho export
node bin/cli.js <input.zip|folder> <output-dir> [--skip-empty] [--verbose]

# Run tests
npm test

# Regenerate test snapshots (after changing convert logic)
npm run test:gen
```

## Znote Format Details

- `.znote` files are POSIX tar archives (extracted with `tar` npm package, sync mode)
- Each tar contains `{noteId}/Note.znel` (XML) + attachment files
- `Note.znel` has `<ZMeta>` fields and `<ZContent><![CDATA[...html...]]></ZContent>`
- Notebook metadata in `meta.json` per folder
- **Cheerio self-closing tag workaround**: `<znresource/>` and `<checkbox/>` must be pre-processed to explicit open+close pairs before `cheerio.load()` in non-XML mode. Without this, cheerio treats them as unclosed tags and swallows subsequent siblings as children. The regex is quote-aware to handle `>` inside attribute values.

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
