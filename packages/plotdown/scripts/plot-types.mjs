// Reads the type declarations of the installed @observablehq/plot and resolves
// the option interfaces of its marks and transforms to key → {type, doc}.
// Used by generate.mjs; not part of the published package.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
// The package exports no ./package.json; walk up from its main entry instead.
export const plotRoot = path.resolve(path.dirname(require.resolve("@observablehq/plot")), "..");
export const plotVersion = JSON.parse(fs.readFileSync(path.join(plotRoot, "package.json"), "utf8")).version;

function walk(dir) {
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".d.ts") ? [path.join(dir, e.name)] : []));
}

const OPEN = "{([<";
const CLOSE = "})]";

// Splits at top-level occurrences of sep (ignores nesting, strings and "=>").
export function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c) || (c === ">" && text[i - 1] !== "=")) depth--;
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      start = i + sep.length;
    }
  }
  parts.push(text.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

function firstSentence(doc) {
  const text = doc
    .replace(/^\s*\*\s?/gm, "")
    .replace(/\{@link\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .split(/\n\s*\n|\n\s*@\w+/)[0]
    .replace(/\s+/g, " ")
    .trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

// Parses the members of an object type body: name → {type, doc}.
function parseMembers(body) {
  const members = new Map();
  let depth = 0;
  let start = 0;
  let quote = null;
  const flush = (end) => {
    const raw = body.slice(start, end);
    start = end + 1;
    const docs = [...raw.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
    const doc = docs.length ? docs[docs.length - 1][1] : "";
    const chunk = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
    const m = /^(?:readonly\s+)?(\w+)(\?)?\s*:\s*([\s\S]+)$/.exec(chunk);
    if (m) members.set(m[1], {type: m[3].replace(/\s+/g, " ").trim(), doc: doc ? firstSentence(doc) : "", deprecated: /@deprecated/.test(doc)});
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (body.startsWith("/*", i)) {
      i = body.indexOf("*/", i) + 1;
      continue;
    }
    if (body.startsWith("//", i)) {
      i = body.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c) || (c === ">" && body[i - 1] !== "=")) depth--;
    else if (depth === 0 && (c === ";" || c === ",")) flush(i);
  }
  flush(body.length);
  return members;
}

function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}

function balanced(text) {
  let depth = 0;
  for (const c of text) {
    if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

function merge(maps) {
  const out = new Map();
  for (const map of maps) for (const [k, v] of map) if (!out.has(k) || (!out.get(k).doc && v.doc)) out.set(k, v);
  return out;
}

export function loadPlotTypes() {
  const decls = new Map();
  const functions = new Map();
  for (const file of walk(path.join(plotRoot, "src"))) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/^(?:export )?interface (\w+)(?:<[^>{]*>)?\s*(?:extends ([^{]+))?\{/gm)) {
      const open = m.index + m[0].length - 1;
      const close = matchBrace(src, open);
      decls.set(m[1], {kind: "interface", extends: m[2] ? splitTop(m[2].trim(), ",") : [], members: parseMembers(src.slice(open + 1, close))});
    }
    for (const m of src.matchAll(/^(?:export )?type (\w+)(?:<[^=]*>)?\s*=\s*/gm)) {
      let i = m.index + m[0].length;
      let depth = 0;
      for (; i < src.length; i++) {
        const c = src[i];
        if (src.startsWith("//", i)) {
          i = src.indexOf("\n", i);
          continue;
        }
        if (OPEN.includes(c)) depth++;
        else if (CLOSE.includes(c) || (c === ">" && src[i - 1] !== "=")) depth--;
        else if (c === ";" && depth === 0) break;
      }
      const type = src.slice(m.index + m[0].length, i).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
      decls.set(m[1], {kind: "type", type});
    }
    const clean = src.replace(/\/\*\*[\s\S]*?\*\//g, "");
    for (const m of clean.matchAll(/^export function (\w+)(?:<[^(]*>)?\(([\s\S]*?)\):/gm)) {
      if (!functions.has(m[1])) functions.set(m[1], []);
      functions.get(m[1]).push(m[2].replace(/\s+/g, " ").trim());
    }
  }

  const cache = new Map();
  function resolve(expr, seen = new Set()) {
    expr = expr.trim();
    while (expr.startsWith("(") && expr.endsWith(")") && balanced(expr.slice(1, -1))) expr = expr.slice(1, -1).trim();
    const union = splitTop(expr, "|");
    if (union.length > 1) return merge(union.map((e) => resolve(e, seen)));
    const inter = splitTop(expr, "&");
    if (inter.length > 1) return merge(inter.map((e) => resolve(e, seen)));
    if (expr.startsWith("{")) return parseMembers(expr.slice(1, -1));
    let m = /^(Omit|Pick)<([\s\S]+)>$/.exec(expr);
    if (m) {
      const [base, keys] = splitTop(m[2], ",");
      const names = new Set([...keys.matchAll(/"(\w+)"/g)].map((k) => k[1]));
      const members = resolve(base, seen);
      return new Map([...members].filter(([k]) => (m[1] === "Omit" ? !names.has(k) : names.has(k))));
    }
    m = /^(\w+)(?:<[\s\S]*>)?$/.exec(expr);
    if (!m) return new Map();
    const name = m[1];
    if (cache.has(name)) return cache.get(name);
    const decl = decls.get(name);
    if (!decl || seen.has(name)) return new Map();
    seen = new Set(seen).add(name);
    const result =
      decl.kind === "interface"
        ? merge([...decl.extends.map((e) => resolve(e, seen)), decl.members])
        : resolve(decl.type, seen);
    cache.set(name, result);
    return result;
  }

  // The type of the named parameter of the first overload that has it.
  function param(fn, name = "options") {
    const overloads = functions.get(fn);
    if (!overloads) throw new Error(`Plot has no function ${fn}`);
    for (const overload of overloads) {
      for (const p of splitTop(overload, ",")) {
        const m = /^(\w+)\??:\s*([\s\S]+)$/.exec(p);
        if (m && m[1] === name) return m[2];
      }
    }
    return undefined;
  }

  // The string literals of a union type alias, e.g. ChannelName.
  function literals(name) {
    const decl = decls.get(name);
    if (!decl || decl.kind !== "type") throw new Error(`no type ${name}`);
    return [...decl.type.matchAll(/^\s*\|?\s*"([^"]+)"|\|\s*"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  }

  return {decls, functions, resolve, param, literals};
}
