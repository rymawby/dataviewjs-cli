const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildVault } = require("./vault");

const DATA_ARRAY_SYMBOL = Symbol("dataview.dataArray");

function stripMarkdown(value) {
  return String(value).replace(/[*_`#>-]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

function quoteMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function stripMarkdownExtension(filePath) {
  return String(filePath).replace(/\.md$/i, "");
}

function createLink(pathValue, options = {}) {
  return {
    type: "link",
    path: String(pathValue).replace(/\\/g, "/"),
    embed: Boolean(options.embed),
    display: options.display,
    subpath: options.subpath,
    subpathType: options.subpathType,
    markdown() {
      const base = stripMarkdownExtension(this.path);
      const target = this.subpath
        ? `${base}#${this.subpathType === "block" ? `^${this.subpath}` : this.subpath}`
        : base;
      const display = this.display ? `|${this.display}` : "";
      return `${this.embed ? "!" : ""}[[${target}${display}]]`;
    },
    toString() {
      return this.markdown();
    }
  };
}

function parseDateString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = /(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }

  const parsed = new Date(`${match[1]}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function createDateValue(value) {
  if (value && typeof value.toFormat === "function") {
    return value;
  }

  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : parseDateString(String(value));

  if (!date) {
    return undefined;
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return {
    type: "date",
    valueOf() {
      return date.getTime();
    },
    toISODate() {
      return `${year}-${month}-${day}`;
    },
    toFormat(format) {
      return String(format)
        .replace(/yyyy/g, year)
        .replace(/MM/g, month)
        .replace(/dd/g, day);
    },
    toString() {
      return `${year}-${month}-${day}`;
    }
  };
}

function createDurationValue(units) {
  const normalized = {
    years: units.years || 0,
    months: units.months || 0,
    weeks: units.weeks || 0,
    days: units.days || 0,
    hours: units.hours || 0,
    minutes: units.minutes || 0,
    seconds: units.seconds || 0
  };

  const millis =
    normalized.years * 365 * 24 * 60 * 60 * 1000 +
    normalized.months * 30 * 24 * 60 * 60 * 1000 +
    normalized.weeks * 7 * 24 * 60 * 60 * 1000 +
    normalized.days * 24 * 60 * 60 * 1000 +
    normalized.hours * 60 * 60 * 1000 +
    normalized.minutes * 60 * 1000 +
    normalized.seconds * 1000;

  return {
    type: "duration",
    ...normalized,
    valueOf() {
      return millis;
    },
    toString() {
      const parts = Object.entries(normalized)
        .filter(([, amount]) => amount)
        .map(([unit, amount]) => `${amount} ${unit.replace(/s$/, amount === 1 ? "" : "s")}`);
      return parts.join(", ");
    }
  };
}

function parseDurationString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const regex = /(-?\d+(?:\.\d+)?)\s*(year|years|month|months|week|weeks|day|days|hour|hours|minute|minutes|min|mins|second|seconds|sec|secs)\b/gi;
  const units = {};
  let match;
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1]);
    const key = match[2].toLowerCase();
    if (key.startsWith("year")) {
      units.years = (units.years || 0) + amount;
    } else if (key.startsWith("month")) {
      units.months = (units.months || 0) + amount;
    } else if (key.startsWith("week")) {
      units.weeks = (units.weeks || 0) + amount;
    } else if (key.startsWith("day")) {
      units.days = (units.days || 0) + amount;
    } else if (key.startsWith("hour")) {
      units.hours = (units.hours || 0) + amount;
    } else if (key.startsWith("minute") || key === "min" || key === "mins") {
      units.minutes = (units.minutes || 0) + amount;
    } else {
      units.seconds = (units.seconds || 0) + amount;
    }
  }

  if (Object.keys(units).length === 0) {
    return undefined;
  }

  return createDurationValue(units);
}

function parseLinkString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = /^(!)?\[\[([^|\]#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const [, embed, target, subpath, display] = match;
  return createLink(target.trim(), {
    embed: Boolean(embed),
    display,
    subpath: subpath ? subpath.replace(/^\^/, "") : undefined,
    subpathType: subpath && subpath.startsWith("^") ? "block" : "section"
  });
}

function isDataArray(value) {
  return Boolean(value && value[DATA_ARRAY_SYMBOL]);
}

function unwrapDataArray(value) {
  return isDataArray(value) ? value.array() : value;
}

class DataArrayCore {
  constructor(values) {
    this.values = [...values];
    this[DATA_ARRAY_SYMBOL] = true;
  }

  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }

  get length() {
    return this.values.length;
  }

  array() {
    return [...this.values];
  }

  where(predicate) {
    return createDataArray(this.values.filter(predicate));
  }

  filter(predicate) {
    return createDataArray(this.values.filter(predicate));
  }

  map(mapper) {
    return createDataArray(this.values.map(mapper));
  }

  flatMap(mapper) {
    return createDataArray(
      this.values.flatMap((value, index) => {
        const mapped = mapper(value, index);
        return unwrapArrayLike(mapped);
      })
    );
  }

  sort(selector, direction = "asc") {
    const values = [...this.values];
    if (selector) {
      values.sort((left, right) => compareValues(selector(left), selector(right)));
    } else {
      values.sort(compareValues);
    }
    if (String(direction).toLowerCase() === "desc") {
      values.reverse();
    }
    return createDataArray(values);
  }

  limit(count) {
    return createDataArray(this.values.slice(0, count));
  }

  first() {
    return this.values[0];
  }

  forEach(callback) {
    this.values.forEach(callback);
  }

  toJSON() {
    return this.values;
  }
}

function createDataArray(values) {
  const target = new DataArrayCore(values);
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === DATA_ARRAY_SYMBOL) {
        return true;
      }
      if (property in object) {
        const value = Reflect.get(object, property, receiver);
        return typeof value === "function" ? value.bind(object) : value;
      }
      if (typeof property === "string" && /^\d+$/.test(property)) {
        return object.values[Number(property)];
      }
      if (typeof property === "symbol") {
        return Reflect.get(object, property, receiver);
      }

      const projected = [];
      for (const value of object.values) {
        const next = value == null ? undefined : value[property];
        if (isDataArray(next)) {
          projected.push(...next.array());
        } else if (Array.isArray(next)) {
          projected.push(...next);
        } else {
          projected.push(next);
        }
      }
      return createDataArray(projected);
    }
  });
}

function unwrapArrayLike(value) {
  if (isDataArray(value)) {
    return value.array();
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined) {
    return [];
  }
  return [value];
}

function inferFileDay(page) {
  const fromName = parseDateString(page.name);
  if (fromName) {
    return createDateValue(fromName);
  }
  if (typeof page.fields.date === "string") {
    return createDateValue(page.fields.date);
  }
  return undefined;
}

function formatScalar(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isDataArray(value)) {
    return value.array().map(formatScalar).join(", ");
  }
  if (Array.isArray(value)) {
    return value.map(formatScalar).join(", ");
  }
  if (value && typeof value === "object") {
    if (typeof value.markdown === "function") {
      return value.markdown();
    }
    if (typeof value.toFormat === "function") {
      return value.toString();
    }
    if (value.type === "duration") {
      return value.toString();
    }
    if (value.path) {
      return value.path;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function compareValues(left, right) {
  if (left === right) {
    return 0;
  }

  if (left && typeof left.valueOf === "function" && right && typeof right.valueOf === "function") {
    const leftValue = left.valueOf();
    const rightValue = right.valueOf();
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue - rightValue;
    }
  }

  const a = formatScalar(left);
  const b = formatScalar(right);
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function deepEqualValue(left, right) {
  if (left === right) {
    return true;
  }
  if (compareValues(left, right) !== 0) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqualValue(value, right[index]));
  }
  if (left && typeof left === "object" && right && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => deepEqualValue(left[key], right[key]))
    );
  }
  return true;
}

function cloneValue(value) {
  if (isDataArray(value)) {
    return createDataArray(value.array().map(cloneValue));
  }
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (value && typeof value === "object") {
    if (typeof value.markdown === "function") {
      return createLink(value.path, {
        embed: value.embed,
        display: value.display,
        subpath: value.subpath,
        subpathType: value.subpathType
      });
    }
    if (typeof value.toFormat === "function") {
      return createDateValue(value.toString());
    }
    if (value.type === "duration") {
      return createDurationValue(value);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }
  return value;
}

function parseArbitraryValue(value) {
  if (typeof value !== "string") {
    return value;
  }
  return parseLinkString(value) || createDateValue(value) || parseDurationString(value) || value;
}

class MarkdownCollector {
  constructor() {
    this.blocks = [];
  }

  raw(text) {
    this.blocks.push(String(text));
  }

  el(element, text, options = {}) {
    const attrs = [];
    if (options.cls) {
      attrs.push(`class="${String(options.cls)}"`);
    }
    if (options.attr) {
      for (const [key, value] of Object.entries(options.attr)) {
        attrs.push(`${key}="${String(value)}"`);
      }
    }
    const suffix = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
    this.blocks.push(`<${element}${suffix}>${String(text)}</${element}>`);
  }

  header(level, text) {
    this.blocks.push(`${"#".repeat(level)} ${text}`);
  }

  paragraph(text) {
    this.blocks.push(String(text));
  }

  span(text) {
    this.blocks.push(String(text));
  }

  list(values) {
    this.blocks.push(values.map((value) => `- ${formatScalar(value)}`).join("\n"));
  }

  taskList(tasks, groupByFile = true) {
    const normalized = tasks.map((task) => ({
      ...task,
      file: task.file || { path: task.path || "" }
    }));
    if (!groupByFile) {
      this.blocks.push(
        normalized.map((task) => `- [${task.completed ? "x" : " "}] ${task.text}`).join("\n")
      );
      return;
    }

    const grouped = new Map();
    for (const task of normalized) {
      const key = task.file.path || "";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(task);
    }

    const chunks = [];
    for (const [filePath, fileTasks] of grouped.entries()) {
      if (filePath) {
        chunks.push(`- ${filePath}`);
        for (const task of fileTasks) {
          chunks.push(`  - [${task.completed ? "x" : " "}] ${task.text}`);
        }
      } else {
        for (const task of fileTasks) {
          chunks.push(`- [${task.completed ? "x" : " "}] ${task.text}`);
        }
      }
    }

    this.blocks.push(chunks.join("\n"));
  }

  table(headers, rows) {
    const headerRow = `| ${headers.map(quoteMarkdownCell).join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map(
      (row) => `| ${row.map((cell) => quoteMarkdownCell(formatScalar(cell))).join(" | ")} |`
    );
    this.blocks.push([headerRow, separator, ...body].join("\n"));
  }

  output() {
    return this.blocks.filter(Boolean).join("\n\n");
  }
}

