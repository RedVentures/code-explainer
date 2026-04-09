import * as vscode from "vscode";
import { RepoAnalysisService } from "../services/analysis/RepoAnalysisService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createExplainRepoCommand(
  panel: ResultsPanel,
  analysisService: RepoAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
) {
  return async (forceRefresh = false) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const cacheKey = `repo:${folder?.uri.fsPath ?? "workspace"}`;
    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label: "Repo Overview",
      source: { kind: "repo" },
      loadingMessage: "Scanning the repository and preparing an overview.",
      forceRefresh,
      getFresh: () => analysisService.analyze(),
      render: (result, refresh) =>
        panel.show(result, {
          onAction: (action) => void handlePanelAction(action, panel),
          onFileRef: (fileRef) => void openFileRef(fileRef),
          onRefresh: refresh,
        }),
    });
  };
}
