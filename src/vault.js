const fs = require("node:fs");
const path = require("node:path");

function walkMarkdownFiles(root) {
  const files = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseValue(raw) {
  const value = raw.trim();
  if (value === "") {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseValue);
  }
  return value;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return { fields: {}, body: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { fields: {}, body: content };
  }

  const raw = content.slice(4, endIndex);
  const body = content.slice(endIndex + 5);
  const fields = {};
  const lines = raw.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2];
    if (value.trim() !== "") {
      fields[key] = parseValue(value);
      continue;
    }

    const items = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const itemMatch = /^\s*-\s*(.+)$/.exec(lines[cursor]);
      if (!itemMatch) {
        break;
      }
      items.push(parseValue(itemMatch[1]));
      cursor += 1;
    }

    if (items.length > 0) {
      fields[key] = items;
      index = cursor - 1;
    } else {
      fields[key] = "";
    }
  }

  return { fields, body };
}

function parseInlineFields(lines, target) {
  for (const line of lines) {
    const match = /^([^:\n]+)::\s*(.+)$/.exec(line.trim());
    if (match) {
      target[match[1].trim()] = parseValue(match[2]);
    }
  }
}

function stripFencedCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

function parseTasks(lines) {
  const tasks = [];
  for (const line of lines) {
    const match = /^[-*]\s+\[( |x)\]\s+(.+)$/.exec(line.trim());
    if (match) {
      tasks.push({
        text: match[2],
        completed: match[1] === "x"
      });
    }
  }
  return tasks;
}

function parseTags(text) {
  const tags = new Set();
  const regex = /(^|\s)(#[A-Za-z0-9/_-]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tags.add(match[2]);
  }
  return [...tags];
}

function parseLinks(text) {
  const links = [];
  const regex = /\[\[([^[\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    links.push(match[1].split("|")[0].split("#")[0].trim());
  }
  return links;
}

function linkCandidates(page) {
  const candidates = new Set();
  const extensionlessPath = page.path.replace(/\.md$/i, "");

  candidates.add(page.path);
  candidates.add(extensionlessPath);
  candidates.add(page.name);

  const basename = extensionlessPath.split("/").pop();
  if (basename) {
    candidates.add(basename);
  }

  return [...candidates];
}

function createLinkResolver(pages) {
  const index = new Map();

  for (const page of pages) {
    for (const candidate of linkCandidates(page)) {
      if (!index.has(candidate)) {
        index.set(candidate, []);
      }
      index.get(candidate).push(page.path);
    }
  }

  return function resolveLink(rawLink) {
    const normalized = String(rawLink).replace(/\\/g, "/");
    const candidates = [
      normalized,
      normalized.replace(/\.md$/i, ""),
      normalized.split("/").pop()
    ].filter(Boolean);

    for (const candidate of candidates) {
      const matches = index.get(candidate);
      if (matches && matches.length === 1) {
        return matches[0];
      }
      if (matches && matches.length > 1 && matches.includes(normalized)) {
        return normalized;
      }
    }

    return normalized;
  };
}

function buildPage(vaultPath, filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(vaultPath, filePath).replace(/\\/g, "/");
  const { fields, body } = parseFrontmatter(content);
  const codeFreeBody = stripFencedCodeBlocks(body);
  const lines = codeFreeBody.split("\n");
  parseInlineFields(lines, fields);
  const frontmatterTags = Array.isArray(fields.tags)
    ? fields.tags.map((tag) => (String(tag).startsWith("#") ? String(tag) : `#${tag}`))
    : typeof fields.tags === "string" && fields.tags
      ? [fields.tags].flatMap((tagList) =>
          String(tagList)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        )
      : [];
  const tags = new Set([...parseTags(codeFreeBody), ...frontmatterTags]);

  return {
    path: relativePath,
    name: path.basename(relativePath, ".md"),
    folder: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath).replace(/\\/g, "/"),
    fields,
    tasks: parseTasks(lines),
    tags: [...tags],
    links: parseLinks(codeFreeBody),
    inlinks: []
  };
}

function buildVault(vaultPath) {
  const files = walkMarkdownFiles(vaultPath);
  const pages = files.map((filePath) => buildPage(vaultPath, filePath));
  const resolveLink = createLinkResolver(pages);
  const pagesByPath = new Map(pages.map((page) => [page.path, page]));

  for (const page of pages) {
    page.links = page.links.map((link) => resolveLink(link));
    for (const link of page.links) {
      const target = pagesByPath.get(link);
      if (target) {
        target.inlinks.push(page.path);
      }
    }
  }

  return { pages, pagesByPath, resolveLink };
}

module.exports = {
  buildVault
};
