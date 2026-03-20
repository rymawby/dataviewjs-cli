const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { runDataviewJs } = require("../src/runtime");
const { renderDailyNote } = require("../src/daily");

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, "..");
const vaultPath = path.join(root, "fixtures", "vault");
const cliPath = path.join(root, "src", "cli.js");

test("runtime renders markdown table from fixture script", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      const projects = dv.pages('"Projects"').sort((page) => page.rating);
      dv.table(
        ["Project", "Owner", "Status"],
        projects.map((page) => [page.file.name, page.owner, page.status])
      );
    `,
    format: "markdown"
  });

  assert.match(output, /\| Project \| Owner \| Status \|/);
  assert.match(output, /\| Beta \| Bob \| planned \|/);
  assert.match(output, /\| Alpha \| Alice \| active \|/);
});

test("runtime exposes current note and task data", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      const current = dv.current();
      dv.paragraph(current.file.path);
      dv.taskList(current.file.tasks);
    `,
    format: "markdown"
  });

  assert.match(output, /^Projects\/Alpha\.md/m);
  assert.match(output, /- \[ \] Draft proposal/);
  assert.match(output, /- \[x\] Kickoff meeting/);
});

test("runtime supports json output", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      dv.list(dv.pages("#person").map((page) => page.file.name));
    `,
    format: "json"
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed[0].type, "list");
  assert.deepEqual(parsed[0].items, ["Alice", "Bob"]);
});

test("cli eval renders markdown", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "eval",
    "--vault",
    vaultPath,
    "--current",
    "Projects/Alpha.md",
    'dv.list(dv.pages(\'"Projects"\').map((page) => page.file.name));'
  ]);

  assert.match(stdout, /- Alpha/);
  assert.match(stdout, /- Beta/);
});

test("cli run executes script file", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "run",
    "--vault",
    vaultPath,
    "--current",
    "Projects/Alpha.md",
    path.join(root, "fixtures", "scripts", "project-table.dvjs")
  ]);

  assert.match(stdout, /## Projects/);
  assert.match(stdout, /\| Alpha \| Alice \| active \| 1 \|/);
});

test("runtime exposes backlink metadata via file.inlinks", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "journal/2023-01-18.md",
    script: `
      const page = dv.page("2023-01-17");
      if (page.file.inlinks.length > 0) {
        dv.header(4, "Mentions");
      }
      dv.list(page.file.inlinks);
    `,
    format: "markdown"
  });

  assert.match(output, /#### Mentions/);
  assert.match(output, /- journal\/2023-01-18\.md/);
});

test("runtime resolves basename page lookups to markdown files", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "journal/2023-01-18.md",
    script: `
      const page = dv.page("2023-01-17");
      dv.paragraph(page.file.path);
    `,
    format: "markdown"
  });

  assert.match(output, /^journal\/2023-01-17\.md$/m);
});

test("cli run supports scripts that read page.file.inlinks", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "run",
    "--vault",
    vaultPath,
    "--current",
    "journal/2023-01-18.md",
    path.join(root, "fixtures", "scripts", "list.dvjs")
  ]);

  assert.match(stdout, /#### Mentions/);
  assert.match(stdout, /- journal\/2023-01-18\.md/);
});

test("runtime executes dv.view against a vault script", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "journal/2025-08-04.md",
    script: `
      await dv.view("scripts-for-templater/listMeetingNotesFromThisDay");
    `,
    format: "markdown"
  });

  assert.match(output, /\| Meeting Name \|/);
  assert.match(output, /\[\[LT weekly meeting Meeting 2025-08-04\]\]/);
  assert.match(output, /\[\[Another meeting 2025-08-04\]\]/);
});

test("cli eval supports dv.view with vault-relative script lookup", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "eval",
    "--vault",
    vaultPath,
    "--current",
    "journal/2025-08-04.md",
    'await dv.view("scripts-for-templater/listMeetingNotesFromThisDay");'
  ]);

  assert.match(stdout, /\| Meeting Name \|/);
  assert.match(stdout, /\[\[LT weekly meeting Meeting 2025-08-04\]\]/);
});

test("runtime supports render helpers, execute, and executeJs", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      dv.el("b", "Bold", { cls: "dataview-class", attr: { alt: "Nice!" } });
      await dv.execute("LIST FROM #person");
      await dv.executeJs('dv.span("inline output")');
    `,
    format: "markdown"
  });

  assert.match(output, /<b class="dataview-class" alt="Nice!">Bold<\/b>/);
  assert.match(output, /- \[\[People\/Alice\]\]/);
  assert.match(output, /inline output/);
});

