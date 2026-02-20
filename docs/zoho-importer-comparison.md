# Migrating from Zoho Notebook to Obsidian: A Comparison

## Why This Comparison Exists

Zoho Notebook is excellent for quick capture — voice memos, photos, checklists, and rich text cards from any device. Obsidian is excellent for long-term knowledge management — backlinks, graph views, and local-first Markdown files you own forever.

When migrating between them, Obsidian's built-in [Importer plugin](https://help.obsidian.md/import/html) handles generic HTML well, but Zoho's export uses a non-standard format (custom `<content>` tags, `zohonotebook://` protocol links, metadata in `data-*` attributes) that needs specialized handling. This document shows the difference between the two approaches so you can choose the right one.

## Test Setup

The same Zoho Notebook HTML export (31 notes across 6 notebooks, all 8 card types) was imported through both paths:

- **Obsidian Importer**: Built-in community plugin, "HTML files" import mode
- **zoho-notebook-to-obsidian**: v1.0.0, run as `npx zoho-notebook-to-obsidian export.zip ./vault`

## Results at a Glance

| Feature | Obsidian Importer | zoho-notebook-to-obsidian |
|---|---|---|
| **Folder organization** | Single folder (flat) | Organized by notebook name |
| **Filenames** | Zoho internal IDs (`gsgjk4d52d...`) | Note titles (`Parts List.md`) |
| **YAML frontmatter** | None | Title, notebook, dates, tags, aliases |
| **Created/modified dates** | Not preserved | Preserved from Zoho metadata |
| **Checklists** | Plain text or raw HTML | Interactive `- [ ]` / `- [x]` tasks |
| **Image attachments** | Broken references | Copied to `attachments/` + `![[wikilink]]` |
| **File attachments** | Not handled | Copied to `attachments/` + linked |
| **Internal note links** | Dead `zohonotebook://` URLs | Resolved `[[wikilinks]]` |
| **Nested lists** | May lose indentation depth | Correct nesting preserved |
| **Missing content alerts** | None | Warning added for lost video/audio |
| **Card type awareness** | Treats all as generic HTML | Handles all 8 Zoho card types |

## Detailed Comparison

### 1. Organization & Filenames

Zoho Notebook organizes notes into notebooks (folders), but the HTML export dumps everything into a single directory with internal ID filenames like `gsgjk4d52debe7a794b4ebf8e329093635ed9.html`.

**Obsidian Importer**: Imports all files into one folder. Filenames remain as internal IDs — you'd need to manually rename every file and organize them into folders.

**zoho-notebook-to-obsidian**: Reads the `data-notebook` metadata from each file and creates matching folders. Notes get their actual title as the filename:

```
vault/
├── tflix-v2/
│   ├── Parts List.md
│   ├── IPMI.md
│   └── DAS Components.md
├── zoho-generic/
│   ├── Austin Events.md
│   └── ...
├── quick-notes/
│   └── ...
└── attachments/
    ├── image.png
    └── document.zip
```

<!-- Screenshot: comparison/01-folder-structure-native.png vs comparison/01-folder-structure-tool.png -->

### 2. Metadata & Dates

Zoho's export stores useful metadata in `data-notebook` and `data-notecard` HTML attributes — notebook name, note color, creation date, modification date. This information is invisible to a generic HTML importer.

**Obsidian Importer**: No frontmatter. Dates are lost. You'd need to manually add metadata to each note.

**zoho-notebook-to-obsidian**: Extracts all metadata into YAML frontmatter:

```yaml
---
title: "IPMI"
notebook: "TFLIX v2"
created: 2019-11-25
modified: 2019-11-26
tags:
  - zoho-notebook
  - tflix-v2
aliases:
  - "IPMI"
source: zoho-notebook
---
```

The `aliases` field means `[[IPMI]]` wikilinks resolve correctly. The `zoho-notebook` tag lets you filter all imported notes. Dates use `YYYY-MM-DD` format, which Obsidian recognizes as date type in Properties view.

<!-- Screenshot: comparison/02-metadata-native.png vs comparison/02-metadata-tool.png -->

### 3. Checklists

