<!-- Copied from spec/spec.md by packages/plotdown/scripts/skill.mjs. Do not edit. -->

# The plotdown block

**Spec version 0.1** · Observable Plot **0.6.19** · Schema: [`plot.schema.json`](plot.schema.json) · Examples: [`examples.md`](examples.md)

A plotdown block is a fenced code block of Markdown that holds a chart as **strict JSON**: the options of [Observable Plot](https://observablehq.com/plot/)'s `Plot.plot()`, with marks and transforms written as data instead of function calls. A renderer turns the block into the same chart that the equivalent JavaScript draws.

````markdown
```plot
{
  "title": "Penguin body mass",
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "color": {"legend": true},
  "y": {"grid": true},
  "marks": [
    {"mark": "rectY", "data": "penguins", "x": "body_mass_g", "fill": "species",
     "transform": [{"binX": {"y": "count"}}]},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

is the JSON form of

```js
Plot.plot({
  title: "Penguin body mass", color: {legend: true}, y: {grid: true},
  marks: [
    Plot.rectY(penguins, Plot.binX({y: "count"}, {x: "body_mass_g", fill: "species"})),
    Plot.ruleY([0])
  ]
})
```

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. "Renderer" means an implementation of this spec; the reference renderer is the npm package `plotdown`.

## 1. Versions

- This document is spec version **0.1**. The schema's `$id` carries it: `https://plotdown.cc/schema/0.1/plot.schema.json`.
- The option names and values are those of **Observable Plot 0.6.19**. A renderer pins one Plot version; the allowlists of this spec (marks, transforms, option keys) are generated from that version's type declarations, so they change only with a new spec version.
- A block MAY name the schema it was written against with a top-level `"$schema"` key. Renderers ignore its value.

## 2. Fences

A block is a fenced code block whose info string starts with one of these words, in any case:

| Fence | Use |
| --- | --- |
| `plot` | Canonical. GitHub highlights it as gnuplot (Linguist maps `.plot` to Gnuplot). |
| `oplot` | Same meaning; not highlighted by GitHub. Short for Observable Plot. |
| `observable-plot` | Same meaning; not highlighted by GitHub. |

Anything after the first word of the info string is ignored.

Because a `plot` fence may also hold a gnuplot script, a renderer that finds blocks in rendered HTML (where the fence name may be lost or ambiguous) SHOULD render a block only when its text, trimmed, starts with `{`, ends with `}`, parses as JSON and is an object with a `marks` array. The same test tells a complete block from one that is still streaming. A block that passes this test but fails validation is shown with its error (section 10), not left as code silently.

## 3. The block

The block is one JSON object (RFC 8259): no comments, no trailing commas, no `NaN`, no functions. Its keys are:

| Key | Value |
| --- | --- |
| `marks` | **Required.** An array of marks (section 4), drawn in order. |
| `data` | An object of named datasets (section 7) that marks refer to by name. |
| `$schema` | Optional URL of the schema. |
| Every other key | An option of `Plot.plot()`, with the same name and meaning (section 8). |

Every key that is not in this spec is an error (section 10). A typo is an error rather than a chart that silently differs.

## 4. Marks

A mark is an object:

```json
{"mark": "dot", "data": "penguins", "x": "flipper_length_mm", "y": "body_mass_g", "fill": "species", "transform": [ … ]}
```

- `mark` (required) is the name of a Plot mark function: `"dot"` means `Plot.dot`.
- `data` is the mark's data (section 7).
- `transform` is an array of transforms (section 6).
- Every other key is an option of that mark in Plot, with the same name and value.

The mark is called as `Plot.<mark>(data, options)`, where `options` holds every key but `mark`, `data` and `transform`, after the transforms are applied to it.

### 4.1 The marks

| Family | Marks |
| --- | --- |
| area | `area`, `areaX`, `areaY` |
| arrow | `arrow` |
| auto | `auto` |
| axis and grid | `axisX`, `axisY`, `axisFx`, `axisFy`, `gridX`, `gridY`, `gridFx`, `gridFy` |
| bar | `barX`, `barY` |
| bollinger | `bollingerX`, `bollingerY` |
| box | `boxX`, `boxY` |
| cell | `cell`, `cellX`, `cellY` |
| contour | `contour` |
| crosshair | `crosshair`, `crosshairX`, `crosshairY` |
| delaunay | `delaunayLink`, `delaunayMesh`, `hull`, `voronoi`, `voronoiMesh` |
| density | `density` |
| difference | `differenceX`, `differenceY` |
| dot | `dot`, `dotX`, `dotY`, `circle`, `hexagon` |
| frame | `frame` |
| geo | `geo`, `sphere`, `graticule` |
| hexgrid | `hexgrid` |
| image | `image` |
| line | `line`, `lineX`, `lineY` |
| linear regression | `linearRegressionX`, `linearRegressionY` |
| link | `link` |
| raster | `raster` |
| rect | `rect`, `rectX`, `rectY` |
| rule | `ruleX`, `ruleY` |
| text | `text`, `textX`, `textY` |
| tick | `tickX`, `tickY` |
| tip | `tip` |
| tree | `tree`, `cluster` |
| vector | `vector`, `vectorX`, `vectorY`, `spike` |
| waffle | `waffleX`, `waffleY` |

No other name is a mark: not `plot`, `legend`, `marks`, `autoSpec`, nor any helper of Plot.

### 4.2 How each mark takes data

- `frame`, `sphere`, `graticule` and `hexgrid` take no data: a `data` key is an error. They are called `Plot.<mark>(options)`.
- The axis and grid marks, `contour` and `raster` take optional data. Without `data` they are called `Plot.<mark>(options)`.
- Every other mark is called `Plot.<mark>(data, options)`; without `data`, `data` is `undefined`.

### 4.3 Options

A mark accepts the options Plot declares for it (its `…Options` interface in Plot's type declarations), except those that only take a function: `transform`, `initializer` and `render`. Most marks share Plot's common mark options (`fill`, `stroke`, `strokeWidth`, `opacity`, `title`, `href`, `tip`, `fx`, `fy`, `sort`, `filter`, `dx`, `dy`, `clip`, `className`, …); the schema lists, per mark, the keys it accepts.

One name differs from Plot: the `auto` mark's own `mark` option (`"area"`, `"bar"`, `"dot"`, `"line"`, `"rule"`) is written **`autoMark`**, since `mark` names the plotdown mark.

```json
{"mark": "auto", "data": "penguins", "x": "species", "y": {"value": "body_mass_g", "reduce": "mean"}, "autoMark": "bar"}
```

Options that hold names in Plot hold the same names here: curves (`"curve": "catmull-rom"`), symbols (`"symbol": "triangle"`), markers (`"markerEnd": "arrow"`), reducers, intervals (`"interval": "month"`), color schemes (`"scheme": "blues"`), projections (`"projection": "albers-usa"`), number and time formats (`"tickFormat": "$.2f"`, `"tickFormat": "%b %Y"`, d3-format and d3-time-format strings).

## 5. Channels

A channel is a mark option that varies per datum: `x`, `y`, `x1`, `x2`, `y1`, `y2`, `z`, `fill`, `stroke`, `r`, `text`, `title`, `href`, `src`, `symbol`, `fx`, `fy`, `fontSize`, `rotate`, `length`, `opacity`, `strokeWidth`, `fillOpacity`, `strokeOpacity`, `weight`, `width`, `height`, `geometry`, `path`, and the like. Its value is one of:

| Value | Meaning | Example |
| --- | --- | --- |
| string | The name of a field of each row | `"x": "body_mass_g"` |
| string that is a CSS color, for `fill` and `stroke` | A constant color (Plot's own rule) | `"fill": "steelblue"`, `"stroke": "#e45"` |
| number, boolean, `null` | A constant | `"r": 3`, `"fillOpacity": 0.5`, `"stroke": null` |
| array | One value per datum | `"x": [1, 2, 3]` |
| object | `{"value": <field, constant or array>, "label": "…", "scale": "…" \| true \| false \| null}`, plus `interval`, `thresholds`, `domain`, `cumulative` where Plot accepts them (a bin input such as `{"value": "weight", "thresholds": 20}`) and `reduce`, `zero`, `color` for the `auto` mark | `"x": {"value": "date", "label": "Date"}` |

A field name that is also a CSS color cannot be referenced for `fill` or `stroke` (as in Plot without an accessor). Fields of nested objects cannot be reached: a field name is looked up on the row as is (`"a.b"` is the key `a.b`).

The `channels` option (extra channels for the tip) is an object of channel values. The `tip` option is `true`, `false`, `"x"`, `"y"`, `"xy"` or an object of tip options (the options of the `tip` mark, plus `pointer`: `"x"`, `"y"` or `"xy"`). The mark-level `sort` option is a field name, `{"channel": "-y", "order": …}`, or a domain sort such as `{"x": "-y", "reduce": "sum", "limit": 10}`.

## 6. Transforms

A transform is an object with exactly one key, the name of a Plot transform, whose value is the transform's **argument**:

```json
"transform": [{"filter": "sex"}, {"groupX": {"y": "count"}}]
```

### 6.1 Order

Transforms apply **in array order**: the first one transforms the mark's options, the next one transforms the result, and so on. `[A, B]` is `Plot.B(argB, Plot.A(argA, options))`; the example above is

```js
Plot.groupX({y: "count"}, Plot.filter("sex", options))
```

that is, the first entry is the innermost call, as Plot composes transforms: rows are filtered, then grouped. Marks that stack implicitly (`barY`, `areaY`, `rectY`, `waffleY` and their X forms) still do so after the listed transforms, as in Plot.

### 6.2 Arguments

| Transforms | Argument | Call |
| --- | --- | --- |
| `bin`, `binX`, `binY` | Outputs: channel name → reducer. Also `data`, `filter`, `sort` (reducers), `reverse`, `z`, and the bin options `cumulative`, `domain`, `thresholds`, `interval` | `Plot.binX(arg, options)` |
| `group`, `groupX`, `groupY`, `groupZ` | Outputs: channel name → reducer. Also `data`, `filter`, `sort`, `reverse`, `z` | `Plot.groupX(arg, options)` |
| `hexbin` | Outputs: channel name → reducer | `Plot.hexbin(arg, options)` |
| `map` | Outputs: channel name → `"cumsum"`, `"rank"` or `"quantile"` | `Plot.map(arg, options)` |
| `mapX`, `mapY` | `"cumsum"`, `"rank"` or `"quantile"` | `Plot.mapY(arg, options)` |
| `normalizeX`, `normalizeY` | A basis (`"first"`, `"last"`, `"min"`, `"max"`, `"mean"`, `"median"`, `"sum"`, `"extent"`, `"deviation"`, `"pNN"`), `{"basis": …}`, or `true` for the default | `Plot.normalizeY(arg, options)` |
| `windowX`, `windowY` | `k` (a positive integer) or `{"k", "reduce", "anchor", "shift", "strict"}` | `Plot.windowY(arg, options)` |
| `stackX`, `stackX1`, `stackX2`, `stackY`, `stackY1`, `stackY2` | `{"offset", "order", "reverse", "z"}` or `true` for the defaults | `Plot.stackY(arg, options)` |
| `dodgeX`, `dodgeY` | An anchor, `{"anchor", "padding", "r"}` or `true` | `Plot.dodgeY(arg, options)` |
| `select` | `"first"`, `"last"`, or `{"<channel>": "min" \| "max"}` | `Plot.select(arg, options)` |
| `selectFirst`, `selectLast`, `selectMinX`, `selectMinY`, `selectMaxX`, `selectMaxY` | `true`, or `{"z": …}` | `Plot.selectLast({...options, ...arg})` |
| `shiftX`, `shiftY` | An interval: a number or a time interval such as `"5 days"` | `Plot.shiftX(arg, options)` |
| `filter` | A channel: a field name (rows where it is truthy) or an array of booleans | `Plot.filter(arg, options)` |
| `sort` | A channel (field name), or `{"channel": "-y"}`, `{"value": …, "order": "ascending" \| "descending"}` | `Plot.sort(arg, options)` |
| `reverse` | `true` | `Plot.reverse(options)` |
| `shuffle` | `true` or `{"seed": n}` | `Plot.shuffle({...options, ...arg})` |
| `centroid`, `geoCentroid` | `true` or `{"geometry": …}` | `Plot.centroid({...options, ...arg})` |
| `treeNode`, `treeLink` | `true` or `{"path", "delimiter", "treeAnchor"}` | `Plot.treeNode({...options, ...arg})` |
| `pointer`, `pointerX`, `pointerY` | `true` or `{"maxRadius", "px", "py"}` | `Plot.pointerX({...options, ...arg})` |

**Reducers** are names: `"count"`, `"distinct"`, `"sum"`, `"proportion"`, `"proportion-facet"`, `"min"`, `"min-index"`, `"max"`, `"max-index"`, `"mean"`, `"median"`, `"mode"`, `"variance"`, `"deviation"`, `"first"`, `"last"`, `"identity"`, a percentile `"p00"`…`"p99"`; bin outputs also take `"x"`, `"x1"`, `"x2"`, `"y"`, `"y1"`, `"y2"`, `"z"`, and group outputs `"x"`, `"y"`, `"z"`. An output may be `{"reduce": <name>, "scale": …, "label": …}` or `null`. Window reducers are `"mean"`, `"median"`, `"sum"`, `"min"`, `"max"`, `"mode"`, `"variance"`, `"deviation"`, `"difference"`, `"ratio"`, `"first"`, `"last"` and percentiles.

### 6.3 Transform options on the mark

Some transforms read options from the mark's options, as in Plot: the bin transforms read `thresholds`, `interval`, `domain` and `cumulative`; `hexbin` reads `binWidth`; the pointer transforms read `maxRadius`, `px`, `py`; the tree transforms read `path`, `delimiter`, `treeAnchor`; `centroid` reads `geometry`; `shuffle` reads `seed`; the select transforms read `z`. These keys are valid on a mark **only when it lists a transform that reads them**; otherwise they are errors that name the transform.

```json
{"mark": "rectY", "data": "penguins", "x": "body_mass_g", "thresholds": 20, "transform": [{"binX": {"y": "count"}}]}
```

Not supported: Plot's `transform` and `initializer` helpers, the `find` reducer, `Plot.normalize`/`Plot.window`/`Plot.bollinger` as map functions, custom reducers, maps, selectors, intervals or thresholds given as functions.

## 7. Data

### 7.1 Forms

The `data` of a mark (and the `data` of the `facet` option) is one of:

| Form | Example |
| --- | --- |
| Inline rows: an array of objects, of values, or of arrays | `[{"x": 1, "y": 2}, {"x": 2, "y": 5}]`, `[0]` |
| The name of a dataset of the top-level `data` map | `"penguins"` |
| CSV text with a header row | `{"csv": "x,y\n1,2\n2,5\n"}` |
| TSV text with a header row | `{"tsv": "x\ty\n1\t2\n"}` |
| A remote file (off by default, 7.4) | `{"url": "https://example.com/data.csv", "format": "csv"}` |
| A GeoJSON object | `{"type": "FeatureCollection", "features": [ … ]}` |
| `null` | no data |

The top-level `data` map holds named datasets in any of these forms but a name: `"data": {"penguins": {"csv": "…"}}`. Dataset names start with a letter or `_` and hold letters, digits, `_` and `-`. Marks that name the same dataset receive **the same array**, so Plot's facets (which match data by identity) work across marks:

```json
{"facet": {"data": "penguins", "x": "sex"}, "marks": [{"mark": "frame"}, {"mark": "dot", "data": "penguins", "x": "flipper_length_mm", "y": "body_mass_g"}]}
```

A GeoJSON object is recognized by its `type`: `Feature`, `FeatureCollection`, `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `GeometryCollection` or `Sphere`. Plot reads a FeatureCollection as its features.

### 7.2 CSV and TSV

CSV follows RFC 4180: fields separated by `,` (TSV: tab), quoted with `"`, a `""` inside quotes is a quote, records end with LF or CRLF, blank lines are skipped. The first record names the columns; a duplicate name is an error, and the names `__proto__`, `constructor` and `prototype` are rejected. Each cell is typed:

| Cell (after trimming spaces) | Value |
| --- | --- |
| empty | `null` |
| `true`, `false` | boolean |
| a decimal number: `-12`, `3.5`, `.5`, `1e6` | number |
| anything else | the text as written |

Hexadecimal, `NaN` and `Infinity` stay text. Then the date rule applies to each column.

### 7.3 Dates

JSON has no dates; this rule makes them:

> An array of values, or a column of rows, in which **every value that is not `null` is an ISO 8601 date string**, and there is at least one, becomes **Date** values (and `null` stays `null`).

An ISO 8601 date string here is `YYYY-MM`, `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM`, with optional `:SS` and `.sss` (up to 9 digits, read to milliseconds), and an optional `Z` or offset `±HH:MM` / `±HHMM`. A six-digit year with a sign (`+YYYYYY`) is allowed. Values must be real dates (`2023-02-30` is not one). A date-time without an offset is **UTC**, so that a chart renders the same in every time zone. A bare year (`"2024"`) is not a date, and a column with one string that is not a date stays text.

The rule applies to: inline rows and CSV/TSV rows (per field of object rows, per index of array rows), arrays of values given as data (`"data": ["2024-03-01"]`), and every array of values in the options, such as a channel given as an array, a scale's `domain`, `ticks` or `grid`, a bin `domain`. It does not apply inside GeoJSON objects or to single strings (a single string in a channel is a field name).

### 7.4 Remote data and images

A `{"url": …}` dataset and the `src` of an `image` mark load from the network. Renderers MUST NOT load them unless the host allows it, and SHOULD let the host allow nothing (the default), everything, or a list of origins. Rules:

- Only `http` and `https` URLs. A relative URL resolves against the host's base URL; with a list of origins it needs one.
- `format` is `"csv"`, `"tsv"` or `"json"`; without it, the file extension (`.csv`, `.tsv`, `.json`, `.geojson`) decides, and an unknown extension is an error. A JSON file holds rows (an array) or a GeoJSON object.
- Requests carry no credentials and no referrer. A redirect to an origin outside the list is an error.
- The loaded data is checked exactly like inline data (limits, links, CSS).
- An `image` `src` that is a `data:image/…` URL needs no network and is always allowed; `file:` and `blob:` are never allowed.

The `src` of an image is a constant when it starts with `./`, `../`, `/` or a scheme (Plot's rule), and a field name otherwise.

## 8. Plot options

The top-level keys other than `marks`, `data` and `$schema` are those of `Plot.plot()`:

- **Layout:** `width`, `height`, `aspectRatio`, `margin`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `inset`…, `style`, `className`, `clip`, `figure`.
- **Text:** `title`, `subtitle`, `caption` (strings: HTML elements in Plot are not available), `ariaLabel`, `ariaDescription`.
- **Scales:** `x`, `y`, `fx`, `fy`, `r`, `color`, `opacity`, `symbol`, `length`: objects of scale options (`type`, `domain`, `range`, `scheme`, `interpolate` by name, `nice`, `zero`, `reverse`, `label`, `grid`, `ticks`, `tickFormat`, `tickRotate`, `percent`, `legend`, …). `color`, `opacity` and `symbol` also take their legend options (`legend`, `width`, `columns`, `swatchSize`, …). The scale defaults (`grid`, `label`, `axis`, `nice`, `zero`, `round`, `clamp`, `padding`, `align`, `inset`…) are also valid at the top level, as in Plot.
- **Projection:** `projection`: a name (`"albers-usa"`, `"equal-earth"`, `"mercator"`, `"orthographic"`, …) or `{"type", "domain" (GeoJSON), "rotate", "parallels", "precision", "clip", "inset"…}`.
- **Facets:** `facet`: `{"data", "x", "y", "margin"…, "grid", "label"}`; or the `fx` and `fy` channels of marks.

The `style` option is a string of CSS or an object of CSS properties with string or number values; it MUST NOT contain backslash escapes, `@import`, or the CSS functions `url()` (other than `url(#id)`), `image()`, `image-set()`, `cross-fade()`, `element()`, `expression()`.

## 9. Security

A block may come from anyone, including a language model, and renderers run it in the reader's browser, in extensions and on servers. A conforming renderer:

1. **Evaluates nothing.** The block is parsed as JSON; mark and transform names are looked up in fixed allowlists (sections 4.1 and 6.2) as own properties, never on prototypes; no string becomes code.
2. **Rejects function-like strings** in options: a string that starts like a JavaScript function — `function`, `async`, `(a, b) =>`, `d =>` — is an error, since Plot would read it as a field name and draw the wrong chart. Free text is exempt: the top-level `title`, `subtitle`, `caption`, `ariaLabel`, `ariaDescription`, any `label`, and data values.
3. **Limits links.** Every value of an `href` channel (on the mark or in its tip), resolved over the mark's data, is an `http`, `https` or `mailto` URL or a relative one. Whitespace and control characters inside a scheme (`java\tscript:`) are ignored when the scheme is read.
4. **Loads nothing from the network** unless the host allows it (7.4).
5. **Rejects CSS `url()`** that is not a `#fragment`, in any string of the block, data included: Plot accepts `url(…)` as a color, and an SVG paint server or filter can load a remote file.
6. **Rejects the keys `__proto__`, `constructor` and `prototype`** anywhere in the block, data included.
7. **Applies limits** (section 10).
8. **Checks its own output** (recommended): no `<script>`, `<foreignObject>` or other active element, no `on…` attribute, no unsafe link, no remote `url()`, images only as allowed.

## 10. Errors and limits

These are errors:

- text that is not JSON, or JSON that is not an object; a missing `marks` array;
- a key that is not a Plot option of its place (top level, scale, projection, facet, mark, tip, channel object, transform argument, output), with the rules of 4.3 and 6.3;
- an unknown mark, transform, reducer or map name; a transform object without exactly one key;
- `data` on a mark that takes none; a dataset name that is not in the `data` map;
- the security rules of section 9 and the remote rules of 7.4;
- the limits below;
- whatever Plot itself rejects when the chart is built (an unknown curve, an invalid scale type…).

The reference renderer's limits (a host may change them):

| Limit | Default |
| --- | --- |
| Source text | 524,288 characters |
| Nesting of arrays and objects | 64 levels |
| Marks | 64 |
| Rows of one dataset, or values of one channel array | 100,000 |
| `width`, `height` | 10,000 px |
| Thresholds given as a count (bins, contours, density) | 10,000 |
| `pixelSize` of raster and contour | at least 0.5 |
| `binWidth` of hexbin and hexgrid | at least 1 |
| Remote file | 5,242,880 characters, 10 s |

An error names the **JSON path** of the offending value, written `$` for the block, `.key` for a key that is an identifier, `["key"]` for any other key, and `[n]` for an index: `$.marks[1].transform[0].binX.y`. An error in a value of a dataset names the cell (`$.data.links[3].url`) or, for CSV and TSV text, the text with the row and column in the message. A JSON syntax error also carries a line and a column. A renderer that cannot render a block SHOULD leave the block as code and show the error next to it.

## 11. Conformance

- [`plot.schema.json`](plot.schema.json) (JSON Schema 2020-12) describes the block. It accepts on every mark the transform options of 6.3 whether or not the transform is present, and it does not check links, URLs, dates, function-like strings, CSS or limits: a valid block MUST pass the schema; passing the schema is not enough.
- [`examples.md`](examples.md) holds 30 blocks ported from the Plot documentation, one per mark family, covering every transform family. A renderer conforms when each fixture renders the same SVG as the equivalent hand-written `Plot.plot()` call with the pinned Plot version (ids of clip paths, markers, patterns and filters aside).

## 12. Writing blocks (for people and models)

- Start from the JavaScript you would write and replace each call: `Plot.dot(data, {…})` → `{"mark": "dot", "data": …, …}`; `Plot.binX({y: "count"}, {…})` → `"transform": [{"binX": {"y": "count"}}]`; nested transforms → the innermost first.
- Name fields with strings; never write `d => …`. For a derived value, use a transform (`normalizeY`, `mapY`, `windowY`, `binX`, `groupX`…) or compute it in the data.
- Put data inline: rows for small tables, `{"csv": …}` for more; give it a name in `data` when several marks use it. Write dates as ISO 8601 strings.
- Constant colors are CSS colors (`"fill": "steelblue"`); other strings are field names.
- Validate against `plot.schema.json` (with JSON Schema 2020-12 support) before emitting a block.

### Example: a line with a moving average and a tip

```plot
{
  "y": {"grid": true, "label": "Close ($)"},
  "data": {"aapl": [
    {"date": "2024-03-01", "close": 129.6}, {"date": "2024-03-02", "close": 130.2},
    {"date": "2024-03-03", "close": 128.9}, {"date": "2024-03-04", "close": 131.5},
    {"date": "2024-03-05", "close": 133.1}, {"date": "2024-03-06", "close": 132.4}
  ]},
  "marks": [
    {"mark": "lineY", "data": "aapl", "x": "date", "y": "close", "strokeOpacity": 0.3},
    {"mark": "lineY", "data": "aapl", "x": "date", "y": "close", "transform": [{"windowY": {"k": 3, "reduce": "mean"}}]},
    {"mark": "tip", "data": "aapl", "x": "date", "y": "close", "transform": [{"pointerX": true}]}
  ]
}
```

## 13. The reference renderer

`plotdown` (npm) implements this spec in TypeScript with `@observablehq/plot` as its only dependency; its core runs in browsers, Manifest V3 extensions, workers and Node (with a jsdom or linkedom document).

```ts
import {render, renderAsync, validate, parse, isPlotSpec, isPlotFence, FENCE_NAMES, PlotdownError} from "@devlooped/plotdown";

const figure = render(source, {document, allowRemote: false, baseUrl}); // sync; throws PlotdownError {path, message}
const figure2 = await renderAsync(source, {allowRemote: ["https://data.example.com"], fetch}); // loads data URLs first
```

`render` is synchronous and refuses a block with a data URL (even when remote data is allowed) with an error that points to `renderAsync`, or to `resolveRemoteData`, which returns a copy of the block with the remote data inlined. `toPlotOptions` returns the options of `Plot.plot()` for hosts that call Plot themselves.

*plotdown is not affiliated with Observable, Inc. Observable Plot is © Observable, Inc., ISC license.*