class TextCollector extends MarkdownCollector {
  el(element, text, options = {}) {
    const cls = options.cls ? ` class=${options.cls}` : "";
    this.blocks.push(`<${element}${cls}>${String(text)}</${element}>`);
  }

  table(headers, rows) {
    const lines = [headers.join(" | "), headers.map(() => "---").join(" | ")];
    for (const row of rows) {
      lines.push(row.map((cell) => stripMarkdown(formatScalar(cell))).join(" | "));
    }
    this.blocks.push(lines.join("\n"));
  }
}

class JsonCollector {
  constructor() {
    this.blocks = [];
  }

  raw(text) {
    this.blocks.push({ type: "raw", text: String(text) });
  }

  el(element, text, options = {}) {
    this.blocks.push({ type: "element", element, text: String(text), options });
  }

  header(level, text) {
    this.blocks.push({ type: "header", level, text: String(text) });
  }

  paragraph(text) {
    this.blocks.push({ type: "paragraph", text: String(text) });
  }

  span(text) {
    this.blocks.push({ type: "span", text: String(text) });
  }

  list(values) {
    this.blocks.push({ type: "list", items: values });
  }

  taskList(tasks, groupByFile = true) {
    this.blocks.push({ type: "taskList", items: tasks, groupByFile });
  }

