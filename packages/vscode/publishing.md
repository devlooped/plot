# Building, checking and publishing the VS Code extension

The extension is `devlooped.plotdown`. Nothing here is published by the build: the steps below are for a person with the publisher's credentials.

## Build and check

From the root of the repository:

```sh
pnpm install
pnpm build                                   # every package, the extension's dist/ included
pnpm --filter plotdown test                  # unit tests (jsdom), part of pnpm test
pnpm --filter plotdown test:vscode           # end-to-end in a real VS Code (downloads it, see below)
pnpm --filter plotdown package               # packages/vscode/pack/plotdown-<version>.vsix
```

`test:vscode` downloads VS Code (stable, or `VSCODE_VERSION=1.90.0`, the oldest version the manifest accepts) into `packages/vscode/.vscode-test` and starts it with its own user data, extensions and shared-data folders there, so an installed VS Code and its profile are not touched. It opens `sample/sample.md` and `sample/sample.ipynb`, reads the DOM of the preview and of the notebook, and writes screenshots to `.vscode-test/screenshots`. It needs a desktop session (it shows a window) and is not part of `pnpm test`.

To try the extension by hand: start VS Code with `code --extensionDevelopmentPath=<absolute path of packages/vscode>` after `pnpm build`, or install the `.vsix` (`code --install-extension packages/vscode/pack/plotdown-0.1.0.vsix`).

## Visual Studio Marketplace

Once:

1. Have the `devlooped` publisher at https://marketplace.visualstudio.com/manage (create it with the Microsoft account that will own it).
2. Either create an Azure DevOps personal access token (any organization, **Organization: All accessible organizations**, scope **Marketplace › Manage**) and add its user as a member of the publisher, or sign in with Microsoft Entra ID (`az login`) as a member of the publisher.

Each release:

```sh
npx @vscode/vsce publish --packagePath packages/vscode/pack/plotdown-0.1.0.vsix --pat <token>   # or VSCE_PAT=<token>
npx @vscode/vsce publish --packagePath packages/vscode/pack/plotdown-0.1.0.vsix --azure-credential
```

The readme's picture is `https://raw.githubusercontent.com/devlooped/plotdown/main/packages/vscode/media/preview.png`: it shows on the Marketplace page once `main` holds it.

## Open VSX (VSCodium, Cursor, Windsurf, Gitpod)

Once:

1. Sign in at https://open-vsx.org with GitHub, link an Eclipse account and sign the publisher agreement (in the profile settings).
2. Create an access token (profile › Access Tokens).
3. Create the namespace: `npx ovsx create-namespace devlooped --pat <token>`. To have it shown as verified, claim its ownership through an issue at https://github.com/EclipseFdn/open-vsx.org.

Each release:

```sh
npx ovsx publish packages/vscode/pack/plotdown-0.1.0.vsix --pat <token>   # or OVSX_PAT=<token>
```

## Versions

Change `version` in `packages/vscode/package.json` and add a section to `changelog.md`. The `.vsix` takes its name from the version.
