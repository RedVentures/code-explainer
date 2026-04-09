import * as vscode from "vscode";
import { BranchAnalysisService } from "../services/analysis/BranchAnalysisService";
import { GitService } from "../services/git/GitService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createCompareBranchCommand(
  panel: ResultsPanel,
  analysisService: BranchAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
  ) {
  return async (forceRefresh = false) => {
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const baseBranch = config.get<string>("baseBranch", "main");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "workspace";
    let branchName = "unknown";

    if (workspaceRoot !== "workspace") {
      const git = new GitService(workspaceRoot);
      if (await git.isGitRepo()) {
        branchName = await git.getCurrentBranch();
      }
    }

    const cacheKey = `branch:${workspaceRoot}:${branchName}:${baseBranch}`;

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label: `Branch: ${branchName} vs ${baseBranch}`,
      source: { kind: "branch", baseBranch },
      loadingMessage: `Comparing the current branch against ${baseBranch}.`,
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