  table(headers, rows) {
    this.blocks.push({ type: "table", headers, rows });
  }

  output() {
    return JSON.stringify(this.blocks, null, 2);
  }
}

function createCollector(format) {
  if (format === "json") {
    return new JsonCollector();
  }
  if (format === "text") {
    return new TextCollector();
  }
  if (format === "markdown") {
    return new MarkdownCollector();
  }
  throw new Error(`Unsupported format: ${format}`);
}

function normalizeLinkPath(input) {
  return String(input).replace(/^\[\[/, "").replace(/\]\]$/, "").replace(/\\/g, "/");
}

function buildFileShape(page) {
  const link = createLink(page.path);
  return {
    path: page.path,
    name: page.name,
    folder: page.folder,
    link,
    day: inferFileDay(page),
    tags: [...page.tags],
    outlinks: page.links.map((entry) => ({ path: entry })),
    inlinks: page.inlinks.map((entry) => ({ path: entry })),
    tasks: page.tasks.map((task) => ({ ...task }))
  };
}

function createPageShape(page) {
  if (!page) {
    return undefined;
  }

  return {
    ...page.fields,
    file: buildFileShape(page)
  };
}

function buildSourcePredicate(source, currentFile, resolveLink) {
  if (!source) {
    return () => true;
  }

  const disjunctions = String(source)
    .trim()
    .split(/\s+or\s+/i)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const clausePredicates = disjunctions.map((clause) =>
    clause
      .split(/\s+and\s+/i)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((term) => {
        let negate = false;
        let value = term;
        if (value.startsWith("-")) {
          negate = true;
          value = value.slice(1);
        }

        let predicate;
        if (value.startsWith('"') && value.endsWith('"')) {
          const folder = value.slice(1, -1).replace(/\/+$/, "");
          predicate = (page) => page.folder === folder || page.folder.startsWith(`${folder}/`);
        } else if (value.startsWith("#")) {
          predicate = (page) => page.tags.includes(value);
        } else if (value === "@current") {
          predicate = (page) => page.path === currentFile;
        } else {
          const resolved = resolveLink(normalizeLinkPath(value));
          predicate = (page) => page.path === resolved;
        }

        return negate ? (page) => !predicate(page) : predicate;
      })
  );

  return (page) => clausePredicates.some((predicates) => predicates.every((predicate) => predicate(page)));
}

