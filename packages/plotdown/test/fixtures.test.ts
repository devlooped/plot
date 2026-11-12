import fs from "node:fs";
import path from "node:path";
import * as Plot from "@observablehq/plot";
import {Ajv2020} from "ajv/dist/2020.js";
import {describe, expect, it} from "vitest";
import {render, validate} from "../src/index.js";
import {expected} from "./expected.js";
import {createDocument, fixtureNames, markup, readFixture, specDir} from "./helpers.js";

const schema = JSON.parse(fs.readFileSync(path.join(specDir, "plot.schema.json"), "utf8"));
const ajv = new Ajv2020({allErrors: true, strict: false, validateFormats: false});
const validateSchema = ajv.compile(schema);
const names = fixtureNames();

describe("fixtures", () => {
  it("are thirty, each with a hand-written Plot call", () => {
    expect(names).toHaveLength(30);
    expect(Object.keys(expected).sort()).toEqual(names);
  });

  it("cover every mark family and every transform family", () => {
    const marks = new Set<string>();
    const transforms = new Set<string>();
    for (const name of names) {
      const spec = JSON.parse(readFixture(name));
      for (const mark of spec.marks) {
        marks.add(mark.mark);
        for (const t of mark.transform ?? []) transforms.add(Object.keys(t)[0]!);
      }
    }
    // One representative per declaration file of Plot's src/marks and src/transforms.
    const markFamilies = {
      area: ["area", "areaX", "areaY"], arrow: ["arrow"], auto: ["auto"], axis: ["axisX", "axisY", "gridX", "gridY"], bar: ["barX", "barY"],
      bollinger: ["bollingerX", "bollingerY"], box: ["boxX", "boxY"], cell: ["cell", "cellX", "cellY"], contour: ["contour"],
      crosshair: ["crosshair", "crosshairX", "crosshairY"], delaunay: ["voronoi", "hull", "delaunayLink", "delaunayMesh", "voronoiMesh"],
      density: ["density"], difference: ["differenceX", "differenceY"], dot: ["dot", "dotX", "dotY", "circle", "hexagon"], frame: ["frame"],
      geo: ["geo", "sphere", "graticule"], hexgrid: ["hexgrid"], image: ["image"], line: ["line", "lineX", "lineY"],
      linearRegression: ["linearRegressionX", "linearRegressionY"], link: ["link"], raster: ["raster"], rect: ["rect", "rectX", "rectY"],
      rule: ["ruleX", "ruleY"], text: ["text", "textX", "textY"], tick: ["tickX", "tickY"], tip: ["tip"], tree: ["tree", "cluster"],
      vector: ["vector", "vectorX", "vectorY", "spike"], waffle: ["waffleX", "waffleY"]
    };
    const transformFamilies = {
      basic: ["filter", "sort", "reverse", "shuffle"], bin: ["bin", "binX", "binY"], centroid: ["centroid", "geoCentroid"], dodge: ["dodgeX", "dodgeY"],
      group: ["group", "groupX", "groupY", "groupZ"], hexbin: ["hexbin"], map: ["map", "mapX", "mapY"], normalize: ["normalizeX", "normalizeY"],
      select: ["select", "selectFirst", "selectLast", "selectMinX", "selectMinY", "selectMaxX", "selectMaxY"], shift: ["shiftX", "shiftY"],
      stack: ["stackX", "stackX1", "stackX2", "stackY", "stackY1", "stackY2"], tree: ["treeNode", "treeLink"], window: ["windowX", "windowY"],
      pointer: ["pointer", "pointerX", "pointerY"]
    };
    const missingMarks = Object.entries(markFamilies).filter(([, members]) => !members.some((m) => marks.has(m))).map(([f]) => f);
    const missingTransforms = Object.entries(transformFamilies).filter(([, members]) => !members.some((t) => transforms.has(t))).map(([f]) => f);
    expect(missingMarks).toEqual([]);
    expect(missingTransforms).toEqual([]);
    expect(transforms.has("filter") && transforms.has("sort") && transforms.has("reverse") && transforms.has("shuffle")).toBe(true);
  });

  for (const name of names) {
    describe(name, () => {
      const text = readFixture(name);

      it("validates against plot.schema.json", () => {
        const ok = validateSchema(JSON.parse(text));
        expect(validateSchema.errors ?? [], JSON.stringify(validateSchema.errors, null, 2)).toEqual([]);
        expect(ok).toBe(true);
      });

      it("passes validate()", () => {
        expect(() => validate(text)).not.toThrow();
      });

      it("renders the same SVG as the hand-written Plot call", () => {
        const document = createDocument();
        const actual = render(text, {document});
        const options = expected[name]!(JSON.parse(text));
        const reference = Plot.plot({...options, document});
        expect(markup(actual)).toEqual(markup(reference));
        expect(actual.querySelector("svg") ?? actual.localName).toBeTruthy();
      });
    });
  }
});
