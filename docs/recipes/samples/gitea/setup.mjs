// Fills a fresh Gitea or Forgejo with the sample: a repository whose README and
// an issue (body and a comment) hold the plot blocks of ../content.md.
//   node setup.mjs <base-url> <user> <password>
import fs from "node:fs";
const [base = "http://127.0.0.1:3999", user = "sample", password = "Sample-pass-123"] = process.argv.slice(2);
const content = fs.readFileSync(new URL("../content.md", import.meta.url), "utf8");
const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
async function api(method, path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {method, headers: {Authorization: auth, "Content-Type": "application/json"}, body: body && JSON.stringify(body)});
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
await api("POST", "/user/repos", {name: "charts", auto_init: false});
await api("POST", `/repos/${user}/charts/contents/README.md`, {content: Buffer.from(`# Charts\n\n${content}`).toString("base64"), message: "Add charts"});
const issue = await api("POST", `/repos/${user}/charts/issues`, {title: "A chart in an issue", body: content});
await api("POST", `/repos/${user}/charts/issues/${issue.number}/comments`, {body: "And in a comment:\n\n" + content.split("A line in")[0]});
console.log(`${base}/${user}/charts  ${base}/${user}/charts/issues/${issue.number}`);
