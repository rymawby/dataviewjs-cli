#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { runDataviewJs } = require("./runtime");

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  dataviewjs run --vault <path> --current <note.md> <script-file>",
      '  dataviewjs eval --vault <path> --current <note.md> "<script>"',
      "",
      "Options:",
      "  --vault <path>      Path to the markdown vault",
      "  --current <path>    Current note path relative to the vault",
      "  --format <name>     markdown | json | text (default: markdown)",
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

    if (!options.command || !["run", "eval"].includes(options.command)) {
      throw new Error("Command must be one of: run, eval");
    }
    if (!options.vault) {
      throw new Error("Missing required option: --vault");
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
