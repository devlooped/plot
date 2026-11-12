# plotdown-mcp

An [MCP App](https://github.com/modelcontextprotocol/ext-apps) server that draws charts in the chat: Claude, ChatGPT, VS Code chat, Goose and the other MCP Apps hosts.

The model calls `render_plot` with a **plotdown block**, the options of [Observable Plot](https://observablehq.com/plot/)'s `Plot.plot()` as strict JSON, and the host shows the chart in a view that follows its theme and width, with a tab for the source and a button that copies the block as a Markdown ```` ```plot ```` fence.

```json
{
  "title": "Penguin body mass",
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```

The format is defined in [`spec/spec.md`](https://github.com/devlooped/plotdown/blob/main/spec/spec.md).

## Configuration

The server runs with Node 22.12 or later. It speaks stdio by default.

**Claude Desktop**: in `claude_desktop_config.json` (Settings › Developer › Edit Config):

```json
{
  "mcpServers": {
    "plotdown": {
      "command": "npx",
      "args": ["-y", "@devlooped/plotdown-mcp"]
    }
  }
}
```

**Claude Code**:

```sh
claude mcp add plotdown -- npx -y @devlooped/plotdown-mcp
```

**VS Code**: in `.vscode/mcp.json` (or with **MCP: Add Server…**):

```json
{
  "servers": {
    "plotdown": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@devlooped/plotdown-mcp"]
    }
  }
}
```

**Streamable HTTP**, for hosts that connect to a URL:

```sh
npx -y @devlooped/plotdown-mcp --http --port 3001    # http://127.0.0.1:3001/mcp
```

It binds `127.0.0.1` by default and then refuses requests whose `Host` header is not a local name. `--host 0.0.0.0` exposes it on the network, with no authentication: put it behind a proxy that adds some.

## What the server offers

| | Name | What it is |
| --- | --- | --- |
| Tool | `render_plot` | Takes `plot`: the block as a JSON object or as text (a ```` ```plot ```` fence around the text is fine). Validates it with the plotdown core, renders it once on the server (linkedom) to catch what only Plot rejects, and shows the chart. Read-only, no network. |
| Resource | `ui://plotdown/view.html` | The view: one self-contained HTML file (about 830 kB, 250 kB gzipped) with the plotdown core, Plot and d3 inside. It loads nothing from the network and remote data is off. |
| Resource | `plotdown://spec` | The complete format, as Markdown. |
| Resource | `plotdown://schema` | The JSON Schema (2020-12) of a block. |

The tool's description teaches the format in short; the two resources hold all of it.

**Errors.** An invalid block comes back as a tool error (`isError: true`) whose text names the JSON path of the bad value, so that the model can fix it and call again:

```text
Invalid plot block at $.marks[0].transform[0].binX.y: unknown reducer "average"
Fix the value at $.marks[0].transform[0].binX.y and call render_plot again. The format is in the resource plotdown://spec.
```

`structuredContent.error` holds `{path, message, line?, column?}`.

**Hosts without MCP Apps** (no `io.modelcontextprotocol/ui` extension in the client's capabilities) get a summary of the chart and the block as a Markdown fence, which any page or editor with plotdown renders. A static image will take this place once the standalone SVG renderer exists (`src/fallback.ts`).

## As a library

```ts
import {createServer, startHttpServer} from "@devlooped/plotdown-mcp";
import {serveStdio} from "@modelcontextprotocol/server/stdio";

serveStdio(() => createServer());                 // or:
const {url} = await startHttpServer({port: 3001});
```

## Development

```sh
pnpm build     # dist/view.html (esbuild), then the server (tsup) and its declarations
pnpm test      # vitest, with an in-memory MCP client; needs the build (it reads dist/view.html)
node dist/cli.js --http
```

plotdown is not affiliated with Observable, Inc.

## License

MIT
