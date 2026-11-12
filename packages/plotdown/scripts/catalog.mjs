// The hand-written part of the plotdown contract: which Plot marks and
// transforms a block may use, and how each one is called. The option keys of
// each mark are read from Plot's own type declarations by generate.mjs.

// How a mark is called:
//   "data"     Plot.mark(data, options); data defaults to null
//   "optional" Plot.mark(data, options), or Plot.mark(options) when there is no data
//   "none"     Plot.mark(options); a "data" key is an error
export const MARKS = {
  area: "data", areaX: "data", areaY: "data",
  arrow: "data",
  auto: "data",
  axisX: "optional", axisY: "optional", axisFx: "optional", axisFy: "optional",
  gridX: "optional", gridY: "optional", gridFx: "optional", gridFy: "optional",
  barX: "data", barY: "data",
  bollingerX: "data", bollingerY: "data",
  boxX: "data", boxY: "data",
  cell: "data", cellX: "data", cellY: "data",
  contour: "optional",
  crosshair: "data", crosshairX: "data", crosshairY: "data",
  delaunayLink: "data", delaunayMesh: "data", hull: "data", voronoi: "data", voronoiMesh: "data",
  density: "data",
  differenceX: "data", differenceY: "data",
  dot: "data", dotX: "data", dotY: "data", circle: "data", hexagon: "data",
  frame: "none",
  geo: "data", sphere: "none", graticule: "none",
  hexgrid: "none",
  image: "data",
  line: "data", lineX: "data", lineY: "data",
  linearRegressionX: "data", linearRegressionY: "data",
  link: "data",
  raster: "optional",
  rect: "data", rectX: "data", rectY: "data",
  ruleX: "data", ruleY: "data",
  text: "data", textX: "data", textY: "data",
  tickX: "data", tickY: "data",
  tip: "data",
  tree: "data", cluster: "data",
  vector: "data", vectorX: "data", vectorY: "data", spike: "data",
  waffleX: "data", waffleY: "data"
};

// Mark options that take a function only, or that plotdown owns: never accepted.
export const EXCLUDED_MARK_KEYS = ["transform", "initializer", "render"];

// How a transform is written: { "<name>": <arg> } in a mark's "transform" array.
//   arg "outputs": arg is the outputs object (channel → reducer); Plot.t(arg, options)
//   arg "first":   arg is Plot's first argument (kind says what it holds); Plot.t(arg, options)
//   arg "merge":   arg is true or an object of the transform's own options; Plot.t({...options, ...arg})
// input: options the transform reads from the mark's options (allowed on the mark when the transform is present).
// outputOptions: non-channel keys allowed in the outputs object.
const BIN = {arg: "outputs", reducers: "bin", outputOptions: ["data", "filter", "sort", "reverse", "z", "cumulative", "domain", "thresholds", "interval"], input: ["cumulative", "domain", "thresholds", "interval"]};
const GROUP = {arg: "outputs", reducers: "group", outputOptions: ["data", "filter", "sort", "reverse", "z"], input: []};
const STACK = {arg: "first", kind: "stack", input: []};
const SELECT = {arg: "merge", input: ["z"]};
export const TRANSFORMS = {
  bin: {...BIN, family: "bin"}, binX: {...BIN, family: "bin"}, binY: {...BIN, family: "bin"},
  group: {...GROUP, family: "group"}, groupX: {...GROUP, family: "group"}, groupY: {...GROUP, family: "group"}, groupZ: {...GROUP, family: "group"},
  hexbin: {arg: "outputs", reducers: "group", outputOptions: [], input: ["binWidth"], family: "hexbin"},
  map: {arg: "outputs", reducers: "map", outputOptions: [], input: [], family: "map"},
  mapX: {arg: "first", kind: "map", input: [], family: "map"}, mapY: {arg: "first", kind: "map", input: [], family: "map"},
  normalizeX: {arg: "first", kind: "normalize", input: [], family: "normalize"}, normalizeY: {arg: "first", kind: "normalize", input: [], family: "normalize"},
  windowX: {arg: "first", kind: "window", input: [], family: "window"}, windowY: {arg: "first", kind: "window", input: [], family: "window"},
  stackX: {...STACK, family: "stack"}, stackX1: {...STACK, family: "stack"}, stackX2: {...STACK, family: "stack"},
  stackY: {...STACK, family: "stack"}, stackY1: {...STACK, family: "stack"}, stackY2: {...STACK, family: "stack"},
  dodgeX: {arg: "first", kind: "dodge", input: [], family: "dodge"}, dodgeY: {arg: "first", kind: "dodge", input: [], family: "dodge"},
  select: {arg: "first", kind: "selector", input: ["z"], family: "select"},
  selectFirst: {...SELECT, family: "select"}, selectLast: {...SELECT, family: "select"},
  selectMinX: {...SELECT, family: "select"}, selectMinY: {...SELECT, family: "select"},
  selectMaxX: {...SELECT, family: "select"}, selectMaxY: {...SELECT, family: "select"},
  shiftX: {arg: "first", kind: "interval", input: [], family: "shift"}, shiftY: {arg: "first", kind: "interval", input: [], family: "shift"},
  filter: {arg: "first", kind: "channel", input: [], family: "basic"},
  sort: {arg: "first", kind: "sort", input: [], family: "basic"},
  reverse: {arg: "merge", input: [], family: "basic"},
  shuffle: {arg: "merge", input: ["seed"], family: "basic"},
  centroid: {arg: "merge", input: ["geometry"], family: "centroid"}, geoCentroid: {arg: "merge", input: ["geometry"], family: "centroid"},
  treeNode: {arg: "merge", input: ["path", "delimiter", "treeAnchor"], family: "tree"}, treeLink: {arg: "merge", input: ["path", "delimiter", "treeAnchor"], family: "tree"},
  pointer: {arg: "merge", input: ["maxRadius", "px", "py"], family: "pointer"},
  pointerX: {arg: "merge", input: ["maxRadius", "px", "py"], family: "pointer"},
  pointerY: {arg: "merge", input: ["maxRadius", "px", "py"], family: "pointer"}
};

// Keys of a channel given as an object, e.g. {"value": "date", "label": "Date"}.
export const CHANNEL_OBJECT_KEYS = ["value", "label", "scale", "type", "optional", "interval", "thresholds", "domain", "cumulative", "reduce", "zero", "color"];

// Mark keys whose value is not a channel but an object of its own.
export const SPECIAL_MARK_KEYS = ["tip", "sort", "clip", "channels", "format"];

// Top-level text options that may hold any text (not checked for function-like strings).
export const FREE_TEXT_KEYS = ["title", "subtitle", "caption", "ariaLabel", "ariaDescription", "label"];
