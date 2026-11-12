// Builds sample.md into dist/index.html with marked and the plotdown extension.
// The charts are inline SVG made at build time (linkedom provides the document).
import fs from "node:fs";
import {Marked} from "marked";
import plotdown from "@devlooped/plotdown/marked";

const marked = new Marked(plotdown({onError: (error) => console.warn(`warning: ${error.path}: ${error.message}`)}));
const body = await marked.parse(fs.readFileSync("sample.md", "utf8"));
fs.mkdirSync("dist", {recursive: true});
fs.writeFileSync(
  "dist/index.html",
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>plotdown + marked</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  .plotdown-error pre { background: #f6f8fa; padding: .75rem; overflow: auto; }
  .plotdown-message { color: #b42318; font-size: .875rem; }
</style>
</head>
<body>
${body}</body>
</html>
`
);
console.log("wrote dist/index.html");
