#!/usr/bin/env node
// Generates the parts of the agent skill and of the llms.txt files that come
// from the spec, the schema, the fixtures and the generated allowlists, so that
// nothing is written twice:
//   skills/plot/SKILL.md                     the regions between <!-- generated:NAME --> markers
//   skills/plot/references/catalog.md        every mark, transform, reducer and named value
//   skills/plot/references/examples.md       the fixtures of spec/fixtures, one example each
//   skills/plot/references/spec.md           a copy of spec/spec.md
//   skills/plot/references/plot.schema.json  a copy of spec/plot.schema.json
//   docs/llms.txt, docs/llms-full.txt        for https://plotdown.cc/
// The hand-written parts live in SKILL.md (outside the markers) and in this file.
// Run `pnpm skill` after changing them, the spec or the catalog; the tests fail
// when the committed files differ from what this script writes.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadPlotTypes} from "./plot-types.mjs";
import {
  MARKS,
  TRANSFORMS,
  MARK_COMMON_KEYS,
  REDUCER_NAMES,
  WINDOW_REDUCERS,
  NORMALIZE_BASES,
  MAP_NAMES,
  SCALE_NAMES,
  SCALE_KEYS,
  TOP_LEVEL_KEYS,
  PROJECTION_KEYS,
  FACET_KEYS,
  LEGEND_KEYS,
  PLOT_VERSION,
  SPEC_VERSION
} from "../src/generated/plot-api.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const repo = "https://github.com/devlooped/plotdown";
const raw = "https://raw.githubusercontent.com/devlooped/plotdown/main";
const site = "https://plotdown.cc";

export const paths = {
  skill: path.join(root, "skills/plot/SKILL.md"),
  catalog: path.join(root, "skills/plot/references/catalog.md"),
  examples: path.join(root, "skills/plot/references/examples.md"),
  spec: path.join(root, "skills/plot/references/spec.md"),
  schema: path.join(root, "skills/plot/references/plot.schema.json"),
  llms: path.join(root, "docs/llms.txt"),
  llmsFull: path.join(root, "docs/llms-full.txt")
};

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const code = (values) => values.map((v) => `\`${v}\``).join(", ");

/** Returns {absolute path → content} for every file this script writes. */
export function generateSkill() {
  const spec = read(path.join(root, "spec/spec.md"));
  const schema = read(path.join(root, "spec/plot.schema.json"));
  const families = markFamilies(spec);
  const t = loadPlotTypes();
  const names = {
    curves: t.literals("CurveName"),
    symbols: t.literals("SymbolName"),
    schemes: t.literals("ColorSchemeCase").map((s) => s.toLowerCase()),
    projections: t.literals("ProjectionName"),
    scaleTypes: t.literals("ScaleType"),
    intervals: t.literals("TimeIntervalName"),
    markers: [...t.literals("MarkerName"), "none"]
  };

  const skill = fillRegions(read(paths.skill), {
    versions: `Spec ${SPEC_VERSION} · Observable Plot ${PLOT_VERSION}. Generated parts come from [the spec](references/spec.md).`,
    glance: glance(families, names)
  });
  const catalog = renderCatalog(families, names);
  const examples = renderExamples();
  const specCopy = `<!-- Copied from spec/spec.md by packages/plotdown/scripts/skill.mjs. Do not edit. -->\n\n` +
    spec.replace("[`fixtures/`](fixtures)", "[`examples.md`](examples.md)").replace("[`fixtures/`](fixtures) holds", "[`examples.md`](examples.md) holds");

  const {frontmatter, body} = splitFrontmatter(skill);
  const llms = renderLlms(frontmatter, body);
  const llmsFull = renderLlmsFull(frontmatter, body, catalog, examples, spec);

  return {
    [paths.skill]: skill,
    [paths.catalog]: catalog,
    [paths.examples]: examples,
    [paths.spec]: specCopy,
    [paths.schema]: schema,
    [paths.llms]: llms,
    [paths.llmsFull]: llmsFull
  };
}

// --- SKILL.md regions ---------------------------------------------------------

