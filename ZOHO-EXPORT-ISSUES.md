# Zoho Notebook Export Issues

A comprehensive catalog of every problem found in Zoho Notebook's HTML export format, discovered while building the [zoho-notebook-to-obsidian](https://github.com/tejasgadhia/zoho-notebook-to-obsidian) converter. Documented here so Zoho's engineering team can fix these, and so users migrating from Zoho Notebook know what to expect.

**Export tested:** February 2026, Zoho Notebook web app (HTML export)
**Notes in export:** 31 notes across 6 notebooks, all 8 card types

---

## Data Loss Issues (Content Permanently Lost)

### 1. Video card content is empty

**Severity:** Critical — data is gone, no recovery possible

Video cards export with an entirely empty `<content></content>` tag. The video file is not included anywhere in the export zip. The only trace that a video existed is the note title (which contains the original filename, e.g., "Zia - Generative AI.webm").

```html
<!-- Actual export for a video card -->
<content></content>
```

**Expected:** The video file should be included in the export and referenced in the HTML, similar to how photo cards work.

**Impact:** Any videos stored in Zoho Notebook are permanently inaccessible after export. Users have no way to recover them without re-downloading from the Zoho Notebook app.

### 2. Audio files exported without file extension

**Severity:** High — file exists but is unusable without manual work

Audio card files are included in the export but with no file extension. The filename is just a Zoho internal ID (e.g., `22bt45c61426ddcd6463a9aed90e2a97d6088`). There is no metadata anywhere in the export indicating the original format (.m4a, .webm, .ogg, etc.).

```html
<content><a href="22bt45c61426ddcd6463a9aed90e2a97d6088">Voice Memo</a></content>
```

**Expected:** Audio files should retain their original extension, or the format should be specified in metadata.

**Impact:** Users must manually inspect the file's binary headers or guess the format to make the audio playable.

---

## Data Integrity Issues (Content Altered or Degraded)

### 3. File cards wrap originals in an unnecessary .zip layer

**Severity:** Medium — file is recoverable but inconvenient

When you attach a file to a Zoho Notebook note (e.g., `report.xlsx`), the export wraps it in a `.zip` file. The HTML references this zip, not the original file.

```html
<content><a href="22bt4b61d3535f02d4783ba75ba1932cbdb8f.zip">Zoho_AI_Catalog_Functional.xlsx</a></content>
```

**Expected:** The original file should be included directly, or at minimum the zip should preserve the original filename inside.

**Impact:** Users must manually unzip each attached file to recover the original.

### 4. Unicode narrow no-break space (U+202F) in filenames

**Severity:** Medium — causes cross-platform filename issues

Photo card filenames contain Unicode narrow no-break space characters (U+202F) instead of regular spaces. For example, a macOS screenshot filename like `Screenshot 2026-02-19 at 11.25.36 PM.png` has U+202F before "PM" because macOS uses this character in timestamps. Zoho preserves this character in the export filename, causing issues on some systems and tools that don't handle it.

```
Actual filename bytes: Screenshot 2026-02-19 at 11.25.36\xe2\x80\xafPM.png
                                                         ^^^^^^^^^^^^^^^^
                                                         U+202F narrow no-break space
```

**Expected:** Normalize filenames to standard ASCII/Unicode spaces on export.

### 5. Internal note links use non-standard protocol

**Severity:** Low — links are non-functional outside Zoho but link text is preserved

Links between notes use a `zohonotebook://notes/<ID>` protocol that only resolves inside the Zoho Notebook app. Once exported, these links are dead.

```html
<a href="zohonotebook://notes/gsgjka0eb01241c1b4494995cb44120ca4262">link</a>
```

Additionally, auto-generated links use the generic text "link" instead of the target note's title, making it impossible to determine the link target without the note ID mapping.

**Expected:** Export should resolve internal links to relative HTML file paths (`href="gsgjka0eb....html"`) or include a mapping file.

---

## HTML Format Issues (Non-Standard Markup)

### 6. Non-standard `<content>` HTML tag

**Severity:** Medium — breaks standard HTML parsers and importers

All note body content is wrapped in a `<content>` tag, which is not a valid HTML element. Standard HTML parsers and Obsidian's built-in importer don't handle this correctly.

```html
<body data-notebook='...' data-notecard='...'>
  <content>
    <!-- all note content here -->
  </content>
</body>
```

**Expected:** Use a standard HTML element like `<main>`, `<article>`, or `<div class="content">`.

### 7. Double-nested `<content>` tags

**Severity:** Low — affects some notes unpredictably

Some notes have `<content><content>...</content></content>` — an extra layer of nesting for no apparent reason.

```html
<content><content><div>Actual content here</div></content></content>
```

**Expected:** Consistent single `<content>` wrapper (or better, a standard HTML element).

### 8. Invalid list nesting — `<ul>` directly inside `<ul>`

