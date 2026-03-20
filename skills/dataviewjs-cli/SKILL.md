---
name: dataviewjs-cli
description: Use this when you need to run, debug, or extend this repository’s CLI for rendering DataviewJS, Dataview queries, vault-backed `dv.view(...)` scripts, or daily notes that combine Templater, transclusions, and Dataview outside Obsidian.
---

# DataviewJS CLI

Use this skill for work in this repository when the goal is to render or debug Obsidian note output from the terminal.

## When To Use It

- Running a `dataviewjs` snippet outside Obsidian
- Checking whether a Dataview API shape is supported by the CLI
- Debugging `dv.view(...)` behavior against a real vault
- Extending Dataview compatibility in `src/runtime.js`
- Working on the `daily` command
- Debugging Templater + transclusion + Dataview rendering together

## Main Commands

Run a script file:

```bash
node src/cli.js run --vault <vault-path> --current <note.md> <script-file>
```

Run inline DataviewJS:

```bash
node src/cli.js eval --vault <vault-path> --current <note.md> '<script>'
```

Render a daily note:

```bash
node src/cli.js daily --vault <vault-path> --date <YYYY-MM-DD>
```

Run tests:

```bash
npm test
```

## Working Approach

1. Reproduce the user’s exact command first.
2. Read the relevant code before patching:
   - `src/cli.js`
   - `src/daily.js`
   - `src/runtime.js`
   - `src/vault.js`
3. If behavior is wrong, add or adjust fixtures under `fixtures/vault` or `fixtures/scripts`.
4. Add a failing test in `test/cli.test.js`.
5. Patch the implementation.
6. Run `npm test` before claiming completion.

## Important Architecture

- `src/cli.js`: command entrypoint for `run`, `eval`, and `daily`
- `src/runtime.js`: Dataview-compatible runtime and block rendering
- `src/daily.js`: Templater shim, transclusion expansion, and daily-note pipeline
- `src/vault.js`: vault scanning and metadata extraction

The `daily` pipeline is:

1. resolve the daily note path
2. load the existing note or fall back to a template
3. render supported Templater commands
4. expand markdown transclusions
5. render `dataview` and `dataviewjs` blocks

## Current Compatibility Notes

- Dataview support is broad but still compatibility-focused, not a full plugin reimplementation.
- DQL support is partial.
- Templater support is scoped to the patterns already used by the repo, especially:
  - `<% ... %>`
  - `<%* ... %>`
  - `tp.file.title`
  - `tp.file.path()`
  - `tp.file.exists(...)`
  - `tp.frontmatter`
  - `tp.user.*`
- `dv.view(...)` can resolve from the vault root or from `scripts/...`.
- Code fences are stripped before vault metadata extraction so inline tags and links inside code blocks are ignored.

## Failure Modes To Check First

If output is missing or wrong, inspect:

- whether `--current` points at the real note path
- whether a daily note exists and is being preferred over the template
- whether `--templater-scripts` points at the correct user-function folder
- whether the note relies on unsupported Templater APIs
- whether a `dv.view(...)` path resolves to `.js` or `view.js`
- whether tags come from frontmatter or inline tags
- whether the vault actually contains matching notes for the query

## Files To Update Together

When changing behavior, update the relevant pairings:

- runtime changes with tests in `test/cli.test.js`
- daily-rendering changes with fixture templates or scripts in `fixtures/vault`
- public CLI changes with `README.md`
