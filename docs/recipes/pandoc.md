# Pandoc and Quarto

A `plot` fence becomes a chart in the HTML that Pandoc or Quarto writes: a Lua filter keeps each block as plain text with its name, and adds `plotdown.js` to the pages that have one.

## The filter

Save it as `plotdown.lua`:

```lua
-- plotdown.lua: a plot block becomes <pre class="plot"><code>…</code></pre>
-- in HTML output, and a page that has one loads plotdown.js.
local FENCES = {plot = true, oplot = true, ["observable-plot"] = true}
local SCRIPT = '<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>'
local found = false

local function escape(text)
  return (text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

local function CodeBlock(block)
  local lang = block.classes[1]
  if not (lang and FENCES[lang] and FORMAT:match("html")) then return nil end
  found = true
  return pandoc.RawBlock("html", '<pre class="' .. lang .. '"><code>' .. escape(block.text) .. "</code></pre>")
end

local function Meta(meta)
  if not found then return nil end
  local includes = meta["header-includes"]
  if includes == nil then
    includes = pandoc.MetaList({})
  elseif pandoc.utils.type(includes) ~= "List" then
    includes = pandoc.MetaList({includes})
  end
  includes:insert(pandoc.MetaBlocks({pandoc.RawBlock("html", SCRIPT)}))
  meta["header-includes"] = includes
  return meta
end

return {{CodeBlock = CodeBlock}, {Meta = Meta}}
```

It keeps the `header-includes` you already have, and leaves other formats (PDF, Word, GFM) alone: there the block stays code.

## Pandoc

```sh
pandoc doc.md -s --lua-filter plotdown.lua -o doc.html
```

`-s` (standalone) is needed: without it there is no `<head>` for the script. Without the filter, add the script yourself with `--include-in-header`; Pandoc already writes a `plot` fence as `<pre class="plot"><code>`, which `plotdown.js` finds.

## Quarto

In `_quarto.yml` (a project) or in the front matter of one `.qmd` file:

```yaml
filters:
  - plotdown.lua
```

Quarto runs the filter before its own, so the block is not wrapped in its code-copy scaffold.

## Write a chart

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

See the [spec](https://plotdown.cc/spec/) for marks and options, and try a block in the [playground](https://plotdown.cc/playground/).

## Check it

Open the HTML file through a web server (`quarto preview`, or `python -m http.server`): each block shows as a chart with a Source button, and a block with a mistake stays code with the reason under it.

## Notes

- **Dark themes**: with Quarto's `theme: {light: …, dark: …}`, the charts follow the toggle as the reader flips it.
- **Remote data** is off; add `data-allow-remote="true"` (or a list of origins) to `SCRIPT` in the filter.
- **Offline pages**: point `SCRIPT` at a copy of `plotdown.js` next to the page (from `npm i @devlooped/plotdown`, `node_modules/@devlooped/plotdown/dist/plotdown.js`).

> [!NOTE]
> Tried with Pandoc 3.14 and Quarto 1.11.9 on 2026-11-12.
