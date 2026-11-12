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