function normalizeFilePath(vaultPath, currentFile, value, originFile) {
  const raw = value && typeof value === "object" && value.path ? value.path : String(value);
  const cleaned = normalizeLinkPath(raw).split("#")[0].split("|")[0];
  const origin = originFile || currentFile;
  const originFolder = origin ? path.posix.dirname(origin) : "";

  const candidates = [];
  if (path.isAbsolute(cleaned)) {
    candidates.push(cleaned);
  } else {
    const basePath = cleaned.startsWith("/")
      ? cleaned.slice(1)
      : path.posix.normalize(path.posix.join(originFolder === "." ? "" : originFolder, cleaned));
    candidates.push(basePath);
    if (!/\.[a-z0-9]+$/i.test(basePath)) {
      candidates.push(`${basePath}.md`);
      candidates.push(`${basePath}.csv`);
      candidates.push(`${basePath}.txt`);
      candidates.push(`${basePath}.js`);
    }
  }

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.join(vaultPath, candidate);
    if (fs.existsSync(absolute)) {
      return path.relative(vaultPath, absolute).replace(/\\/g, "/");
    }
  }

  return candidates[0].replace(/\\/g, "/");
}

function parseCsv(content) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      current += character;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...values] = rows;
  return values.map((entry) =>
    Object.fromEntries(headers.map((header, index) => [header, parseArbitraryValue(entry[index] || "")]))
  );
}

