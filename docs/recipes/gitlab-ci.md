# plotdown in GitLab CI

GitLab does not render `plot` blocks by itself. With this job, every block of your Markdown files gets an SVG image right after it, which GitLab shows in READMEs, wikis checked into the repository, and any rendered `.md` file:

````markdown
```plot
{"title": "Penguin body mass", "marks": [ … ]}
```
![Penguin body mass](docs/plots/readme-1f3a9c.svg) <!-- plot:1f3a9c -->
````

The block stays in the file; `plotdown render` adds the image line and the SVG file, updates both when the block changes, and removes SVG files that nothing references any more. A second run changes nothing.

## Check merge requests, render on the default branch

Add to `.gitlab-ci.yml`:

```yaml
# Merge requests: fail when an image is missing or out of date.
plots:check:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npx --yes @devlooped/plotdown render --check "**/*.md"

# Default branch: render, then commit the images.
plots:render:
  image: node:24
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_PIPELINE_SOURCE == "push"
  script:
    - npx --yes @devlooped/plotdown render "**/*.md"
    - |
      if [ -n "$(git status --porcelain -- '*.md' docs/plots)" ]; then
        git config user.name "plotdown"
        git config user.email "plotdown@noreply.$CI_SERVER_HOST"
        git add -A -- '*.md' docs/plots
        git commit -m "Render plot blocks"
        git push -o ci.skip "https://plotdown:${PLOTDOWN_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git" "HEAD:${CI_COMMIT_BRANCH}"
      fi
```

`plots:render` pushes with a token, since the job token of GitLab CI cannot push:

1. In **Settings › Access tokens**, create a project access token with the `write_repository` scope and the *Developer* role (or *Maintainer*, if the default branch is protected against developers).
2. In **Settings › CI/CD › Variables**, add it as `PLOTDOWN_TOKEN`, masked and protected.

`-o ci.skip` keeps the commit from starting another pipeline.

To keep merge requests simple, use only `plots:check` and render on your machine: `npx @devlooped/plotdown render "**/*.md"`.

## Options

| Option | Default | |
| --- | --- | --- |
| `--out <dir>` | `docs/plots` | Where the SVG files go, from the root of the repository. Change it in the `git add` line too. |
| `--check` | | Change nothing; exit with 1 when a run would change something. |
| `--theme <theme>` | `auto` | `auto` follows the reader's light or dark color scheme; `light` and `dark` fix the colors. |

Globs are expanded by plotdown, from the root of the repository (the job's directory), without entering `node_modules` or `.git`: quote them so that the shell leaves them alone. An invalid block fails the job with its file, line and JSON path (`readme.md:12: error: $.marks[0].mark: unknown mark "barZ"`), and its file is left as it is.

Pin a version to keep a new release from changing the images under you: `npx --yes @devlooped/plotdown@0.1.0 render …`. For comments and merge request descriptions, where no job runs, use [image links](./image-links.md). All the options of the CLI are in [the command line](./cli.md).

*plotdown is not affiliated with Observable, Inc.*
