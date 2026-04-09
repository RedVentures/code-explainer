import * as path from "path";
import * as vscode from "vscode";
import { BranchAnalysisService } from "../services/analysis/BranchAnalysisService";
import { GitService } from "../services/git/GitService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef } from "./shared";

export function createCompareFileWithBranchCommand(
  panel: ResultsPanel,
  analysisService: BranchAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
) {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("Open a file before comparing it with the base branch.");
    }

    const filePath = editor.document.uri.fsPath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
      throw new Error("Open a workspace folder before comparing.");
    }

    const config = vscode.workspace.getConfiguration("codeExplainer");
    const baseBranch = config.get<string>("baseBranch", "main");
    const git = new GitService(workspaceRoot);

    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    // Get the changes for this specific file
    const result = await analysisService.analyzeFile(filePath, baseBranch);
    const fileName = path.basename(filePath);

    panel.show(result, {
      onAction: (action) => void handlePanelAction(action, panel),
      onFileRef: (fileRef) => void openFileRef(fileRef),
      onRefresh: () => void createCompareFileWithBranchCommand(panel, analysisService, cache, sidebarProvider)(),
    });
  };
}
