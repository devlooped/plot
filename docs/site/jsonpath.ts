// The JSON path of a PlotdownError ("$.marks[0].transform[1].binX.y",
// "$.data[\"my set\"][3]") as the segments jsonc-parser takes.
import type {JSONPath} from "jsonc-parser";

/** "$.marks[0].transform[1]["a b"]" as segments. */
export function parsePath(path: string): JSONPath | undefined {
  if (!path.startsWith("$")) return undefined;
  const segments: JSONPath = [];
  let rest = path.slice(1);
  while (rest) {
    let match = /^\.([A-Za-z_$][\w$]*)/.exec(rest);
    if (match) {
      segments.push(match[1]!);
    } else if ((match = /^\[(\d+)\]/.exec(rest))) {
      segments.push(Number(match[1]));
    } else if ((match = /^\[("(?:[^"\\]|\\.)*")\]/.exec(rest))) {
      segments.push(JSON.parse(match[1]!) as string);
    } else {
      break;
    }
    rest = rest.slice(match[0].length);
  }
  return segments;
}
