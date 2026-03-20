#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { renderDailyNote } = require("./daily");
const { runDataviewJs } = require("./runtime");

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  dataviewjs run --vault <path> --current <note.md> <script-file>",
      '  dataviewjs eval --vault <path> --current <note.md> "<script>"',
      "  dataviewjs daily --vault <path> [--date <YYYY-MM-DD>]",
      "",
      "Options:",
      "  --vault <path>      Path to the markdown vault",
      "  --current <path>    Current note path relative to the vault",
      "  --format <name>     markdown | json | text (default: markdown)",
      "  --date <YYYY-MM-DD> Date for `daily` (default: today)",
      "  --template <path>   Template file for `daily` (default: templates/Daily note template.md)",
      "  --daily-folder <p>  Daily notes folder for `daily` (default: journal)",
      "  --templater-scripts <path> Script root for `tp.user.*` (auto-detected if omitted)",
      "  --help              Show this help message"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();

  if (!command || command === "--help" || command === "-h") {
    return { help: true };
  }

  const options = {
    command,
    format: "markdown"
  };

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--vault") {
      options.vault = args.shift();
    } else if (token === "--current") {
      options.current = args.shift();
    } else if (token === "--format") {
      options.format = args.shift();
    } else if (token === "--date") {
      options.date = args.shift();
    } else if (token === "--template") {
      options.template = args.shift();
    } else if (token === "--daily-folder") {
      options.dailyFolder = args.shift();
    } else if (token === "--templater-scripts") {
      options.templaterScripts = args.shift();
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else if (!options.input) {
      options.input = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  return options;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printHelp();
      return;
    }

    if (!options.command || !["run", "eval", "daily"].includes(options.command)) {
      throw new Error("Command must be one of: run, eval, daily");
    }
    if (!options.vault) {
      throw new Error("Missing required option: --vault");
    }

    if (options.command === "daily") {
      const result = await renderDailyNote({
        vaultPath: path.resolve(options.vault),
        date: options.date,
        templatePath: options.template,
        dailyFolder: options.dailyFolder,
        templaterScripts: options.templaterScripts
      });

      if (typeof result === "string" && result.length > 0) {
        process.stdout.write(result);
        if (!result.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
      return;
    }

    if (!options.current) {
      throw new Error("Missing required option: --current");
    }
    if (!options.input) {
      throw new Error("Missing script input");
    }

    let script;
    if (options.command === "run") {
      script = fs.readFileSync(path.resolve(options.input), "utf8");
    } else {
      script = options.input;
    }

    const result = await runDataviewJs({
      vaultPath: path.resolve(options.vault),
      currentFile: options.current,
      script,
      format: options.format
    });

    if (typeof result === "string" && result.length > 0) {
      process.stdout.write(result);
      if (!result.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
