# dataviewjs-cli

Run a practical DataviewJS-compatible subset outside Obsidian.

This project lets you execute `dataviewjs` scripts against an Obsidian vault from the command line, without launching Obsidian. It is designed for scripting, testing, CI workflows, and debugging DataviewJS snippets against real markdown content.

This was mainly vibe engineered for personal use. If it is useful to someone else, use it.

## What It Does

- Scans an Obsidian vault and indexes markdown notes
- Parses frontmatter, inline fields, tasks, tags, links, and backlinks
- Injects a Dataview-like `dv` object into a script runtime
- Renders output as Markdown, JSON, or plain text
- Supports loading custom `dv.view(...)` scripts from the vault
- Supports a compatibility-focused subset of Dataview query and utility APIs

## Status

This is not a full reimplementation of Obsidian or the Dataview plugin.

It currently aims to support the documented DataviewJS code-reference surface well enough for real CLI usage, but some areas are still compatibility approximations:

- DQL parsing is partial, not a full Dataview parser
- Rendering targets Markdown/JSON/text output, not Obsidian DOM output
- Vault metadata is inferred from files on disk, not from Obsidian internals
- Advanced Dataview edge cases may still differ from the plugin

## Features

Currently supported:

- Core page access:
  - `dv.current()`
  - `dv.page(...)`
  - `dv.pages(...)`
  - `dv.pagePaths(...)`
- Rendering:
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
- Utility/value helpers:
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
- File I/O:
  - `dv.io.csv(...)`
  - `dv.io.load(...)`
  - `dv.io.normalize(...)`
- Query/evaluation helpers:
  - `dv.query(...)`
  - `dv.tryQuery(...)`
  - `dv.queryMarkdown(...)`
  - `dv.tryQueryMarkdown(...)`
  - `dv.evaluate(...)`
  - `dv.tryEvaluate(...)`

## CLI Usage

Run a script file:

```bash
node src/cli.js run \
  --vault ~/Projects/Obsidian/rymawby \
  --current journal/2025-01-16.md \
  fixtures/scripts/project-table.dvjs
```

Evaluate inline DataviewJS:

```bash
node src/cli.js eval \
  --vault ~/Projects/Obsidian/rymawby \
  --current journal/2025-01-16.md \
  'await dv.view("scripts-for-templater/listMeetingNotesFromThisDay");'
```

Choose an output format:

```bash
node src/cli.js eval \
  --vault ./fixtures/vault \
  --current Projects/Alpha.md \
  --format json \
  'dv.list(dv.pages("#person").map(p => p.file.name));'
```

## CLI Reference

```text
dataviewjs run --vault <path> --current <note.md> <script-file>
dataviewjs eval --vault <path> --current <note.md> "<script>"
```

Options:

- `--vault <path>`: Path to the vault root
- `--current <path>`: Current note path relative to the vault
- `--format <name>`: `markdown`, `json`, or `text`

## How It Works

The runtime:

1. Walks the vault and indexes all markdown files.
2. Extracts frontmatter, inline fields, tasks, tags, links, and backlinks.
3. Resolves Obsidian-style wikilinks, including basename-style links like `[[2025-01-16]]`.
4. Creates a Dataview-like execution context with `dv`.
5. Executes the script in a Node VM sandbox.
6. Collects rendered output and prints it to stdout.

## Supported Vault Behaviors

The indexer currently supports:

- YAML frontmatter fields
- YAML list-style tags
- Inline fields like `owner:: Alice`
- Markdown tasks like `- [ ] Task`
- Inline `#tags`
- Wikilinks like:
  - `[[Note]]`
  - `[[folder/Note]]`
  - `[[Note#Section]]`
  - `[[Note|Alias]]`
- Backlink tracking via `file.inlinks`
- Basic `file.day` inference from filenames like `2025-01-16.md`

## `dv.view(...)` Support

Custom views can be loaded from either:

- `<vault>/<path>.js`
- `<vault>/<path>/view.js`
- `<vault>/scripts/<path>.js`
- `<vault>/scripts/<path>/view.js`

If a `view.css` file exists beside a folder-based `view.js`, it is injected into the rendered output.

Example:

```js
await dv.view("scripts-for-templater/listMeetingNotesFromThisDay");
```

## Query Support

The query APIs are implemented with a compatibility-focused subset of Dataview query language.

Supported query families:

- `LIST`
- `TABLE`
- `TASK`

Supported clauses:

- `FROM`
- `FLATTEN`
- `WHERE`
- `SORT`
- `LIMIT`

This is enough for many practical CLI workflows, but it is not yet a full Dataview DQL implementation.

## Development

Run the test suite:

```bash
npm test
```

The project uses:

- Node.js built-in test runner
- no external runtime dependencies
- fixture vault data under `fixtures/vault`

## Test Coverage

The current test suite covers:

- CLI `run` and `eval`
- vault indexing and backlink resolution
- basename wikilink resolution
- `dv.view(...)`
- render helpers
- value helpers
- file I/O helpers
- query/evaluation helpers

The test suite must pass before changes should be considered complete.

## Project Layout

```text
src/
  cli.js
  runtime.js
  vault.js
fixtures/
  vault/
  scripts/
test/
  cli.test.js
```

## Roadmap

Likely next improvements:

- broader DQL coverage
- better task/list metadata parity
- richer date/duration compatibility
- more exact Dataview value semantics
- packaging as a published npm CLI

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