function fillRegions(text, regions) {
  for (const [name, content] of Object.entries(regions)) {
    const re = new RegExp(`(<!-- generated:${name} -->\\n)[\\s\\S]*?(<!-- /generated:${name} -->)`);
    if (!re.test(text)) throw new Error(`SKILL.md has no generated:${name} region`);
    text = text.replace(re, (_, open, close) => open + content + "\n" + close);
  }
  return text;
}

export function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("SKILL.md has no frontmatter");
  const frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (kv) frontmatter[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  }
  return {frontmatter, body: text.slice(m[0].length).replace(/^\n+/, "")};
}

/** Mark families, from the table of section 4.1 of the spec, checked against the allowlist. */
function markFamilies(spec) {
  const section = /### 4\.1 The marks\n([\s\S]*?)\n### /.exec(spec)?.[1];
  if (!section) throw new Error("spec.md has no section 4.1");
  const families = [];
  for (const line of section.split("\n")) {
    const m = /^\| ([^|]+?) \| (`.*`) \|$/.exec(line);
    if (m && m[1] !== "Family") families.push({family: m[1], marks: [...m[2].matchAll(/`(\w+)`/g)].map((x) => x[1])});
  }
  const listed = families.flatMap((f) => f.marks).sort();
  const known = Object.keys(MARKS).sort();
  if (JSON.stringify(listed) !== JSON.stringify(known)) throw new Error(`spec.md section 4.1 lists ${listed.join(",")} but the allowlist has ${known.join(",")}`);
  return families;
}

function transformFamilies() {
  const families = new Map();
  for (const [name, info] of Object.entries(TRANSFORMS)) {
    if (!families.has(info.family)) families.set(info.family, []);
    families.get(info.family).push(name);
  }
  return families;
}

function argumentOf(name, info) {
  if (info.arg === "outputs") {
    const outputs = info.reducers === "map" ? `channel → ${code(MAP_NAMES)}` : "channel → reducer";
    const extra = info.outputOptions?.length ? `; also ${code(info.outputOptions)}` : "";
    return `\`{${info.reducers === "map" ? '"y": "cumsum"' : '"y": "count"'}}\`: ${outputs}${extra}`;
  }
  if (info.arg === "merge") return info.input.length ? `\`true\` or \`{${info.input.map((k) => `"${k}"`).join(", ")}}\`` : "`true`";
  switch (info.kind) {
    case "stack": return '`true` or `{"offset", "order", "reverse", "z"}`';
    case "map": return code(MAP_NAMES);
    case "normalize": return `\`true\`, a basis (${code(NORMALIZE_BASES)}, \`"pNN"\`) or \`{"basis"}\``;
    case "window": return '`k` (an integer) or `{"k", "reduce", "anchor", "shift", "strict"}`';
    case "dodge": return `an anchor (${name === "dodgeX" ? '`"left"`, `"right"`, `"middle"`' : '`"top"`, `"bottom"`, `"middle"`'}), \`{"anchor", "padding", "r"}\` or \`true\``;
    case "selector": return '`"first"`, `"last"` or `{"<channel>": "min" | "max"}`';
    case "interval": return 'an interval: a number or `"5 days"`';
    case "channel": return "a field name (keeps rows where it is truthy) or an array of booleans";
    case "sort": return 'a field name, `{"channel": "-y"}` or `{"value", "order"}`';
  }
  throw new Error(`no argument description for ${name}`);
}

function glance(families, names) {
  const lines = [
    "**Marks** (the value of `\"mark\"`):",
    "",
    ...families.map((f) => `- ${f.family}: ${code(f.marks)}`),
    "",
    `Without data: ${code(Object.entries(MARKS).filter(([, m]) => m.call === "none").map(([n]) => n))}. Data optional: ${code(Object.entries(MARKS).filter(([, m]) => m.call === "optional").map(([n]) => n))}.`,
    "",
    "**Transforms** (the key of each entry of `\"transform\"`):",
    "",
    ...[...transformFamilies()].map(([family, members]) => `- ${family}: ${code(members)}`),
    "",
    `**Reducers**: ${code(REDUCER_NAMES)}, \`"p25"\`…\`"p99"\`. **Window reducers**: ${code(WINDOW_REDUCERS)}.`,
    "",
    `**Curves**: ${code(names.curves)}. **Symbols**: ${code(names.symbols)}.`
  ];
  return lines.join("\n");
}

