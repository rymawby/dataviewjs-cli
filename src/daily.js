const fs = require("node:fs");
const path = require("node:path");
const { buildVault } = require("./vault");
const { createDataviewRuntime, renderMarkdownContent } = require("./runtime");

function formatDateForNote(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function collectJavaScriptFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function detectTemplaterScriptFolder(vaultPath, configured) {
  if (configured) {
    return path.join(vaultPath, configured);
  }

  const candidates = [
    "scripts/scripts-for-templater/isolated",
    "scripts/templater",
    "scripts/user",
    "scripts"
  ];

  for (const candidate of candidates) {
    const absolute = path.join(vaultPath, candidate);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      return absolute;
    }
  }

  return path.join(vaultPath, "scripts");
}

function loadUserFunctions(scriptRoot, globals) {
  const user = {};
  for (const filePath of collectJavaScriptFiles(scriptRoot)) {
    const name = path.basename(filePath, ".js");
    delete require.cache[require.resolve(filePath)];
    const previousApp = global.app;
    let loaded;
    try {
      global.app = globals.app;
      loaded = require(filePath);
    } finally {
      global.app = previousApp;
    }

    if (typeof loaded === "function") {
      user[name] = (...args) => {
        const prior = global.app;
        try {
          global.app = globals.app;
          return loaded(...args);
        } finally {
          global.app = prior;
        }
      };
    } else if (loaded && typeof loaded === "object") {
      const wrapped = {};
      for (const [key, value] of Object.entries(loaded)) {
        wrapped[key] =
          typeof value === "function"
            ? (...args) => {
                const prior = global.app;
                try {
                  global.app = globals.app;
                  return value(...args);
                } finally {
                  global.app = prior;
                }
              }
            : value;
      }
      user[name] = wrapped;
    }
  }
  return user;
}

function createTemplaterContext({ vaultPath, currentFile, scriptFolder }) {
  const runtime = createDataviewRuntime({ vaultPath, currentFile, format: "markdown" });
  const title = path.posix.basename(currentFile, ".md");
  const currentPage = runtime.vault.pagesByPath.get(currentFile);
  const frontmatter = currentPage ? currentPage.fields : {};

  const tp = {
    file: {
      title,
      path: () => currentFile,
      exists: async (target) => {
        const resolved = runtime.vault.resolveLink(String(target));
        return runtime.vault.pagesByPath.has(resolved);
      }
    },
    frontmatter
  };

  const app = {
    plugins: {
      plugins: {
        dataview: {
          api: runtime.dv
        }
      }
    }
  };

  tp.user = loadUserFunctions(scriptFolder, { app });
  return { runtime, tp, app };
}

async function renderTemplater(content, context) {
  const pattern = /<%([*+_-]?)([\s\S]*?)%>/g;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    result += content.slice(lastIndex, match.index);
    lastIndex = pattern.lastIndex;

    const [, mode, source] = match;
    const isExecution = mode === "*";
    const state = { tR: "" };
    const sandbox = {
      tp: context.tp,
      app: context.app,
      console,
      fetch,
      setTimeout,
      clearTimeout,
      get tR() {
        return state.tR;
      },
      set tR(value) {
        state.tR = String(value);
      }
    };

    if (isExecution) {
      const wrapped = `(async () => {\n${source}\n})()`;
      const script = new (require("node:vm").Script)(wrapped, {
        filename: `${context.runtime.currentFile}:templater`
      });
      await script.runInNewContext(sandbox, { timeout: 1000 });
      result += state.tR;
    } else {
      const wrapped = `(async () => (${source}))()`;
      const script = new (require("node:vm").Script)(wrapped, {
        filename: `${context.runtime.currentFile}:templater`
      });
      const value = await script.runInNewContext(sandbox, { timeout: 1000 });
      result += value == null ? "" : String(value);
    }
  }

  result += content.slice(lastIndex);
  return result;
}

function extractSection(content, headingName) {
  const lines = content.split("\n");
  const headingPattern = new RegExp(`^(#{1,6})\\s+${headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = headingPattern.exec(lines[index]);
    if (match) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }

  if (start === -1) {
    return "";
  }

  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = /^(#{1,6})\s+/.exec(line);
    if (headingMatch && headingMatch[1].length <= level) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

async function resolveTransclusions(content, { vaultPath, currentFile, depth = 0 }) {
  if (depth > 5) {
    return content;
  }

  const pattern = /!\[\[([^[\]]+)\]\]/g;
  let result = "";
  let lastIndex = 0;
  let match;
  const vault = buildVault(vaultPath);

  while ((match = pattern.exec(content)) !== null) {
    result += content.slice(lastIndex, match.index);
    lastIndex = pattern.lastIndex;

    const raw = match[1].trim();
    const [targetWithPath] = raw.split("|");
    const [targetPath, section] = targetWithPath.split("#");
    const resolved = vault.resolveLink(targetPath.trim());
    const absolute = path.join(vaultPath, resolved);

    if (!fs.existsSync(absolute)) {
      result += match[0];
      continue;
    }

    let loaded = fs.readFileSync(absolute, "utf8");
    if (section) {
      loaded = extractSection(loaded, section.trim());
    }
    loaded = await resolveTransclusions(loaded, {
      vaultPath,
      currentFile: resolved,
      depth: depth + 1
    });
    result += loaded;
  }

  result += content.slice(lastIndex);
  return result;
}

async function renderDailyNote({
  vaultPath,
  date,
  templatePath = "templates/Daily note template.md",
  dailyFolder = "journal",
  templaterScripts,
  preferExisting = true
}) {
  const targetDate = date ? new Date(`${date}T00:00:00`) : new Date();
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  const noteName = formatDateForNote(targetDate);
  const currentFile = `${dailyFolder.replace(/\/+$/, "")}/${noteName}.md`;
  const absoluteCurrent = path.join(vaultPath, currentFile);
  const absoluteTemplate = path.join(vaultPath, templatePath);
  const absoluteScripts = detectTemplaterScriptFolder(vaultPath, templaterScripts);

  let content;
  if (preferExisting && fs.existsSync(absoluteCurrent)) {
    content = fs.readFileSync(absoluteCurrent, "utf8");
  } else if (fs.existsSync(absoluteTemplate)) {
    content = fs.readFileSync(absoluteTemplate, "utf8");
  } else {
    throw new Error(`Daily source not found. Checked ${currentFile} and ${templatePath}`);
  }

  const templaterContext = createTemplaterContext({
    vaultPath,
    currentFile,
    scriptFolder: absoluteScripts
  });
  const templated = await renderTemplater(content, templaterContext);
  const transcluded = await resolveTransclusions(templated, { vaultPath, currentFile });
  return renderMarkdownContent({
    vaultPath,
    currentFile,
    content: transcluded,
    format: "markdown"
  });
}

module.exports = {
  renderDailyNote,
  renderTemplater,
  resolveTransclusions
};
