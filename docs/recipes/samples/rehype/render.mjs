// node render.mjs <out-dir>: ../content.md, plus a block with remote data served
// on localhost, to index.html with unified, remark and rehype.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {unified} from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypePlotdown from "@devlooped/plotdown/rehype";

const out = process.argv[2] ?? ".";
const server = http.createServer((request, response) => response.end("x,y\n1,2\n2,5\n3,3\n"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const source = fs.readFileSync(new URL("../content.md", import.meta.url), "utf8") +
  `\nRemote data, loaded at build time:\n\n\`\`\`plot\n{"marks": [{"mark": "lineY", "data": {"url": "${origin}/data.csv"}, "x": "x", "y": "y"}]}\n\`\`\`\n`;

const file = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypePlotdown, {allowRemote: [origin]})
  .use(rehypeStringify)
  .process(source);
server.close();
for (const message of file.messages) console.warn(`warning: ${message.reason}`);

fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, "index.html"), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>rehype</title></head><body>${file}</body></html>`);
console.log(`wrote ${out}/index.html`);