// --- references/catalog.md ----------------------------------------------------

function renderCatalog(families, names) {
  const out = [
    "<!-- Generated by packages/plotdown/scripts/skill.mjs from the allowlists of the core. Do not edit. -->",
    "",
    "# plotdown catalog",
    "",
    `Every name a \`plot\` block accepts, for spec ${SPEC_VERSION} and Observable Plot ${PLOT_VERSION}. A key that is not listed for its place is an error. The format itself is in [spec.md](spec.md); complete blocks are in [examples.md](examples.md).`,
    "",
    "## Top-level keys",
    "",
    `\`marks\` (required), ${code(TOP_LEVEL_KEYS.filter((k) => k !== "marks"))}.`,
    "",
    "## Scales",
    "",
    `The scales are ${code(SCALE_NAMES)}. Each takes an object of: ${code(SCALE_KEYS)}.`,
    "",
    ...Object.entries(LEGEND_KEYS).map(([scale, keys]) => `- \`${scale}\` also takes the legend options ${code(keys)}.`),
    "",
    `Scale types: ${code(names.scaleTypes)}.`,
    "",
    `Color schemes (\`"scheme"\`, any case): ${code(names.schemes)}.`,
    "",
    "## Projection and facets",
    "",
    `\`projection\` is a name, ${code(names.projections)}, or an object of ${code(PROJECTION_KEYS)}.`,
    "",
    `\`facet\` is an object of ${code(FACET_KEYS)}; marks can also take \`fx\` and \`fy\` channels.`,
    "",
    "## Marks",
    "",
    `Every mark but \`auto\` takes the common options ${code(MARK_COMMON_KEYS)}.`,
    "",
    "Each mark also takes the options below, plus `mark`, `data` (unless it takes no data) and `transform`. Options that a transform reads (see Transforms) are only valid when the mark lists that transform.",
    ""
  ];
  const transformInputs = new Set(Object.values(TRANSFORMS).flatMap((s) => s.input));
  for (const {family, marks} of families) {
    out.push(`### ${family}`, "");
    for (const name of marks) {
      const info = MARKS[name];
      const data = info.call === "none" ? "no data" : info.call === "optional" ? "optional data" : "data";
      const keys = info.keys.filter((k) => !transformInputs.has(k) || ["z", "interval"].includes(k));
      out.push(`- \`${name}\` (${data}${info.common ? "" : ", no common options"}): ${keys.length ? code(keys) : "no other options"}`);
    }
    out.push("");
  }
  out.push(
    "## Transforms",
    "",
    "Write `\"transform\": [{\"<name>\": <argument>}, …]` on a mark. The first entry is applied first (it is the innermost call in JavaScript).",
    "",
    "| Transform | Argument | Reads from the mark |",
    "| --- | --- | --- |",
    ...Object.entries(TRANSFORMS).map(([name, info]) => `| \`${name}\` | ${argumentOf(name, info).replace(/\|/g, "\\|")} | ${info.input.length ? code(info.input) : ""} |`),
    "",
    `Reducers of \`bin\`, \`group\` and \`hexbin\` outputs: ${code(REDUCER_NAMES)}, percentiles \`"p00"\`…\`"p99"\`; bin outputs also take \`"x"\`, \`"x1"\`, \`"x2"\`, \`"y"\`, \`"y1"\`, \`"y2"\`, \`"z"\` and group outputs \`"x"\`, \`"y"\`, \`"z"\`. An output may also be \`{"reduce", "scale", "label"}\` or \`null\`.`,
    "",
    `Window reducers: ${code(WINDOW_REDUCERS)} and percentiles. Normalize bases: ${code(NORMALIZE_BASES)} and percentiles. Maps: ${code(MAP_NAMES)}.`,
    "",
    "## Named values",
    "",
    `- Curves (\`"curve"\`): ${code(names.curves)}, \`"auto"\`.`,
    `- Symbols (\`"symbol"\` constant): ${code(names.symbols)}.`,
    `- Markers (\`"marker"\`, \`"markerStart"\`, \`"markerMid"\`, \`"markerEnd"\`): ${code(names.markers)}, \`true\`.`,
    `- Time intervals (\`"interval"\`, \`shiftX\`/\`shiftY\`): ${code(names.intervals)}, optionally with a count and a plural (\`"3 months"\`, \`"10 years"\`); or a number.`,
    "- Formats (`\"tickFormat\"`, tip `\"format\"`): [d3-format](https://d3js.org/d3-format) strings such as `\",.0f\"`, `\".1%\"`, `\"$.2s\"`, `\"d\"`, or [d3-time-format](https://d3js.org/d3-time-format) strings such as `\"%b %Y\"`, `\"%Y-%m-%d\"`.",
    ""
  );
  return out.join("\n");
}

