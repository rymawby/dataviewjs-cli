# dataviewjs-cli

Run DataviewJS outside Obsidian.

`dataviewjs-cli` is a small CLI for rendering a practical subset of Obsidian workflows from the terminal. It started as a personal tool, largely vibe engineered to make it easier to inspect `dataviewjs`, `dv.view(...)`, and daily-note templates without launching Obsidian. If it is useful to someone else, use it.

The project currently focuses on:

- executing `dataviewjs` snippets against a vault
- rendering a useful subset of Dataview’s code-reference API
- loading custom `dv.view(...)` scripts from the vault
- rendering daily notes that mix Templater, transclusions, and Dataview blocks

It is not a full reimplementation of Obsidian, Dataview, or Templater.

## What It Can Do

Current capabilities:

- scan a vault and index markdown notes
- parse frontmatter, inline fields, tasks, tags, links, and backlinks
- execute `dataviewjs` with an injected `dv` object
- render `dataview` query blocks
- load `dv.view(...)` scripts from the vault
- render markdown output, JSON output, or plain text output
- render a daily-note pipeline with:
  - Templater commands
  - `tp.user.*` helper scripts
  - markdown transclusions like `![[Note#Section]]`
  - `dataview` and `dataviewjs` blocks

## What It Is Not

This repo is intentionally scoped.

It does not currently aim for:

- full Obsidian plugin emulation
- exact DOM parity with Dataview inside Obsidian
- complete Templater compatibility
- full Dataview query-language support
- write operations into the vault as part of rendering

The goal is practical offline rendering, debugging, and automation, not perfect plugin fidelity.

## Installation

At the moment this repo is intended to be run directly with Node.

Requirements:

- Node.js 20+

Clone the repo and run commands with:

```bash
node src/cli.js ...
```

## Commands

### `run`

Run a DataviewJS script file:

```bash
node src/cli.js run \
  --vault /path/to/vault \
  --current journal/2025-01-16.md \
  ./script.dvjs
```

### `eval`

Evaluate inline DataviewJS:

```bash
node src/cli.js eval \
  --vault /path/to/vault \
  --current journal/2025-01-16.md \
  'await dv.view("scripts-for-templater/listMeetingNotesFromThisDay");'
```

### `daily`

Render a dated daily note:

```bash
node src/cli.js daily \
  --vault /path/to/vault \
  --date 2026-03-20
```

This command:

1. resolves the daily note path for the requested date
2. uses the existing note if it exists
3. otherwise falls back to a template
4. renders supported Templater expressions
5. expands markdown transclusions
6. renders `dataview` and `dataviewjs` blocks

## CLI Reference

```text
dataviewjs run --vault <path> --current <note.md> <script-file>
dataviewjs eval --vault <path> --current <note.md> "<script>"
dataviewjs daily --vault <path> [--date <YYYY-MM-DD>]
```

Options:

- `--vault <path>`: vault root
- `--current <path>`: current note path relative to the vault
- `--format <name>`: `markdown`, `json`, or `text`
- `--date <YYYY-MM-DD>`: date for `daily`
- `--template <path>`: template used by `daily`
- `--daily-folder <path>`: daily notes folder used by `daily`
- `--templater-scripts <path>`: root folder for `tp.user.*` functions

## Supported Dataview API Surface

The runtime currently supports a broad practical subset of the Dataview code-reference API.

Core page access:

- `dv.current()`
- `dv.page(...)`
- `dv.pages(...)`
- `dv.pagePaths(...)`

Render helpers:

- `dv.el(...)`
- `dv.header(...)`
- `dv.paragraph(...)`
- `dv.span(...)`
- `dv.list(...)`
- `dv.taskList(...)`
- `dv.table(...)`
- `dv.markdownList(...)`
- `dv.markdownTaskList(...)`
- `dv.markdownTable(...)`
- `dv.execute(...)`
- `dv.executeJs(...)`
- `dv.view(...)`

