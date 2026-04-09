import * as vscode from "vscode";
import { FlowAnalysisService } from "../services/analysis/FlowAnalysisService";
import { GitService } from "../services/git/GitService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createDrawFlowChartCommand(
  panel: ResultsPanel,
  analysisService: FlowAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
) {
  return async (forceRefresh = false) => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
      throw new Error("Open a workspace folder before drawing a branch diagram.");
    }

    const git = new GitService(workspaceRoot);
    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const branchName = await git.getCurrentBranch();
    const cacheKey = `flow:${workspaceRoot}:${branchName}`;
    const label = `Diagram: ${branchName}`;

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label,
      source: { kind: "flow", branchName },
      loadingMessage: `Building an overall diagram for ${branchName}.`,
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