Zoho Notebook's checklist cards use `<input type="checkbox">` elements with `checked="true"` for completed items.

**Obsidian Importer**: Checkboxes may render as plain text or raw HTML, losing their interactive state.

**zoho-notebook-to-obsidian**: Converts to Obsidian's native task syntax:

```markdown
- [ ] Rack: StarTech 4POSTRACK12U
- [ ] Chassis: Norco RPC-4220
- [ ] CPU: 2x Intel Xeon E5-2665
- [x] Already ordered item
```

These are fully interactive in Obsidian — click to toggle.

<!-- Screenshot: comparison/03-checklist-native.png vs comparison/03-checklist-tool.png -->

### 4. Images & Attachments

Zoho's export includes image files alongside the HTML, but references them by internal IDs. File card attachments are wrapped in an extra `.zip` layer.

**Obsidian Importer**: Image references may break since the files aren't automatically copied to the vault's attachment folder. File attachments aren't handled.

**zoho-notebook-to-obsidian**: Copies all images and files to `attachments/` and uses Obsidian wikilink embeds:

```markdown
![[attachments/22bt467ffa6d43fde4a20852438497ef3c8dd.png]]
```

File cards include descriptive text:

```markdown
Attached file: ![[attachments/22bt4b61d3535f02d4783ba75ba1932cbdb8f.zip]]
```

<!-- Screenshot: comparison/04-image-native.png vs comparison/04-image-tool.png -->

### 5. Content Gaps (Video & Audio Cards)

Zoho's export has two data loss issues: video cards export with empty content (the video file is not included), and audio files are exported without file extensions.

**Obsidian Importer**: Produces an empty note with no indication that content was lost.

**zoho-notebook-to-obsidian**: Adds a visible warning so you know to recover the original from Zoho:

```markdown
> **Warning**: Video content was not included in Zoho's export.
> The original file "Zia - Generative AI.webm" could not be recovered.
```

For audio files, the tool copies the extensionless file and notes the issue. See [ZOHO-EXPORT-ISSUES.md](../ZOHO-EXPORT-ISSUES.md) for the full list of 17 documented export format issues.

<!-- Screenshot: comparison/05-video-native.png vs comparison/05-video-tool.png -->

### 6. Rich Text & Formatting

Both tools handle basic formatting (bold, italic, links). The differences appear in edge cases:

| Element | Obsidian Importer | zoho-notebook-to-obsidian |
|---|---|---|
| `<content>` wrapper | May confuse parser | Handled correctly |
| Double-nested `<content>` | Not handled | Unwrapped cleanly |
| `<ul>` inside `<ul>` (invalid HTML) | May lose nesting | Corrected to proper indentation |
| `zohonotebook://` links | Left as dead URLs | Resolved to `[[wikilinks]]` |
| Empty bold spacer `<div>`s | May produce artifacts | Stripped cleanly |
| Highlight `<span>` | Not converted | Converted to `==highlight==` |
| Code blocks | Basic support | Proper `` ``` `` fencing |
| Tables | Basic support | Full Markdown table conversion |

## Which Should You Use?

**Use Obsidian's built-in Importer** if:
- You have a small number of notes and don't mind manual cleanup
- You primarily had simple text notes without checklists, images, or attachments
- You want the simplest possible workflow

**Use zoho-notebook-to-obsidian** if:
- You want a ready-to-use vault with no manual cleanup
- You have checklists, images, file attachments, or multiple notebooks
- You want to preserve creation/modification dates and notebook organization
- You need internal note links to work as `[[wikilinks]]`
- You want clear warnings about any content that was lost during Zoho's export

## Getting Started

```bash
# One command — no install needed
npx zoho-notebook-to-obsidian ./Notebook_export.zip ./my-obsidian-vault

# Or with the Znote export (recommended — richer metadata)
npx zoho-notebook-to-obsidian ./Notebook_znote_export.zip ./my-obsidian-vault
```

For full documentation, see the [README](../README.md). For details on every Zoho export issue this tool handles, see [ZOHO-EXPORT-ISSUES.md](../ZOHO-EXPORT-ISSUES.md).