// --- references/examples.md ---------------------------------------------------

function renderExamples() {
  const dir = path.join(root, "spec/fixtures");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const out = [
    "<!-- Generated by packages/plotdown/scripts/skill.mjs from spec/fixtures. Do not edit. -->",
    "",
    "# plotdown examples",
    "",
    `${files.length} complete blocks, ported from the Observable Plot documentation, that cover every mark family and every transform family. Each one renders with plotdown and matches the hand-written \`Plot.plot()\` call.`,
    ""
  ];
  for (const file of files) {
    const spec = JSON.parse(read(path.join(dir, file)));
    const marks = [...new Set(spec.marks.map((m) => m.mark))];
    const transforms = [...new Set(spec.marks.flatMap((m) => (m.transform ?? []).map((t) => Object.keys(t)[0])))];
    out.push(`## ${file.slice(0, -5)}`, "", `Marks: ${code(marks)}.${transforms.length ? ` Transforms: ${code(transforms)}.` : ""}`, "", "```plot", formatJson(spec), "```", "");
  }
  return out.join("\n");
}

/** JSON with short values on one line and long arrays one element per line. */
export function formatJson(value, indent = "") {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== "object" || indent.length + flat.length <= 100) return pad(flat);
  const next = indent + "  ";
  if (Array.isArray(value)) {
    const items = value.map((v) => {
      const f = JSON.stringify(v);
      return next.length + f.length <= 140 ? pad(f) : formatJson(v, next);
    });
    return "[\n" + items.map((s) => next + s).join(",\n") + "\n" + indent + "]";
  }
  return "{\n" + Object.entries(value).map(([k, v]) => next + JSON.stringify(k) + ": " + formatJson(v, next)).join(",\n") + "\n" + indent + "}";
}

// Spaces after commas and colons outside strings, as people write JSON.
function pad(json) {
  return json.replace(/("(?:[^"\\]|\\.)*")|([,:])/g, (m, str, punct) => (str ? str : punct + " "));
}

// --- docs/llms.txt and docs/llms-full.txt -------------------------------------

const SUMMARY =
  "plotdown renders a fenced `plot` block of Markdown — the options of Observable Plot's `Plot.plot()` as strict JSON, with marks and transforms written as data — as a chart, on GitHub, GitLab, docs sites, editors and chat apps.";

