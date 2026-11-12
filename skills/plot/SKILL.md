---
name: plot
description: Write charts in Markdown as fenced plot blocks (plotdown), which hold the options of Observable Plot's Plot.plot() as strict JSON with marks and transforms written as data. Use whenever you are asked for a chart, graph, plot, histogram or other data visualization in Markdown (a README, docs, an issue, a pull request, notes or a chat answer), or when you write, convert from JavaScript, or fix a plot, oplot or observable-plot block.
---

# Charts as `plot` blocks

A `plot` block is a fenced code block of Markdown that holds **one strict JSON object**: the options of Observable Plot's `Plot.plot()`, with each mark and transform written as data instead of a function call. A renderer (plotdown) draws it as a chart. It evaluates nothing, so anything that is not plain data is an error, and so is every key it does not know.

<!-- generated:versions -->
Spec 0.1 · Observable Plot 0.6.19. Generated parts come from [the spec](references/spec.md).
<!-- /generated:versions -->

## Rules

1. **Fence**: open with ` ```plot ` (canonical); ` ```oplot ` and ` ```observable-plot ` mean the same and are not colored as gnuplot by GitHub. Put nothing but the JSON inside.
2. **Strict JSON**: double quotes, no comments, no trailing commas, no `NaN`, `Infinity`, `undefined`, functions, `new Date()` or `d3.*`. Do not wrap it in `Plot.plot(…)`.
3. **Top level**: `"marks"` (required, an array), `"data"` (named datasets), and the options of `Plot.plot()` with their own names: `width`, `height`, `margin…`, `title`, `subtitle`, `caption`, `grid`, the scales `x`, `y`, `fx`, `fy`, `color`, `r`, `opacity`, `symbol`, `length`, `projection`, `facet`, `style`. An unknown key anywhere is an error.
4. **A mark** is `{"mark": "<name>", "data": …, …options, "transform": […]}`. `Plot.dot(rows, {x: "a", y: "b"})` becomes `{"mark": "dot", "data": rows, "x": "a", "y": "b"}`. Mark names are exact and case-sensitive: `barY`, not `bar` or `Plot.barY`.
5. **Channels** (`x`, `y`, `fill`, `stroke`, `r`, `text`, `title`, `fx`, …): a string is a **field name** of each row; for `fill` and `stroke` a CSS color string (`"steelblue"`, `"#e45"`) is a constant; a number, boolean or `null` is a constant; an array gives one value per row; `{"value": "field", "label": "Axis title"}` adds options. Field names are matched exactly (`"a.b"` is the key `a.b`, not a path).
6. **Transforms**: `"transform": [{"<name>": <first argument>}, …]`, an **array** of objects with **exactly one key**. The second argument of the JavaScript call (the options) is the mark itself. Entries apply **in order, the first is the innermost call**: `Plot.groupX({y: "count"}, Plot.filter("sex", opts))` is `"transform": [{"filter": "sex"}, {"groupX": {"y": "count"}}]`.
7. **Transform options on the mark** (`thresholds`, `interval`, `domain`, `cumulative` for bin; `binWidth` for hexbin; `z` for select; `seed` for shuffle) are valid only when the mark lists that transform.
8. **Data** of a mark is one of: inline rows `[{"x": 1, "y": 2}, …]`; an array of values `[0]`; CSV text `{"csv": "x,y\n1,2\n"}` or TSV `{"tsv": "…"}` (numbers, `true`/`false`, empty → `null` are typed); the **name** of a dataset of the top-level `"data"` object; a GeoJSON object. `frame`, `sphere`, `graticule` and `hexgrid` take no `data` key at all. Remote data (`{"url": …}`) is off by default: put the data inline.
9. **Dates** are ISO 8601 strings: `"2024-03-01"`, `"2024-03"`, `"2024-03-01T14:30Z"`. A column (or array) whose every non-null value is such a string becomes dates. A bare year `"2024"` is **not** a date: write years as numbers (with `"x": {"tickFormat": "d"}` so 2024 is not shown as 2,024) or as `"2024-01-01"`.
10. **Names stay strings**: reducers (`"count"`, `"sum"`, `"mean"`), curves (`"catmull-rom"`), schemes (`"blues"`, `"tableau10"`), intervals (`"month"`, `"5 days"`), projections (`"equal-earth"`), formats (`"tickFormat": ".0%"`, `"%b %Y"`).

## From JavaScript: the usual mistakes

| You might write | Write instead |
| --- | --- |
| `Plot.plot({marks: [Plot.barY(data, {x: "a", y: "b"})]})` | `{"marks": [{"mark": "barY", "data": …, "x": "a", "y": "b"}]}` |
| `"binX": {"y": "count"}` on the mark, or `"transform": {"binX": …}` | `"transform": [{"binX": {"y": "count"}}]` |
| `{"type": "binX", "y": "count"}` | `{"binX": {"y": "count"}}` |
| `Plot.binX({y: "count"}, {x: "w", thresholds: 20})` | `"x": "w", "thresholds": 20, "transform": [{"binX": {"y": "count"}}]` |
| `x: d => d.date` or `"x": "d => d.date"` | `"x": "date"` (compute anything else in the data, or use a transform) |
| `y: d => d.value / 1000`, `fill: d => d.x > 0 ? "red" : "blue"` | Put the computed column in the data rows |
| `"data": {"values": […]}` (Vega-Lite habit), `"encoding"` | `"data": […]` on the mark; channels on the mark |
| `Plot.ruleY([0])` | `{"mark": "ruleY", "data": [0]}` |
| `new Date("2024-03-01")`, `1709251200000` for a date | `"2024-03-01"` |
| `tickFormat: d3.format(".0%")` | `"tickFormat": ".0%"` (or `"percent": true` on the scale) |
| `scheme: d3.schemeTableau10`, `interval: d3.utcMonth` | `"scheme": "tableau10"`, `"interval": "month"` |
| `title: html\`<b>…</b>\`` | `"title": "…"` (plain text) |
| `tip: {format: {x: d3.utcFormat("%b %d")}}`, or `"format"` on the mark | `"tip": {"format": {"x": "%b %d", "y": ",.0f"}}`: tip options go inside `"tip"` |
| `"fill": "red"` meaning a field named red | Rename the field: color strings are constants |
| A pie or donut chart | Plot has none: a `barX` stacked to 100 % (see below), a `waffleY`, or a sorted `barX` |
| `"facet": {"x": "group"}` with no `"data"` | `"fx": "group"` on the mark, or `"facet": {"data": "<dataset name>", "x": "group"}` |

