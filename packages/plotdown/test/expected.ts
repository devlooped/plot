// The hand-written Plot.plot() options each fixture of spec/fixtures stands for.
// Each function gets the parsed fixture and converts its data by hand (dates
// with new Date, CSV/TSV with d3-dsv's autoType), independently of plotdown.
import * as Plot from "@observablehq/plot";
import {autoType, csvParse, tsvParse} from "d3-dsv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture = {data: Record<string, any>};
type Expected = (fixture: Fixture) => Plot.PlotOptions;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dates(rows: any[], ...fields: string[]): any[] {
  return rows.map((row) => ({...row, ...Object.fromEntries(fields.map((field) => [field, new Date(row[field])]))}));
}

const xy = {x: "flipper_length_mm", y: "body_mass_g"};

export const expected: Record<string, Expected> = {
  "area-stacked": ({data}) => ({
    title: "Unemployed workers by industry",
    y: {grid: true, label: "Unemployed (thousands)"},
    color: {legend: true},
    marks: [Plot.areaY(dates(data.jobs, "date"), Plot.stackY({order: "appearance"}, {x: "date", y: "unemployed", fill: "industry"})), Plot.ruleY([0])]
  }),

  "arrow-change": ({data}) => ({
    x: {type: "log", label: "Population (millions)"},
    y: {label: "Inequality", grid: true},
    marks: [
      Plot.arrow(data.metros, {x1: "POP_1980", y1: "R90_10_1980", x2: "POP_2015", y2: "R90_10_2015", bend: true, stroke: "steelblue"}),
      Plot.text(data.metros, {x: "POP_2015", y: "R90_10_2015", text: "Metro", dy: -8, fontSize: 9})
    ]
  }),

  "auto-bar": ({data}) => ({
    marks: [Plot.auto(data.penguins, {x: "species", y: {value: "body_mass_g", reduce: "mean"}, mark: "bar"})]
  }),

  "axis-custom": ({data}) => ({
    marginRight: 50,
    marks: [
      Plot.gridY({strokeDasharray: "2,3", strokeOpacity: 0.3}),
      Plot.axisY({anchor: "right", label: "Close ($)", tickFormat: "$.0f"}),
      Plot.axisX({ticks: "week", tickFormat: "%b %d", label: null}),
      Plot.lineY(dates(data.aapl, "date"), {x: "date", y: "close"})
    ]
  }),

  "bar-group": ({data}) => ({
    color: {legend: true},
    marks: [Plot.barY(data.penguins, Plot.groupX({y: "count"}, Plot.filter("sex", {x: "island", fill: "species", sort: {x: "-y"}}))), Plot.ruleY([0])]
  }),

  bollinger: ({data}) => {
    const aapl = dates(data.aapl, "date");
    return {
      y: {grid: true},
      marks: [Plot.bollingerY(aapl, {x: "date", y: "close", n: 5, k: 2, fill: "steelblue"}), Plot.lineY(aapl, {x: "date", y: "close", strokeWidth: 1})]
    };
  },

  "box-tsv": ({data}) => ({
    y: {grid: true},
    marks: [Plot.boxY(tsvParse(data.penguins.tsv, autoType), {x: "species", y: "body_mass_g"})]
  }),

  "cell-heatmap": ({data}) => ({
    padding: 0,
    x: {label: "Episode", axis: "top"},
    y: {label: "Season"},
    color: {type: "linear", scheme: "PiYG"},
    marks: [
      Plot.cell(data.ratings, {x: "episode", y: "season", fill: "rating", inset: 0.5}),
      Plot.text(data.ratings, {x: "episode", y: "season", text: "rating", fill: "black", title: "title"})
    ]
  }),

  contour: ({data}) => ({
    color: {type: "linear", scheme: "viridis"},
    marks: [
      Plot.contour(data.grid, {x: "x", y: "y", fill: "v", stroke: "white", thresholds: 6, blur: 1}),
      Plot.dot(data.grid, {x: "x", y: "y", r: 1.5, fill: "black"})
    ]
  }),

  "delaunay-voronoi": ({data}) => ({
    marks: [
      Plot.voronoi(data.penguins, {...xy, fill: "species", fillOpacity: 0.2, stroke: "white"}),
      Plot.hull(data.penguins, {...xy, stroke: "species", z: "species"}),
      Plot.dot(data.penguins, {...xy, fill: "species"})
    ]
  }),

  density: ({data}) => ({
    inset: 10,
    marks: [Plot.density(data.penguins, {...xy, stroke: "steelblue", bandwidth: 15, thresholds: 4}), Plot.dot(data.penguins, {...xy, r: 2})]
  }),

  "difference-shift": ({data}) => ({
    y: {grid: true, label: "Change over 5 days"},
    marks: [Plot.differenceY(dates(data.aapl, "date"), Plot.shiftX("5 days", {x: "date", y: "close", positiveFill: "green", negativeFill: "red"}))]
  }),

  "dot-scatter": ({data}) => ({
    grid: true,
    symbol: {legend: true},
    marks: [
      Plot.dot(data.penguins, Plot.shuffle({...xy, stroke: "species", symbol: "species", tip: true, seed: 1})),
      Plot.crosshair(data.penguins, xy)
    ]
  }),

  "dot-dodge": ({data}) => ({
    height: 160,
    marks: [Plot.dot(data.cars, Plot.dodgeY({anchor: "middle", padding: 1}, Plot.reverse({x: "weight", title: "name", fill: "currentColor"})))]
  }),

  "frame-facet": ({data}) => ({
    facet: {data: data.penguins, x: "sex", label: null},
    marks: [Plot.frame(), Plot.dot(data.penguins, {...xy, fill: "species", r: 3})]
  }),

  "geo-orthographic": ({data}) => ({
    projection: {type: "orthographic", rotate: [20, -20]},
    marks: [
      Plot.sphere({fill: "aliceblue"}),
      Plot.graticule(),
      Plot.geo(data.shapes, {fill: "tan", stroke: "brown"}),
      Plot.dot(data.shapes, Plot.centroid({r: 3, fill: "black"}))
    ]
  }),

  hexbin: ({data}) => ({
    color: {scheme: "blues"},
    marks: [Plot.hexgrid({binWidth: 20}), Plot.dot(data.penguins, Plot.hexbin({r: "count", fill: "count"}, {...xy, binWidth: 20}))]
  }),

  "image-logos": ({data}) => ({
    y: {domain: [0, 6], grid: true},
    marks: [Plot.image(data.logos, {x: "name", y: "value", src: "logo", width: 24})]
  }),

  "line-window": ({data}) => {
    const aapl = dates(data.aapl, "date");
    return {
      y: {grid: true},
      marks: [
        Plot.lineY(aapl, {x: "date", y: "close", strokeOpacity: 0.3}),
        Plot.lineY(aapl, Plot.windowY({k: 5, reduce: "mean"}, Plot.sort("date", {x: "date", y: "close", stroke: "steelblue"}))),
        Plot.dot(aapl, Plot.select({y: "max"}, {x: "date", y: "close", fill: "red"})),
        Plot.tip(aapl, Plot.pointerX({x: "date", y: "close"}))
      ]
    };
  },

  "line-normalize": ({data}) => {
    const stocks = dates(data.stocks, "date");
    return {
      y: {type: "log", grid: true, label: "Change in price (×)"},
      marks: [
        Plot.ruleY([1]),
        Plot.lineY(stocks, Plot.normalizeY("first", {x: "date", y: "close", stroke: "symbol"})),
        Plot.text(stocks, Plot.selectLast(Plot.normalizeY("first", {x: "date", y: "close", z: "symbol", text: "symbol", textAnchor: "start", dx: 3})))
      ]
    };
  },

  "line-cumsum": ({data}) => {
    const sales = dates(data.sales, "date");
    return {
      y: {grid: true, label: "Units sold (cumulative)"},
      marks: [Plot.lineY(sales, Plot.mapY("cumsum", {x: "date", y: "units"})), Plot.dot(sales, Plot.map({y: "cumsum"}, {x: "date", y: "units"}))]
    };
  },

  "linear-regression": ({data}) => ({
    grid: true,
    marks: [Plot.dot(data.penguins, {...xy, fill: "species", fillOpacity: 0.5}), Plot.linearRegressionY(data.penguins, {...xy, stroke: "species"})]
  }),

  "link-arcs": ({data}) => ({
    inset: 20,
    marks: [
      Plot.link(data.edges, {x1: "x1", y1: "y1", x2: "x2", y2: "y2", stroke: "kind", curve: "bump-x", markerEnd: "arrow", href: "url", target: "_blank"}),
      Plot.text(data.edges, {x: "x1", y: "y1", text: "source", dy: -10})
    ]
  }),

  raster: ({data}) => ({
    color: {scheme: "turbo"},
    marks: [Plot.raster(data.grid, {x: "x", y: "y", fill: "v", interpolate: "nearest", pixelSize: 4})]
  }),

  "rect-bin-csv": ({data}) => ({
    title: "Penguin body mass",
    color: {legend: true},
    y: {grid: true},
    marks: [Plot.rectY(csvParse(data.penguins.csv, autoType), Plot.binX<Plot.RectYOptions>({y: "count"}, {x: "body_mass_g", fill: "species", thresholds: 8})), Plot.ruleY([0])]
  }),

  "rule-tick": ({data}) => ({
    marginLeft: 70,
    marks: [Plot.ruleX([4000], {stroke: "red", strokeDasharray: "4,2"}), Plot.tickX(data.penguins, {x: "body_mass_g", y: "species", stroke: "sex", strokeWidth: 2})]
  }),

  tree: () => ({
    axis: null,
    height: 220,
    margin: 10,
    marginLeft: 40,
    marginRight: 110,
    marks: [
      Plot.tree(
        ["flare/analytics/cluster", "flare/analytics/graph", "flare/analytics/optimization", "flare/animate/Easing", "flare/animate/Tween", "flare/data/DataField", "flare/data/DataSchema", "flare/display/DirtySprite"],
        {textStroke: "white"}
      )
    ]
  }),

  "tree-transforms": ({data}) => ({
    axis: null,
    height: 220,
    marginLeft: 40,
    marginRight: 110,
    marks: [
      Plot.link(data.paths, Plot.treeLink({stroke: "#999"})),
      Plot.dot(data.paths, Plot.treeNode({fill: "node:internal"})),
      Plot.text(data.paths, Plot.treeNode({text: "node:name", dx: 6, textAnchor: "start", treeAnchor: "left"}))
    ]
  }),

  "vector-wind": ({data}) => ({
    inset: 10,
    marks: [Plot.vector(data.wind, {x: "lon", y: "lat", rotate: "dir", length: "speed", stroke: "speed"})]
  }),

  waffle: ({data}) => ({
    marks: [Plot.waffleY(data.fruit, {x: "fruit", y: "count", fill: "fruit", unit: 1, gap: 2}), Plot.ruleY([0])]
  })
};