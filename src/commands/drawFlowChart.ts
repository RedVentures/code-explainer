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
  return async (directoryPath?: string, forceRefresh = false) => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
      throw new Error("Open a workspace folder before drawing a branch diagram.");
    }

    const git = new GitService(workspaceRoot);
    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const branchName = await git.getCurrentBranch();

    let cacheKey: string;
    let label: string;
    let loadingMessage: string;

    if (directoryPath) {
      const dirName = directoryPath.split("/").pop() || "directory";
      cacheKey = `flow:${workspaceRoot}:${branchName}:${directoryPath}`;
      label = `Diagram: ${dirName}`;
      loadingMessage = `Building a diagram for the ${dirName} directory.`;
    } else {
      cacheKey = `flow:${workspaceRoot}:${branchName}`;
      label = `Diagram: ${branchName}`;
      loadingMessage = `Building an overall diagram for ${branchName}.`;
    }

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label,
      source: { kind: "flow", branchName, directoryPath },
      loadingMessage,
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
