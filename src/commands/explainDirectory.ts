import * as path from "path";
import * as vscode from "vscode";
import { DirectoryAnalysisService } from "../services/analysis/DirectoryAnalysisService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createExplainDirectoryCommand(
  panel: ResultsPanel,
  analysisService: DirectoryAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
) {
  return async (uri?: vscode.Uri, forceRefresh = false) => {
    let directoryPath: string;

    if (uri) {
      // Called from context menu on a folder
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) {
        directoryPath = uri.fsPath;
      } else {
        // If it's a file, use its parent directory
        directoryPath = path.dirname(uri.fsPath);
      }
    } else {
      // Called from command palette - use active editor's directory
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error("Open a file or select a folder before using Explain Directory.");
      }
      directoryPath = path.dirname(editor.document.uri.fsPath);
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Open a workspace folder before using Code Explainer.");
    }

    const relativePath = path.relative(folder.uri.fsPath, directoryPath);
    const dirName = path.basename(directoryPath);
    const cacheKey = `directory:${folder.uri.fsPath}:${relativePath}`;

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label: `Directory: ${dirName}`,
      source: { kind: "directory", directoryPath },
      loadingMessage: `Analyzing the ${dirName} directory.`,
      forceRefresh,
      getFresh: () => analysisService.analyze(directoryPath),
      render: (result, refresh) =>
        panel.show(result, {
          onAction: (action) => void handlePanelAction(action, panel),
          onFileRef: (fileRef) => void openFileRef(fileRef),
          onRefresh: refresh,
        }),
    });
  };
}
