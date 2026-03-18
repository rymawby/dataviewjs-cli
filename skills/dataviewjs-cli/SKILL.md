---
name: dataviewjs-cli
description: Use this when you need to run or debug DataviewJS outside Obsidian, validate a DataviewJS snippet against an Obsidian vault, inspect `dv.view(...)` output, or check CLI compatibility for Dataview code in this repository.
---

# DataviewJS CLI

Use this skill when the task is to execute `dataviewjs` against a vault without opening Obsidian.

## When To Use It

- Running a `dataviewjs` snippet from the command line
- Debugging why a DataviewJS script behaves differently outside Obsidian
- Verifying `dv.view(...)` output
- Checking whether this CLI supports a Dataview API shape
- Adding compatibility tests for DataviewJS behavior

## Repo Workflow

1. Read the runtime in `src/runtime.js` and vault indexer in `src/vault.js` before changing behavior.
2. Reproduce the user’s exact command with `node src/cli.js ...`.
3. If the behavior is wrong, add or update a fixture under `fixtures/vault` or `fixtures/scripts`.
4. Add a test in `test/cli.test.js` that fails before the fix.
5. Patch the implementation.
6. Run `npm test` before claiming completion.

## Primary Commands

Run a script file:

```bash
node src/cli.js run --vault <vault-path> --current <note.md> <script-file>
```

Run inline code:

```bash
node src/cli.js eval --vault <vault-path> --current <note.md> '<script>'
```

Run tests:

```bash
npm test
```

## Implementation Notes

- The CLI is intentionally dependency-light and uses Node’s built-in test runner.
- Output formats are `markdown`, `json`, and `text`.
- `dv.view(...)` resolves from the vault root and from `scripts/...`.
- Wikilinks are resolved in an Obsidian-like way, including basename links such as `[[2025-01-16]]`.
- Query support is a compatibility subset, not a full Dataview parser.

## What To Check First

If a script fails or returns empty output, inspect:

- `dv.current()` path and whether `--current` matches the real note
- whether tags come from frontmatter or inline tags
- wikilink normalization and backlink resolution
- whether a `dv.view(...)` path resolves to `.js` or `view.js`
- whether the target vault actually contains matching notes for the query

## File Map

- `src/cli.js`: command-line entrypoint
- `src/runtime.js`: DataviewJS-compatible runtime
- `src/vault.js`: vault scanning and metadata extraction
- `fixtures/vault`: sample notes used by tests
- `fixtures/scripts`: sample DataviewJS scripts
- `test/cli.test.js`: end-to-end coverage