function translateExpression(expression) {
  return String(expression)
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .replace(/(?<![<>=!])=(?!=)/g, "==");
}

function createEvaluationHelpers(api) {
  return {
    link(pathValue, embed, display) {
      return api.fileLink(pathValue, embed, display);
    },
    date(value) {
      return api.date(value);
    },
    dur(value) {
      return api.duration(value);
    },
    length(value) {
      if (isDataArray(value)) {
        return value.length;
      }
      if (Array.isArray(value) || typeof value === "string") {
        return value.length;
      }
      return 0;
    },
    contains(container, item) {
      const value = unwrapDataArray(container);
      if (typeof value === "string") {
        return value.includes(formatScalar(item));
      }
      if (Array.isArray(value)) {
        return value.some((entry) => deepEqualValue(entry, item) || formatScalar(entry).includes(formatScalar(item)));
      }
      return false;
    }
  };
}

function createEvaluationContext(api, context, filePath, variables = {}) {
  return vm.createContext({
    ...createEvaluationHelpers(api),
    ...variables,
    dv: api,
    dataview: api,
    console,
    __this: createPageShape(api.__vault.pagesByPath.get(filePath))
  });
}

function tryEvaluateExpression(api, context, filePath, expression, variables = {}) {
  const sandbox = createEvaluationContext(api, context, filePath, variables);
  const translated = translateExpression(expression);
  const script = new vm.Script(`(function () { return (${translated}); }).call(__this)`);
  return script.runInContext(sandbox, { timeout: 1000 });
}

