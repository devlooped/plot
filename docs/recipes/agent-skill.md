# Agent skill

> [!WARNING]
> Written from the Claude Code, Codex and GitHub Copilot documentation; not tried yet.

The `plot` skill teaches a coding agent or a chat model to write charts as ```` ```plot ```` blocks: the rules of the format, the usual mistakes when coming from JavaScript, the full catalog of marks and transforms, and examples. Install it once; the agent loads it when you ask for a chart.

## Get the skill

The skill is the folder `skills/plot` (`SKILL.md` and `references/`) of the [plotdown repository](https://github.com/devlooped/plotdown/tree/main/skills/plot). The npm package carries the same folder:

```sh
npm i @devlooped/plotdown        # in any folder
# the skill: node_modules/@devlooped/plotdown/dist/skills/plot
```

Or from the repository:

```sh
git clone --depth 1 https://github.com/devlooped/plotdown /tmp/plotdown
# the skill: /tmp/plotdown/skills/plot
```

Copy the whole `plot` folder, not only `SKILL.md`: the skill links to `references/spec.md`, `catalog.md`, `examples.md` and `plot.schema.json`.

## Where it goes

| Agent | For you (every project) | For one repository |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/plot/` | `.claude/skills/plot/` |
| Codex | `~/.agents/skills/plot/` | `.agents/skills/plot/` |
| GitHub Copilot (CLI, VS Code agent mode, cloud agent) | `~/.copilot/skills/plot/` or `~/.agents/skills/plot/` | `.github/skills/plot/`, `.claude/skills/plot/` or `.agents/skills/plot/` |
| Other agents that read `SKILL.md` folders | their skills folder; `~/.agents/skills/` is the most shared | |

For example, for Claude Code:

```sh
mkdir -p ~/.claude/skills
cp -r node_modules/@devlooped/plotdown/dist/skills/plot ~/.claude/skills/
```

A repository-level copy is checked in with your code, so everyone working on it, and cloud agents, get the skill. Restart the agent if it does not list the skill.

## Without skills: a system prompt

For a model that takes no skills (an API call, a custom chat, a chat app's custom instructions), give it the same rules as text:

- `https://plotdown.cc/llms.txt`: the rules and one example, short enough for any system prompt.
- `https://plotdown.cc/llms-full.txt`: the rules, the full catalog and the examples.

## Structured outputs

To make a model return a block in the right shape, give it the JSON Schema as the response format: `https://plotdown.cc/schema/plot.schema.json`, the current version, or `https://plotdown.cc/schema/0.1/plot.schema.json`, which stays that of spec 0.1 (JSON Schema 2020-12; also `node_modules/@devlooped/plotdown/dist/plot.schema.json`). The schema checks the shape; `validate()` of `@devlooped/plotdown` checks the block as the renderer will, and its error names the JSON path to fix.

## Check it

Ask: "Chart the body mass of Adelie (3750 g) and Gentoo (5000 g) penguins as a bar chart in Markdown." The answer should hold a block like this one, which you can paste into the [playground](https://plotdown.cc/playground/):

````markdown
```plot
{
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": [{"species": "Adelie", "mass": 3750}, {"species": "Gentoo", "mass": 5000}], "x": "species", "y": "mass", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

The [spec](https://plotdown.cc/spec/) is the full reference. To draw the charts in the chat itself, add the [MCP server](./mcp.md).
