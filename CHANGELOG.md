# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-20

### Changed

- **Cheerio-free conversion**: `convert.js` now operates on plain htmlparser2 nodes via new `node-helpers.js` utilities (`getAttr`, `getText`, `findByTag`), removing cheerio from the hot path (AR1)
- **Immutable walk context**: List handlers use object spread (`{ ...context }`) instead of mutating shared state, preventing cross-branch contamination bugs (CQ1)
- **Card type strategy dispatch**: `CARD_STRATEGIES` array replaces nested if-else chain for cleaner card type detection (video > empty > photo > znresource > file > text) (AR4)

### Added

- `MAX_WALK_DEPTH=100` recursion guard in `walkChildren` prevents stack overflow on pathological input (S7)

### Fixed

- Code review cleanup: removed dead code, improved variable naming, tightened scope of `_skipNodes` set

## [1.0.0] - 2026-02-20

### Added

- CLI tool: `npx zoho-notebook-to-obsidian <input> <output>` with `--skip-empty` and `--verbose` flags
- Support for all 8 Zoho Notebook card types: text, checklist, photo, sketch, file, audio, video, internal link
- Recursive HTML-to-Markdown conversion handling nested divs, lists, formatting, tables, code blocks, blockquotes, and headings
- YAML frontmatter with title, notebook, created/modified dates, tags, aliases, and source
- Internal link resolution (`zohonotebook://` protocol to `[[wikilinks]]`)
- Notebook folder organization with automatic filename deduplication
- Image, file, and audio attachment copying to `attachments/` folder
- Zip file and extracted folder input support
- `ZOHO-EXPORT-ISSUES.md` documenting 17 known Zoho export problems
- 20 test fixtures covering all card types and edge cases
- Automated tests with `node:test` (snapshot + metadata + security)

### Security

- Path traversal protection: dot stripping in folder names + `path.resolve` boundary checks on all file writes
- YAML injection prevention: `escapeYaml` handles null bytes, C0/C1 control characters, U+0085, U+2028, U+2029, newlines, carriage returns
- HTML comment injection prevention: `-->` sequences sanitized in unresolved internal link comments
- Windows reserved filename blocking: CON, PRN, AUX, NUL, COM1-9, LPT1-9 prefixed with `_`
- Control character stripping from filenames (C0, C1, Unicode line/paragraph separators)
- Filename length capping at 200 bytes with safe surrogate pair handling
- `safeCopy` boundary checks preventing file reads/writes outside source/destination directories

### Fixed

- Silent JSON parse failures now log warnings with filename and attribute name
- `safeCopy` file-not-found and boundary violations now log warnings
- Note ID format uses `path.basename` for reliable internal link resolution
- Version read dynamically from `package.json` (no hardcoded values)

[1.1.0]: https://github.com/tejasgadhia/zoho-notebook-to-obsidian/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/tejasgadhia/zoho-notebook-to-obsidian/releases/tag/v1.0.0