function section(body, heading) {
  const m = new RegExp(`(^|\\n)## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(body);
  if (!m) throw new Error(`SKILL.md has no "## ${heading}" section`);
  return m[2].trim();
}

function firstBlock(markdown) {
  const m = /```plot\n[\s\S]*?\n```/.exec(section(markdown, "Examples"));
  if (!m) throw new Error("SKILL.md has no plot block in its Examples");
  return m[0];
}

function absolutize(markdown) {
  return markdown.replace(/\]\((references\/[^)]+)\)/g, `](${repo}/blob/main/skills/plot/$1)`);
}

function renderLlms(frontmatter, body) {
  return [
    "# plotdown",
    "",
    `> ${SUMMARY}`,
    "",
    "These are the rules of the plotdown agent skill: follow them whenever you write a chart in Markdown, and read the full guide below before you use a mark or a transform that the example does not show.",
    "",
    "## Rules for writing a block",
    "",
    absolutize(section(body, "Rules")),
    "",
    "Example:",
    "",
    firstBlock(body),
    "",
    "## Docs",
    "",
    `- [Full guide for models](${site}/llms-full.txt): the skill, the catalog of marks and transforms, the spec and ${fs.readdirSync(path.join(root, "spec/fixtures")).length} examples in one file`,
    `- [Agent skill](${raw}/skills/plot/SKILL.md): how to write a valid block, with examples by chart type`,
    `- [Specification](${raw}/spec/spec.md): the format, spec ${SPEC_VERSION}, Observable Plot ${PLOT_VERSION}`,
    `- [Catalog](${raw}/skills/plot/references/catalog.md): every mark, option, transform, reducer and named value`,
    `- [Examples](${raw}/skills/plot/references/examples.md): complete blocks for every mark and transform family`,
    "",
    "## Tools",
    "",
    `- [JSON Schema](${site}/schema/plot.schema.json): JSON Schema 2020-12 of a block, the current version (\`$id\` ${site}/schema/${SPEC_VERSION}/plot.schema.json, the same file at a URL that names the version), for editors and structured outputs. A block kept in a file of its own is named \`*.plotdown.json\``,
    `- [npm package @devlooped/plotdown](${repo}/blob/main/packages/plotdown/readme.md): \`render\`, \`renderAsync\`, \`validate\`, \`parse\` and \`PlotdownError\``,
    "",
    "## Optional",
    "",
    `- [Repository](${repo}): source, issues and releases`,
    "- [Observable Plot](https://observablehq.com/plot/): the documentation of the options plotdown takes (plotdown is not affiliated with Observable)",
    ""
  ].join("\n");
}

function demote(markdown, levels) {
  let fence = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (f) {
        if (!fence) fence = f[1];
        else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
        return line;
      }
      return !fence && /^#{1,5} /.test(line) ? "#".repeat(levels) + line : line;
    })
    .join("\n");
}

function renderLlmsFull(frontmatter, body, catalog, examples, spec) {
  const strip = (md) => md.replace(/^<!--[\s\S]*?-->\n+/, "").replace(/^# .*\n+/, "");
  return [
    "# plotdown",
    "",
    `> ${SUMMARY}`,
    "",
    `This file holds, in one place, what a model needs to write valid \`plot\` blocks: the agent skill, the catalog of every name a block accepts, the specification (spec ${SPEC_VERSION}, Observable Plot ${PLOT_VERSION}) and complete examples. Source: ${repo}.`,
    "",
    "## Writing plot blocks",
    "",
    demote(absolutize(body.replace(/^# .*\n+/, "")), 1).trim(),
    "",
    "## Catalog",
    "",
    demote(strip(catalog).replace(/\]\((spec|examples)\.md\)/g, (_, f) => `](#${f === "spec" ? "specification" : "examples"})`), 1).trim(),
    "",
    "## Specification",
    "",
    demote(strip(spec).replace("[`plot.schema.json`](plot.schema.json)", `[\`plot.schema.json\`](${raw}/spec/plot.schema.json)`).replace(/\]\(plot\.schema\.json\)/g, `](${raw}/spec/plot.schema.json)`).replace(/\]\(fixtures\)/g, "](#examples)"), 1).trim(),
    "",
    "## Examples",
    "",
    demote(strip(examples), 1).trim(),
    ""
  ].join("\n");
}

// Writes the files, or with --check exits 1 when they differ.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = generateSkill();
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [file, content] of Object.entries(files)) {
    const current = fs.existsSync(file) ? read(file) : null;
    if (current === content) continue;
    if (check) {
      console.error(`stale: ${path.relative(process.cwd(), file)}`);
      stale = true;
    } else {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, content);
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  }
  if (stale) process.exit(1);
}