**Severity:** Medium — produces malformed HTML that confuses parsers

Nested lists use `<ul>` as a direct child of `<ul>`, which is invalid HTML. The spec requires nested lists to be inside an `<li>` element.

```html
<!-- What Zoho exports (invalid) -->
<ul>
  <li>Item one</li>
  <ul>
    <li>Nested item</li>
  </ul>
</ul>

<!-- What valid HTML looks like -->
<ul>
  <li>Item one
    <ul>
      <li>Nested item</li>
    </ul>
  </li>
</ul>
```

**Expected:** Valid HTML list nesting.

### 9. Single-line HTML with no formatting

**Severity:** Low — makes manual inspection impossible

Every HTML file is exported as a single line with no whitespace or indentation. A note with 50 paragraphs, nested lists, and tables is one continuous string.

**Expected:** Readable HTML with standard indentation, or at minimum line breaks between elements.

### 10. `<li>` content wrapped in unnecessary `<div>`

**Severity:** Low — adds complexity for parsers

List items wrap their text content in an extra `<div>`:

```html
<li><div>List item text</div></li>
```

**Expected:** `<li>List item text</li>` — direct text content without wrapper.

### 11. Empty bold spacer divs instead of blank lines

**Severity:** Low — editor artifact that shouldn't be in export

The export includes empty bold elements used as visual spacers in the editor:

```html
<div><b><br></b></div>
<div><strong><br></strong></div>
```

**Expected:** These should be stripped during export or converted to empty paragraphs.

### 12. `rte-ignore-br` class on `<br>` tags

**Severity:** Low — internal editor metadata leaked into export

Some `<br>` tags have a `class="rte-ignore-br"` attribute, which is an internal Rich Text Editor annotation that has no meaning outside Zoho's editor.

```html
<div>Text with<br class="rte-ignore-br"> a break</div>
```

**Expected:** Strip internal class annotations during export.

### 13. Checkbox content nested in unnecessary wrapper divs

**Severity:** Low — works but over-complicated

Checklist items are deeply nested in div wrappers instead of using a flat structure:

```html
<div><div><input type="checkbox"><span>Task text</span></div></div>
```

**Expected:** Flat structure: `<input type="checkbox"><label>Task text</label>`

---

## Metadata Issues

### 14. JSON metadata uses HTML entity encoding

**Severity:** Low — parsable but non-standard

The `data-notebook` and `data-notecard` attributes contain JSON that's been HTML-entity-encoded:

```html
<body data-notebook="{&quot;name&quot;:&quot;My Notebook&quot;,...}">
```

Most HTML parsers auto-decode these, but it adds an unnecessary encoding layer.

**Expected:** Use `data-*` attributes with properly escaped JSON, or use a separate JSON metadata file.

### 15. No export manifest or index with useful metadata

**Severity:** Medium — makes programmatic processing harder

The `index.html` file in the export is a simple visual table of contents with links to each note. There is no machine-readable manifest (JSON, XML, CSV) listing:
- All notes with their IDs, titles, and notebook assignments
- All attachments with their original filenames and formats
- Notebook metadata (name, cover, creation date)
- Note-to-note link relationships

**Expected:** Include a `manifest.json` with structured metadata alongside the HTML files.

### 16. Cover images included but not programmatically linked

**Severity:** Low — cosmetic only

The `PrivateCovers/` folder contains notebook cover images, but there's no reliable way to associate them with their notebooks. The `data-notebook` JSON has `cover_id` and `is_private` fields, but the mapping between `cover_id` and the actual PNG filename in `PrivateCovers/` is not documented.

### 17. Notes titled "Untitled" with no content-based fallback

**Severity:** Low — user experience issue

Many notes have the title "Untitled" because the user never explicitly named them. Zoho could infer a title from the first line of content (like Apple Notes and Google Keep do) but doesn't.

---

## Summary by Card Type

| Card Type | Export Quality | Issues |
|---|---|---|
| Text Card | Good | Non-standard HTML, minor formatting artifacts |
| Checklist Card | Good | Extra wrapper divs |
| Photo Card | Good | U+202F in filenames |
| Sketch Card | Good | Same as Photo Card |
| File Card | Acceptable | Wrapped in unnecessary .zip |
| Audio Card | Poor | No file extension — format unknown |
| Video Card | **Broken** | Content completely missing |

---

## Recommendations for Zoho

1. **Include video files in export** — This is the most critical issue. Users lose data.
2. **Preserve audio file extensions** — Without them, audio files are unusable.
3. **Export original files directly** — Don't wrap attachments in .zip.
4. **Use valid HTML** — Standard tags, proper nesting, readable formatting.
5. **Include a manifest.json** — Machine-readable metadata enables ecosystem tools.
6. **Resolve internal links** — Convert `zohonotebook://` to relative paths.
7. **Normalize filenames** — Strip non-standard Unicode characters.