test("runtime supports data-array projection and ungrouped task lists", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      dv.list(dv.pages("#project").file.name.sort());
      dv.taskList(dv.pages("#project").file.tasks.where(t => !t.completed), false);
    `,
    format: "markdown"
  });

  assert.match(output, /- Alpha/);
  assert.match(output, /- Beta/);
  assert.match(output, /- \[ \] Draft proposal/);
  assert.match(output, /- \[ \] Define scope/);
});

test("runtime supports utility helpers from the code reference", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      dv.list([
        dv.fileLink("Projects/Alpha", false, "Alpha Link"),
        dv.sectionLink("Projects/Alpha", "Books", false, "My Books"),
        dv.blockLink("Projects/Alpha", "block-1"),
        dv.date("2025-08-04").toFormat("yyyy-MM-dd"),
        dv.duration("9 hours, 2 minutes, 3 seconds").toString(),
        String(dv.compare("yes", "no")),
        String(dv.equal(1, 1)),
        JSON.stringify(dv.clone({ a: [1, 2] })),
        dv.parse("[[Projects/Alpha]]").markdown(),
        dv.parse("2020-08-14").toFormat("yyyy-MM-dd"),
        dv.parse("9 seconds").toString(),
        String(dv.isArray(dv.array([1, 2, 3]))),
        String(dv.isArray({ x: 1 }))
      ]);
    `,
    format: "markdown"
  });

  assert.match(output, /\[\[Projects\/Alpha\|Alpha Link\]\]/);
  assert.match(output, /\[\[Projects\/Alpha#Books\|My Books\]\]/);
  assert.match(output, /\[\[Projects\/Alpha#\^block-1\]\]/);
  assert.match(output, /2025-08-04/);
  assert.match(output, /9 hours, 2 minutes, 3 seconds/);
  assert.match(output, /- 1/);
  assert.match(output, /- true/);
  assert.match(output, /- false/);
});

test("runtime supports file io helpers", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      const normalized = dv.io.normalize("details.txt");
      const text = await dv.io.load("details.txt");
      const csv = await dv.io.csv("hello.csv");
      dv.table(["Path", "Text", "CSV"], [[normalized, text, csv.first().name]]);
    `,
    format: "markdown"
  });

  assert.match(output, /\| Projects\/details\.txt \| Project Alpha detail file\.<br> \| Alice \|/);
});

test("runtime supports query and evaluation helpers", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      const query = await dv.query("TABLE WITHOUT ID file.name, rating FROM #project SORT rating DESC");
      const taskQuery = await dv.tryQuery("TASK FROM #project WHERE !completed");
      const markdown = await dv.tryQueryMarkdown("LIST FROM #person");
      const evaluated = dv.tryEvaluate("x + length(this.file.tasks)", { x: 2 });
      const result = dv.evaluate("2 + 2");
      const failure = dv.evaluate("2 +");
      dv.paragraph(JSON.stringify({
        queryType: query.value.type,
        firstTableRow: query.value.values[0],
        taskCount: taskQuery.values.length,
        markdown,
        evaluated,
        result: result.value,
        failed: failure.successful
      }));
    `,
    format: "markdown"
  });

  assert.match(output, /"queryType":"table"/);
  assert.match(output, /"firstTableRow":\["Alpha",5\]/);
  assert.match(output, /"taskCount":2/);
  assert.match(output, /"\- \[\[People\/Alice\]\]\\n\- \[\[People\/Bob\]\]"/);
  assert.match(output, /"evaluated":4/);
  assert.match(output, /"result":4/);
  assert.match(output, /"failed":false/);
});

test("runtime supports dv.view folder loading and css injection", async () => {
  const output = await runDataviewJs({
    vaultPath,
    currentFile: "Projects/Alpha.md",
    script: `
      await dv.view("views/custom", { label: "Hello" });
    `,
    format: "markdown"
  });

  assert.match(output, /<style>\.custom-view \{ color: red; \}\s*<\/style>/);
  assert.match(output, /view input: Hello/);
});

test("daily renderer processes templater, transclusions, and dataview blocks", async () => {
  const output = await renderDailyNote({
    vaultPath,
    date: "2025-08-06",
    templatePath: "templates/Daily note template.md",
    dailyFolder: "journal",
    templaterScripts: "scripts/user"
  });

  assert.match(output, /^# 2025-08-06/m);
  assert.match(output, /Hello 2025-08-06 \(true\)/);
  assert.match(output, /Shared transcluded content\./);
  assert.match(output, /- Alpha/);
  assert.match(output, /- Beta/);
  assert.match(output, /- \[\[People\/Alice\]\]/);
  assert.match(output, /- \[\[People\/Bob\]\]/);
});

test("cli daily renders a dated note from template", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "daily",
    "--vault",
    vaultPath,
    "--date",
    "2025-08-06",
    "--template",
    "templates/Daily note template.md",
    "--daily-folder",
    "journal",
    "--templater-scripts",
    "scripts/user"
  ]);

  assert.match(stdout, /^# 2025-08-06/m);
  assert.match(stdout, /Hello 2025-08-06 \(true\)/);
  assert.match(stdout, /Shared transcluded content\./);
  assert.match(stdout, /- Alpha/);
});
