// The extension host side, for the desktop (Node) and the web (a worker) alike:
// it extends the Markdown preview's markdown-it with the plot fences, and loads
// remote data for the preview when the setting allows it in a trusted workspace.
import * as vscode from "vscode";
import type {MarkdownIt} from "markdown-it";
import {plotdownFences} from "./fences.js";
import {RemoteData, remotePolicy} from "./remote.js";

export function activate(context: vscode.ExtensionContext) {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void vscode.commands.executeCommand("markdown.preview.refresh"), 50);
  };
  const remote = new RemoteData({onSettled: refresh});
  const policy = (env: unknown) => {
    const uri = documentOf(env);
    const setting = vscode.workspace.getConfiguration("plotdown", uri).get<unknown>("allowRemoteData", false);
    return remotePolicy(setting, vscode.workspace.isTrusted);
  };
  const reset = () => {
    remote.clear();
    refresh();
  };
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("plotdown")) reset();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(reset),
    {dispose: () => clearTimeout(refreshTimer)}
  );

  return {
    extendMarkdownIt(md: MarkdownIt) {
      return md.use(plotdownFences, {
        allowRemote: policy,
        resolve: (code: string, env: unknown) => remote.get(code, policy(env))
      });
    }
  };
}

export function deactivate() {}

/** The document being rendered: VS Code's markdown engine passes it in env.currentDocument. */
function documentOf(env: unknown): vscode.Uri | undefined {
  const current = (env as {currentDocument?: unknown} | undefined)?.currentDocument;
  return current instanceof vscode.Uri ? current : undefined;
}
