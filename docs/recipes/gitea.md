# Gitea and Forgejo

Every `plot` fence on your Gitea or Forgejo instance becomes a chart: in READMEs and Markdown files, wikis, issues, pull requests and comments, including the comment preview. One custom template loads `plotdown.js` on every page; nothing changes in the Markdown renderer.

## The footer template

Create `custom/templates/custom/footer.tmpl` under Gitea's custom folder (`$GITEA_CUSTOM`; `/data/gitea` in the Docker image, so `/data/gitea/templates/custom/footer.tmpl`):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

Restart Gitea so it reads the template. Forgejo uses the same folder layout and the same `footer.tmpl` hook.

## Write a chart

In a README, a `.md` file, an issue or a comment:

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

`oplot` and `observable-plot` fences work too. The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) checks a block as you type.

## Check it

Open the repository page: the README's blocks show as charts, each with a Source button. In an issue, write a block in a comment and click **Preview**: the chart shows in the preview, and again in the comment once posted, with no reload. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`).

## Notes

- **Markup**: Gitea writes a fence as `<pre class="code-block"><code class="chroma language-plot">`, which `plotdown.js` finds as it is. Chroma has no lexer for `plot`, and the script reads the text, not the spans.
- **Themes**: the charts follow Gitea's theme, light or dark, and the Auto theme's `prefers-color-scheme`.
- **Remote data** (a `"url"` in `data`) is off, which is what you want for blocks anyone can write in an issue. Allow trusted origins with `data-allow-remote="https://data.example"` on the script tag.
- **CSP**: if you set a `Content-Security-Policy` in a reverse proxy, allow `cdn.jsdelivr.net` in `script-src`, or serve the file yourself: put `plotdown.js` (from `npm i @devlooped/plotdown`, `node_modules/@devlooped/plotdown/dist/plotdown.js`) in `custom/public/assets/` and load `/assets/plotdown.js`.
- Feeds, emails and the API return the code block, not the chart.

> [!NOTE]
> Tried with Gitea 28.3.0 on 2026-11-12. Forgejo was not tried (its image registry was unreachable); it shares Gitea's template layout.