function parseColumns(source) {
  return source
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function takeClause(source, keyword, nextKeywords) {
  const regex = new RegExp(
    `^${keyword}\\s+([\\s\\S]*?)(?=\\s+(?:${nextKeywords.join("|")})\\b|$)`,
    "i"
  );
  const match = regex.exec(source);
  if (!match) {
    return undefined;
  }
  return {
    value: match[1].trim(),
    rest: source.slice(match[0].length).trim()
  };
}

function parseDataviewQuery(source) {
  const normalized = String(source).replace(/\s+/g, " ").trim();

  if (/^TABLE\b/i.test(normalized)) {
    let rest = normalized.replace(/^TABLE\s+/i, "");
    let withoutId = false;
    if (/^WITHOUT ID\b/i.test(rest)) {
      withoutId = true;
      rest = rest.replace(/^WITHOUT ID\s+/i, "");
    }
    const firstKeyword = /\s+(FROM|FLATTEN|WHERE|SORT|LIMIT)\b/i.exec(rest);
    const columnText = firstKeyword ? rest.slice(0, firstKeyword.index).trim() : rest.trim();
    rest = firstKeyword ? rest.slice(firstKeyword.index).trim() : "";
    return parseQueryTail({
      type: "table",
      withoutId,
      columns: parseColumns(columnText)
    }, rest);
  }

  if (/^LIST\b/i.test(normalized)) {
    let rest = normalized.replace(/^LIST\b/i, "").trim();
    const firstKeyword = /\s+(FROM|FLATTEN|WHERE|SORT|LIMIT)\b/i.exec(` ${rest}`);
    const expression = firstKeyword ? rest.slice(0, firstKeyword.index).trim() : rest.trim();
    rest = firstKeyword ? rest.slice(firstKeyword.index).trim() : "";
    return parseQueryTail({
      type: "list",
      expression
    }, rest);
  }

  if (/^TASK\b/i.test(normalized)) {
    const rest = normalized.replace(/^TASK\b/i, "").trim();
    return parseQueryTail({ type: "task" }, rest);
  }

  throw new Error(`Unsupported query type: ${source}`);
}

function parseQueryTail(base, source) {
  let rest = source.trim();
  const query = {
    ...base,
    from: undefined,
    flatten: [],
    where: undefined,
    sort: undefined,
    sortDirection: "asc",
    limit: undefined
  };

  const nextKeywords = ["FROM", "FLATTEN", "WHERE", "SORT", "LIMIT"];

  const from = takeClause(rest, "FROM", ["FLATTEN", "WHERE", "SORT", "LIMIT"]);
  if (from) {
    query.from = from.value;
    rest = from.rest;
  }

  while (true) {
    const flatten = takeClause(rest, "FLATTEN", ["FLATTEN", "WHERE", "SORT", "LIMIT"]);
    if (!flatten) {
      break;
    }
    rest = flatten.rest;
    const match = /^(.*?)(?:\s+AS\s+([A-Za-z_][A-Za-z0-9_]*))?$/i.exec(flatten.value);
    query.flatten.push({
      expression: match[1].trim(),
      alias: match[2] || match[1].trim().split(".").pop()
    });
  }

  const where = takeClause(rest, "WHERE", ["SORT", "LIMIT"]);
  if (where) {
    query.where = where.value;
    rest = where.rest;
  }

  const sort = takeClause(rest, "SORT", ["LIMIT"]);
  if (sort) {
    const match = /^(.*?)(?:\s+(ASC|DESC))?$/i.exec(sort.value);
    query.sort = match[1].trim();
    query.sortDirection = (match[2] || "asc").toLowerCase();
    rest = sort.rest;
  }

  const limit = takeClause(rest, "LIMIT", []);
  if (limit) {
    query.limit = Number(limit.value);
  }

  return query;
}

function expandQueryRows(api, context, rows, flattenSteps, filePath) {
  let expanded = rows;
  for (const step of flattenSteps) {
    expanded = expanded.flatMap((row) => {
      const value = tryEvaluateExpression(api, context, filePath, step.expression, row.scope);
      return unwrapArrayLike(value).map((entry) => ({
        scope: {
          ...row.scope,
          [step.alias]: entry
        }
      }));
    });
  }
  return expanded;
}

function buildTaskRows(pages) {
  return pages.flatMap((page) =>
    page.file.tasks.map((task) => ({
      scope: {
        ...task,
        file: page.file
      }
    }))
  );
}

function renderQueryMarkdown(api, queryResult) {
  if (queryResult.type === "list") {
    return api.markdownList(queryResult.values);
  }
  if (queryResult.type === "table") {
    return api.markdownTable(queryResult.headers, queryResult.values);
  }
  if (queryResult.type === "task") {
    return api.markdownTaskList(queryResult.values);
  }
  throw new Error(`Unsupported query result type: ${queryResult.type}`);
}

function executeQuery(api, context, source, filePath) {
  const parsed = parseDataviewQuery(source);
  const effectiveFile = filePath || api.__currentFile;
  const pages = api.pages(parsed.from).array();

  let rows =
    parsed.type === "task"
      ? buildTaskRows(pages)
      : pages.map((page) => ({
          scope: page
        }));

  rows = expandQueryRows(api, context, rows, parsed.flatten, effectiveFile);

  if (parsed.where) {
    rows = rows.filter((row) => Boolean(tryEvaluateExpression(api, context, effectiveFile, parsed.where, row.scope)));
  }

  if (parsed.sort) {
    rows.sort((left, right) =>
      compareValues(
        tryEvaluateExpression(api, context, effectiveFile, parsed.sort, left.scope),
        tryEvaluateExpression(api, context, effectiveFile, parsed.sort, right.scope)
      )
    );
    if (parsed.sortDirection === "desc") {
      rows.reverse();
    }
  }

  if (Number.isFinite(parsed.limit)) {
    rows = rows.slice(0, parsed.limit);
  }

  if (parsed.type === "list") {
    const expression = parsed.expression || "file.link";
    return {
      type: "list",
      values: rows.map((row) => tryEvaluateExpression(api, context, effectiveFile, expression, row.scope))
    };
  }

  if (parsed.type === "table") {
    return {
      type: "table",
      headers: parsed.columns,
      values: rows.map((row) =>
        parsed.columns.map((column) => tryEvaluateExpression(api, context, effectiveFile, column, row.scope))
      )
    };
  }

  return {
    type: "task",
    values: rows.map((row) => row.scope)
  };
}

function createDataviewApi(vault, currentFile, collector, context) {
  const api = {
    __vault: vault,
    __currentFile: currentFile,

    current() {
      return createPageShape(vault.pagesByPath.get(currentFile));
    },

    page(link) {
      return createPageShape(vault.pagesByPath.get(vault.resolveLink(normalizeLinkPath(link))));
    },

    pages(source) {
      const predicate = buildSourcePredicate(source, currentFile, vault.resolveLink);
      return createDataArray(vault.pages.filter(predicate).map((page) => createPageShape(page)));
    },

    pagePaths(source) {
      return api.pages(source).map((page) => page.file.path);
    },

    el(element, text, options) {
      collector.el(element, text, options);
    },

    header(level, text) {
      collector.header(level, text);
    },

    paragraph(text) {
      collector.paragraph(text);
    },

    span(text) {
      collector.span(text);
    },

    async execute(source) {
      const markdown = await api.tryQueryMarkdown(source);
      collector.raw(markdown);
    },

    async executeJs(source) {
      const script = new vm.Script(`(async () => {\n${source}\n})()`, {
        filename: `${currentFile}:executeJs`
      });
      await script.runInContext(context, { timeout: 1000 });
    },

    async view(viewPath, input) {
      const normalized = String(viewPath).replace(/\\/g, "/").replace(/^\/+/, "");
      if (normalized.startsWith(".") || normalized.split("/").some((segment) => segment.startsWith("."))) {
        throw new Error(
          `Dataview: custom view not found for '${normalized}/view.js' or '${normalized}.js'.`
        );
      }
      const candidates = [
        path.join(vault.vaultPath, `${normalized}.js`),
        path.join(vault.vaultPath, normalized, "view.js"),
        path.join(vault.vaultPath, "scripts", `${normalized}.js`),
        path.join(vault.vaultPath, "scripts", normalized, "view.js")
      ];
      const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));

      if (!resolvedPath) {
        throw new Error(`View not found: ${viewPath}`);
      }

      const cssPath = path.join(path.dirname(resolvedPath), "view.css");
      if (path.basename(resolvedPath) === "view.js" && fs.existsSync(cssPath)) {
        collector.raw(`<style>${fs.readFileSync(cssPath, "utf8")}</style>`);
      }

      const code = fs.readFileSync(resolvedPath, "utf8");
      const previousInput = context.input;
      context.input = input;
      try {
        const script = new vm.Script(code, { filename: resolvedPath });
        return await script.runInContext(context, { timeout: 1000 });
      } finally {
        context.input = previousInput;
      }
    },

    list(values) {
      collector.list(unwrapArrayLike(values));
    },

    taskList(tasks, groupByFile = true) {
      collector.taskList(unwrapArrayLike(tasks), groupByFile);
    },

    table(headers, rows) {
      collector.table(headers, unwrapArrayLike(rows).map((row) => unwrapArrayLike(row)));
    },

    markdownTable(headers, rows) {
      const normalizedRows = unwrapArrayLike(rows).map((row) => unwrapArrayLike(row));
      const markdown = new MarkdownCollector();
      markdown.table(headers, normalizedRows);
      return markdown.output();
    },

    markdownList(values) {
      const markdown = new MarkdownCollector();
      markdown.list(unwrapArrayLike(values));
      return markdown.output();
    },

    markdownTaskList(tasks) {
      const markdown = new MarkdownCollector();
      markdown.taskList(unwrapArrayLike(tasks), true);
      return markdown.output();
    },

    array(value) {
      if (isDataArray(value)) {
        return value;
      }
      if (Array.isArray(value)) {
        return createDataArray(value);
      }
      return createDataArray([value]);
    },

    isArray(value) {
      return Array.isArray(value) || isDataArray(value);
    },

    fileLink(pathValue, embed, display) {
      return createLink(vault.resolveLink(normalizeLinkPath(pathValue)), { embed, display });
    },

    sectionLink(pathValue, section, embed, display) {
      return createLink(vault.resolveLink(normalizeLinkPath(pathValue)), {
        embed,
        display,
        subpath: section,
        subpathType: "section"
      });
    },

    blockLink(pathValue, blockId, embed, display) {
      return createLink(vault.resolveLink(normalizeLinkPath(pathValue)), {
        embed,
        display,
        subpath: blockId,
        subpathType: "block"
      });
    },

    date(value) {
      if (value && typeof value.markdown === "function") {
        return createDateValue(value.path);
      }
      return createDateValue(value);
    },

    duration(value) {
      if (value && value.type === "duration") {
        return value;
      }
      return parseDurationString(String(value));
    },

    compare(left, right) {
      return compareValues(left, right);
    },

    equal(left, right) {
      return deepEqualValue(left, right);
    },

    clone(value) {
      return cloneValue(value);
    },

    parse(value) {
      return parseArbitraryValue(value);
    },

    io: {
      async csv(filePath, originFile) {
        const normalized = api.io.normalize(filePath, originFile);
        const absolute = path.join(vault.vaultPath, normalized);
        if (!fs.existsSync(absolute)) {
          return undefined;
        }
        return createDataArray(parseCsv(fs.readFileSync(absolute, "utf8")));
      },

      async load(filePath, originFile) {
        const normalized = api.io.normalize(filePath, originFile);
        const absolute = path.join(vault.vaultPath, normalized);
        if (!fs.existsSync(absolute)) {
          return undefined;
        }
        return fs.readFileSync(absolute, "utf8");
      },

      normalize(filePath, originFile) {
        return normalizeFilePath(vault.vaultPath, currentFile, filePath, originFile);
      }
    },

    async query(source, file) {
      try {
        return {
          successful: true,
          value: executeQuery(api, context, source, file || currentFile)
        };
      } catch (error) {
        return {
          successful: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },

    async tryQuery(source, file) {
      const result = await api.query(source, file);
      if (!result.successful) {
        throw new Error(result.error);
      }
      return result.value;
    },

    async queryMarkdown(source, file) {
      try {
        const value = executeQuery(api, context, source, file || currentFile);
        return {
          successful: true,
          value: renderQueryMarkdown(api, value)
        };
      } catch (error) {
        return {
          successful: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },

    async tryQueryMarkdown(source, file) {
      const result = await api.queryMarkdown(source, file);
      if (!result.successful) {
        throw new Error(result.error);
      }
      return result.value;
    },

    tryEvaluate(expression, variables = {}) {
      return tryEvaluateExpression(api, context, currentFile, expression, variables);
    },

    evaluate(expression, variables = {}) {
      try {
        return {
          successful: true,
          value: api.tryEvaluate(expression, variables)
        };
      } catch (error) {
        return {
          successful: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };

  return api;
}

async function runDataviewJs({ vaultPath, currentFile, script, format = "markdown" }) {
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Vault path does not exist: ${vaultPath}`);
  }

  const vault = buildVault(vaultPath);
  vault.vaultPath = vaultPath;
  const collector = createCollector(format);
  const context = vm.createContext({
    console,
    input: undefined
  });
  const dv = createDataviewApi(vault, currentFile, collector, context);
  context.dv = dv;
  context.dataview = dv;

  const wrapped = `(async () => {\n${script}\n})()`;
  const runner = new vm.Script(wrapped, { filename: currentFile });
  await runner.runInContext(context, { timeout: 1000 });

  return collector.output();
}

module.exports = {
  DataArray: DataArrayCore,
  createDateValue,
  createDurationValue,
  createLink,
  isDataArray,
  runDataviewJs
};
