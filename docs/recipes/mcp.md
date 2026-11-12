# MCP server

`@devlooped/plotdown-mcp` gives a model one tool, `render_plot`, and the host shows the chart in the conversation: an MCP App view that follows the host's theme and width, with the source a tab away and a button that copies the block as a ```` ```plot ```` fence.

## Configure your host

The server needs Node 22.12 or later and speaks stdio by default.

**Claude Desktop**, in `claude_desktop_config.json` (Settings › Developer › Edit Config):

```json
{
  "mcpServers": {
    "plotdown": {"command": "npx", "args": ["-y", "@devlooped/plotdown-mcp"]}
  }
}
```

**Claude Code**:

```sh
claude mcp add plotdown -- npx -y @devlooped/plotdown-mcp
```

**VS Code**, in `.vscode/mcp.json` (or **MCP: Add Server…**):

```json
{
  "servers": {
    "plotdown": {"type": "stdio", "command": "npx", "args": ["-y", "@devlooped/plotdown-mcp"]}
  }
}
```

**Other hosts** that take a command take the same one, `npx -y @devlooped/plotdown-mcp`. For a host that connects to a URL, run it over Streamable HTTP:

```sh
npx -y @devlooped/plotdown-mcp --http --port 3001    # http://127.0.0.1:3001/mcp
```

It binds `127.0.0.1` and refuses a `Host` header that is not local. `--host 0.0.0.0` opens it to the network with no authentication: put a proxy that adds some in front.

## What the model gets

| | |
| --- | --- |
| `render_plot` | Takes `plot`: the block as a JSON object, or as text (a fence around it is fine). Read-only, no network. |
| `plotdown://spec` | The whole format, as Markdown |
| `plotdown://schema` | The JSON Schema of a block |
| `ui://plotdown/view.html` | The view: one self-contained file, nothing loaded from the network |

A block with a mistake comes back as a tool error that names the place, so the model fixes it and calls again:

```text
Invalid plot block at $.marks[0].mark: unknown mark "pie"
Fix the value at $.marks[0].mark and call render_plot again. The format is in the resource plotdown://spec.
```

A host without MCP Apps gets a short summary and the block as a ```` ```plot ```` fence instead of the view; a chat that renders plot blocks (see [React and Streamdown](./react.md)) still shows the chart.

## Check it

Ask for a chart: "Plot the body mass of Adelie (3750 g) and Gentoo (5000 g) penguins as bars." The model calls `render_plot`, and the chart shows in the reply. To see the blocks it may write, read the [spec](https://plotdown.cc/spec/) or try one in the [playground](https://plotdown.cc/playground/).

## Notes

- **Remote data is off** in the server and in the view: the data must be inline.
- **The skill** teaches the format without a server, to models that only write Markdown: see [agent skill](./agent-skill.md).
- **As a library**: `createServer()` and `startHttpServer({port})` are exported for a server of your own.

> [!NOTE]
> Tried with `@devlooped/plotdown-mcp` 0.1.0 on Node 24 on 2026-11-12: an MCP SDK client called `render_plot` over stdio (with and without MCP Apps support) and over Streamable HTTP. The host configurations are from the hosts' documentation.
