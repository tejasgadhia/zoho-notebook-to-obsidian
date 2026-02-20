# zoho-notebook-to-obsidian

Convert [Zoho Notebook](https://www.zoho.com/notebook/) exports to clean [Obsidian](https://obsidian.md/) Markdown.

Zoho Notebook's export produces single-line HTML files with non-standard markup that Obsidian's built-in importer handles poorly. This tool converts them to well-formatted Markdown with proper frontmatter, wikilinks, and folder organization.

## Quick Start

```bash
npx zoho-notebook-to-obsidian ./Notebook_export.zip ./my-obsidian-vault
```

Or install globally:

```bash
npm install -g zoho-notebook-to-obsidian
zoho-notebook-to-obsidian ./Notebook_export.zip ./my-obsidian-vault
```

## How to Export from Zoho Notebook

Zoho Notebook offers two export formats. Both are supported:

### Option 1: HTML Export

1. Open [Zoho Notebook](https://notebook.zoho.com/) in your browser
2. Click the **gear icon** (Settings) in the bottom-left
3. Select **Migration** > **Export**
4. Choose **HTML** format
5. Download the `.zip` file

### Option 2: Znote Export (recommended)

1. Open [Zoho Notebook](https://notebook.zoho.com/) in your browser
2. Click the **gear icon** (Settings) in the bottom-left
3. Select **Migration** > **Export**
4. Choose **Znote** format
5. Download the `.zip` file

Znote exports preserve richer metadata than HTML: original timezones, explicit card types, and resource dimensions. The tool auto-detects the format.

You can pass either the `.zip` file or the extracted folder to this tool.

## What It Fixes

Zoho Notebook's HTML export has several problems this tool handles:

- **Non-standard `<content>` tags** — converted to clean Markdown
- **Deeply nested `<div>` chains** (5+ levels) — flattened to paragraphs
- **Invalid HTML list nesting** (`<ul>` directly inside `<ul>`) — proper indentation
- **`zohonotebook://` internal links** — converted to `[[wikilinks]]`
- **Video cards export empty** — warning added to the note
- **Audio files have no extension** — noted in the converted file
- **File attachments wrapped in .zip** — copied to `attachments/` folder
- **Unicode narrow no-break spaces** in filenames — normalized
- **HTML entities** (`&nbsp;`, `&rsquo;`, etc.) — properly decoded

For the full list of 17 documented issues with Zoho's export format, see [ZOHO-EXPORT-ISSUES.md](./ZOHO-EXPORT-ISSUES.md).

## Supported Card Types

| Card Type | Conversion |
|---|---|
| Text Card | Full rich text conversion (bold, italic, lists, links, etc.) |
| Checklist Card | `- [ ]` / `- [x]` Obsidian checkboxes |
| Photo Card | `![[image.png]]` wikilink embed |
| Sketch Card | Same as Photo Card |
| File Card | Copied to `attachments/`, linked in note |
| Audio Card | Copied to `attachments/`, with extension warning |
| Video Card | Warning that content was lost in export |
| Bookmark Card | `[Title](url)` markdown link (Znote export only) |

## Options

```
Usage: zoho-notebook-to-obsidian <input> <output>

Arguments:
  input       Path to Zoho export .zip or extracted folder
  output      Path to output directory (created if needed)

Options:
  --skip-empty    Skip notes with no content (default: false)
  --verbose       Log each file being processed
  -V, --version   Output the version number
  -h, --help      Display help
```

## Output Format

The tool organizes notes into folders by notebook name:

```
output/
├── my-notebook/
│   ├── Meeting Notes.md
│   ├── Project Ideas.md
│   └── Task List.md
├── another-notebook/
│   └── Research.md
└── attachments/
    ├── image123.jpeg
    └── document456.zip
```

Each note includes YAML frontmatter:

```yaml
---
title: "Meeting Notes"
notebook: "My Notebook"
created: 2024-03-15
modified: 2024-06-20
tags:
  - zoho-notebook
  - my-notebook
aliases:
  - "Meeting Notes"
source: zoho-notebook
---
```

### Frontmatter Fields

- **tags**: Always includes `zoho-notebook` + a slugified notebook name
- **aliases**: Original note title (enables `[[Note Title]]` wikilinks)
- **created/modified**: `YYYY-MM-DD` format (recognized as date type in Obsidian Properties)

## Formatting Conversion

| Zoho HTML | Obsidian Markdown |
|---|---|
| `<b>text</b>` | `**text**` |
| `<em>text</em>` | `*text*` |
| `<u>text</u>` | `<u>text</u>` |
| `<strike>text</strike>` | `~~text~~` |
| `<span class="highlight">` | `==text==` |
| `<blockquote>` | `> quoted text` |
| `<pre class="zn-code">` | ` ```code``` ` |
| `<table>` | Markdown table |
| `<input type="checkbox">` | `- [ ]` / `- [x]` |
| `<img src="file.jpg">` | `![[file.jpg]]` |
| `zohonotebook://notes/ID` | `[[Note Title]]` |

## Why This Tool Exists

Switching between productivity tools shouldn't mean losing your notes or spending hours reformatting them. Zoho Notebook's export format has enough quirks that a manual copy-paste or generic HTML importer produces poor results.

This tool ensures your notes arrive in Obsidian clean, organized, and ready to use — so you can focus on your work instead of fighting with formatting.

For a detailed side-by-side comparison with Obsidian's built-in HTML importer, see [the comparison document](./docs/zoho-importer-comparison.md).

## License

[O'Saasy License](./LICENSE) — MIT-like, with a restriction against competing SaaS use.