Utility helpers:

- `dv.array(...)`
- `dv.isArray(...)`
- `dv.fileLink(...)`
- `dv.sectionLink(...)`
- `dv.blockLink(...)`
- `dv.date(...)`
- `dv.duration(...)`
- `dv.compare(...)`
- `dv.equal(...)`
- `dv.clone(...)`
- `dv.parse(...)`

File I/O:

- `dv.io.csv(...)`
- `dv.io.load(...)`
- `dv.io.normalize(...)`

Query and evaluation helpers:

- `dv.query(...)`
- `dv.tryQuery(...)`
- `dv.queryMarkdown(...)`
- `dv.tryQueryMarkdown(...)`
- `dv.evaluate(...)`
- `dv.tryEvaluate(...)`

## Daily Rendering Scope

The `daily` command is intentionally scoped to the patterns already common in real Obsidian workflows.

Current support includes:

- `<% ... %>` Templater expressions
- `<%* ... %>` execution blocks
- `tp.file.title`
- `tp.file.path()`
- `tp.file.exists(...)`
- `tp.frontmatter`
- `tp.user.*` user-function loading from a script folder
- markdown transclusions like `![[Note]]` and `![[Note#Section]]`
- `dataview` and `dataviewjs` blocks after template expansion

If `--templater-scripts` is omitted, the CLI looks for common folders such as:

- `scripts/scripts-for-templater/isolated`
- `scripts/templater`
- `scripts/user`
- `scripts`

This is read-only rendering. It is meant to show what a note would produce, not to emulate every Templater side effect.

## Query Support

Dataview query support is compatibility-focused rather than complete.

Currently supported query families:

- `LIST`
- `TABLE`
- `TASK`

Currently supported clauses:

- `FROM`
- `FLATTEN`
- `WHERE`
- `SORT`
- `LIMIT`

That is enough for many CLI workflows, but it is not a full Dataview DQL implementation.

## Vault Parsing Behavior

The vault indexer currently supports:

- YAML frontmatter fields
- YAML list-style tags
- inline fields like `owner:: Alice`
- markdown tasks like `- [ ] Task`
- inline `#tags`
- wikilinks like:
  - `[[Note]]`
  - `[[folder/Note]]`
  - `[[Note#Section]]`
  - `[[Note|Alias]]`
- backlink tracking via `file.inlinks`
- `file.day` inference from filenames like `2025-01-16.md`

Code fences are stripped before metadata extraction so tags and links inside code blocks are not indexed as note metadata.

## `dv.view(...)` Support

Custom views can be loaded from:

- `<vault>/<path>.js`
- `<vault>/<path>/view.js`
- `<vault>/scripts/<path>.js`
- `<vault>/scripts/<path>/view.js`

If a folder-based `view.js` has a sibling `view.css`, that CSS is injected into the rendered output.

## Development

Run the test suite with:

```bash
npm test
```

The project currently uses:

- Node.js built-in test runner
- no external runtime dependencies
- fixture vault data under `fixtures/vault`

## Test Coverage

The current test suite covers:

- CLI `run`
- CLI `eval`
- CLI `daily`
- vault indexing and backlink resolution
- basename wikilink resolution
- `dv.view(...)`
- render helpers
- Dataview utility helpers
- file I/O helpers
- query and evaluation helpers
- Templater rendering
- markdown transclusions
- end-to-end daily rendering

The test suite must pass before changes should be considered complete.

## Project Layout

```text
src/
  cli.js
  daily.js
  runtime.js
  vault.js
fixtures/
  vault/
  scripts/
test/
  cli.test.js
skills/
  dataviewjs-cli/
```

## Roadmap

Likely next improvements:

- broader DQL support
- richer task/list metadata parity
- more Templater compatibility
- better embed/transclusion fidelity
- improved date and duration semantics
- packaging as a published npm CLI

## License

MIT. See [LICENSE](./LICENSE).