## Before you emit a block

- It parses as JSON; `"marks"` is an array; every mark has `"mark"` and a name from the list below.
- Every field name you use exists in the data, with the same case.
- Every dataset name you use is a key of the top-level `"data"`.
- Every `"transform"` is an array of one-key objects, in the order the JavaScript calls nest from the inside out.
- Categories on an axis are sorted alphabetically: keep their order with `"x": {"domain": ["Mon", "Tue", "Wed"]}`, or sort by value with `"sort": {"x": "-y"}` on the mark.
- Bars, areas and histograms usually end with `{"mark": "ruleY", "data": [0]}` (or `ruleX` for horizontal ones).
- `"tip": true` shows values on hover in a browser; it is harmless in a static image.
- If a tool can run JavaScript, `validate(text)` of `@devlooped/plotdown` throws a `PlotdownError` whose `path` (`$.marks[1].transform[0].binX.y`) names the problem; the JSON Schema is [references/plot.schema.json](references/plot.schema.json).

## Examples

**Bar chart**, sorted, with labels:

```plot
{
  "data": {"langs": [
    {"language": "Python", "users": 51}, {"language": "JavaScript", "users": 62},
    {"language": "TypeScript", "users": 38}, {"language": "Rust", "users": 13}, {"language": "Go", "users": 14}
  ]},
  "y": {"grid": true, "label": "Users (%)"},
  "marks": [
    {"mark": "barY", "data": "langs", "x": "language", "y": "users", "fill": "steelblue", "sort": {"x": "-y"}},
    {"mark": "text", "data": "langs", "x": "language", "y": "users", "text": "users", "dy": -6},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

**Lines over time**, one per series, with a legend and a tip:

```plot
{
  "data": {"sales": {"csv": "month,region,revenue\n2024-01,North,120\n2024-02,North,135\n2024-03,North,150\n2024-04,North,160\n2024-01,South,90\n2024-02,South,110\n2024-03,South,105\n2024-04,South,130\n"}},
  "color": {"legend": true},
  "x": {"label": "Month"},
  "y": {"grid": true, "label": "Revenue (k$)"},
  "marks": [
    {"mark": "lineY", "data": "sales", "x": "month", "y": "revenue", "stroke": "region", "marker": "dot", "tip": true},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

**Scatter plot** with color by group and a regression line:

```plot
{
  "data": {"cars": [
    {"weight": 2.6, "mpg": 31, "origin": "Japan"}, {"weight": 3.4, "mpg": 22, "origin": "USA"},
    {"weight": 2.2, "mpg": 35, "origin": "Japan"}, {"weight": 4.1, "mpg": 17, "origin": "USA"},
    {"weight": 3.0, "mpg": 26, "origin": "Europe"}, {"weight": 2.8, "mpg": 29, "origin": "Europe"},
    {"weight": 3.7, "mpg": 19, "origin": "USA"}, {"weight": 2.4, "mpg": 33, "origin": "Japan"}
  ]},
  "grid": true,
  "color": {"legend": true},
  "x": {"label": "Weight (1000 lb)"},
  "y": {"label": "Miles per gallon"},
  "marks": [
    {"mark": "linearRegressionY", "data": "cars", "x": "weight", "y": "mpg", "stroke": "gray"},
    {"mark": "dot", "data": "cars", "x": "weight", "y": "mpg", "fill": "origin", "r": 5, "tip": true}
  ]
}
```

**Histogram** (the bin transform counts rows; `thresholds` sits on the mark):

```plot
{
  "data": {"times": {"csv": "ms\n120\n135\n150\n180\n95\n240\n160\n170\n130\n145\n310\n155\n140\n125\n200\n"}},
  "y": {"grid": true},
  "marks": [
    {"mark": "rectY", "data": "times", "x": "ms", "thresholds": 8, "fill": "teal", "transform": [{"binX": {"y": "count"}}]},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

**Grouped bars**, one group per quarter (the `fx` channel facets them):

```plot
{
  "data": {"q": [
    {"quarter": "Q1", "product": "A", "units": 30}, {"quarter": "Q1", "product": "B", "units": 22},
    {"quarter": "Q2", "product": "A", "units": 34}, {"quarter": "Q2", "product": "B", "units": 28},
    {"quarter": "Q3", "product": "A", "units": 25}, {"quarter": "Q3", "product": "B", "units": 35}
  ]},
  "color": {"legend": true},
  "x": {"axis": null},
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": "q", "fx": "quarter", "x": "product", "y": "units", "fill": "product"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

**Shares of a whole** (instead of a pie): one bar stacked to 100 %:

```plot
{
  "data": {"share": [{"browser": "Chrome", "pct": 65}, {"browser": "Safari", "pct": 19}, {"browser": "Edge", "pct": 5}, {"browser": "Other", "pct": 11}]},
  "height": 120,
  "x": {"percent": true, "label": "Share (%)"},
  "color": {"legend": true},
  "marks": [
    {"mark": "barX", "data": "share", "x": "pct", "fill": "browser", "transform": [{"stackX": {"offset": "normalize"}}]},
    {"mark": "text", "data": "share", "x": "pct", "text": "browser", "fill": "white", "transform": [{"stackX": {"offset": "normalize"}}]}
  ]
}
```

**Heatmap** with a color scheme:

```plot
{
  "data": {"load": [
    {"day": "Mon", "hour": "09", "requests": 120}, {"day": "Mon", "hour": "12", "requests": 300}, {"day": "Mon", "hour": "18", "requests": 180},
    {"day": "Tue", "hour": "09", "requests": 140}, {"day": "Tue", "hour": "12", "requests": 280}, {"day": "Tue", "hour": "18", "requests": 220},
    {"day": "Wed", "hour": "09", "requests": 100}, {"day": "Wed", "hour": "12", "requests": 350}, {"day": "Wed", "hour": "18", "requests": 160}
  ]},
  "color": {"scheme": "blues", "legend": true, "label": "Requests"},
  "x": {"label": "Hour"},
  "marks": [
    {"mark": "cell", "data": "load", "x": "hour", "y": "day", "fill": "requests", "inset": 1},
    {"mark": "text", "data": "load", "x": "hour", "y": "day", "text": "requests", "fill": "black"}
  ]
}
```

**Running total and moving average** (map and window transforms):

```plot
{
  "data": {"daily": [
    {"date": "2024-05-01", "signups": 12}, {"date": "2024-05-02", "signups": 18}, {"date": "2024-05-03", "signups": 9},
    {"date": "2024-05-04", "signups": 22}, {"date": "2024-05-05", "signups": 15}, {"date": "2024-05-06", "signups": 30}
  ]},
  "y": {"grid": true},
  "marks": [
    {"mark": "lineY", "data": "daily", "x": "date", "y": "signups", "stroke": "orange", "transform": [{"mapY": "cumsum"}]},
    {"mark": "lineY", "data": "daily", "x": "date", "y": "signups", "stroke": "steelblue", "transform": [{"windowY": {"k": 3, "reduce": "mean"}}]},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

## Marks, transforms and names at a glance

<!-- generated:glance -->
**Marks** (the value of `"mark"`):

- area: `area`, `areaX`, `areaY`
- arrow: `arrow`
- auto: `auto`
- axis and grid: `axisX`, `axisY`, `axisFx`, `axisFy`, `gridX`, `gridY`, `gridFx`, `gridFy`
- bar: `barX`, `barY`
- bollinger: `bollingerX`, `bollingerY`
- box: `boxX`, `boxY`
- cell: `cell`, `cellX`, `cellY`
- contour: `contour`
- crosshair: `crosshair`, `crosshairX`, `crosshairY`
- delaunay: `delaunayLink`, `delaunayMesh`, `hull`, `voronoi`, `voronoiMesh`
- density: `density`
- difference: `differenceX`, `differenceY`
- dot: `dot`, `dotX`, `dotY`, `circle`, `hexagon`
- frame: `frame`
- geo: `geo`, `sphere`, `graticule`
- hexgrid: `hexgrid`
- image: `image`
- line: `line`, `lineX`, `lineY`
- linear regression: `linearRegressionX`, `linearRegressionY`
- link: `link`
- raster: `raster`
- rect: `rect`, `rectX`, `rectY`
- rule: `ruleX`, `ruleY`
- text: `text`, `textX`, `textY`
- tick: `tickX`, `tickY`
- tip: `tip`
- tree: `tree`, `cluster`
- vector: `vector`, `vectorX`, `vectorY`, `spike`
- waffle: `waffleX`, `waffleY`

Without data: `frame`, `sphere`, `graticule`, `hexgrid`. Data optional: `axisX`, `axisY`, `axisFx`, `axisFy`, `gridX`, `gridY`, `gridFx`, `gridFy`, `contour`, `raster`.

**Transforms** (the key of each entry of `"transform"`):

- bin: `bin`, `binX`, `binY`
- group: `group`, `groupX`, `groupY`, `groupZ`
- hexbin: `hexbin`
- map: `map`, `mapX`, `mapY`
- normalize: `normalizeX`, `normalizeY`
- window: `windowX`, `windowY`
- stack: `stackX`, `stackX1`, `stackX2`, `stackY`, `stackY1`, `stackY2`
- dodge: `dodgeX`, `dodgeY`
- select: `select`, `selectFirst`, `selectLast`, `selectMinX`, `selectMinY`, `selectMaxX`, `selectMaxY`
- shift: `shiftX`, `shiftY`
- basic: `filter`, `sort`, `reverse`, `shuffle`
- centroid: `centroid`, `geoCentroid`
- tree: `treeNode`, `treeLink`
- pointer: `pointer`, `pointerX`, `pointerY`

**Reducers**: `first`, `last`, `identity`, `count`, `distinct`, `sum`, `proportion`, `proportion-facet`, `deviation`, `min`, `min-index`, `max`, `max-index`, `mean`, `median`, `variance`, `mode`, `"p25"`…`"p99"`. **Window reducers**: `difference`, `ratio`, `first`, `last`, `deviation`, `sum`, `min`, `max`, `mean`, `median`, `variance`, `mode`.

**Curves**: `basis`, `basis-closed`, `basis-open`, `bundle`, `bump-x`, `bump-y`, `cardinal`, `cardinal-closed`, `cardinal-open`, `catmull-rom`, `catmull-rom-closed`, `catmull-rom-open`, `linear`, `linear-closed`, `monotone-x`, `monotone-y`, `natural`, `step`, `step-after`, `step-before`. **Symbols**: `asterisk`, `circle`, `cross`, `diamond`, `diamond2`, `hexagon`, `plus`, `square`, `square2`, `star`, `times`, `triangle`, `triangle2`, `wye`.
<!-- /generated:glance -->

## More

- [references/catalog.md](references/catalog.md): every option of every mark, scale, projection and transform, color schemes and formats.
- [references/examples.md](references/examples.md): 30 complete blocks covering every mark and transform family.
- [references/spec.md](references/spec.md): the full format: data forms, CSV typing, date rules, security, errors and limits.
- [references/plot.schema.json](references/plot.schema.json): the JSON Schema (2020-12) of a block.
