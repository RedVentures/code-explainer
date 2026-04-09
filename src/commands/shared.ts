import * as path from "path";
import * as vscode from "vscode";
import { AnalysisResult, CachedResultEntry, CachedResultSource } from "../models/types";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";

export async function handlePanelAction(action: string, panel?: ResultsPanel): Promise<void> {
  const normalized = action.toLowerCase();

  if (normalized.includes("directory") && normalized.includes("diagram")) {
    // Draw diagram for the current directory
    const currentSource = panel?.getCurrentSource();
    if (currentSource?.kind === "directory") {
      await vscode.commands.executeCommand("codeExplainer.drawFlowChart", currentSource.directoryPath);
      return;
    }
    return;
  }

  if (normalized.includes("branch")) {
    // If we're in a selection context, compare only that file
    const currentResult = panel?.getCurrentResult();
    if (currentResult?.kind === "selection") {
      await vscode.commands.executeCommand("codeExplainer.compareFileWithBranch");
      return;
    }
    await vscode.commands.executeCommand("codeExplainer.compareBranch");
    return;
  }

  if (normalized.includes("selection")) {
    await vscode.commands.executeCommand("codeExplainer.explainSelection");
    return;
  }

  if (normalized.includes("trace")) {
    await vscode.commands.executeCommand("codeExplainer.traceRelationships");
    return;
  }

  if (normalized.includes("flow")) {
    await vscode.commands.executeCommand("codeExplainer.drawFlowChart");
    return;
  }

  if (normalized.includes("diagram")) {
    await vscode.commands.executeCommand("codeExplainer.drawFlowChart");
    return;
  }

  if (normalized.includes("pr description")) {
    await vscode.commands.executeCommand("codeExplainer.generatePrDescription");
    return;
  }

  await vscode.commands.executeCommand("codeExplainer.explainRepo");
}

export async function openFileRef(fileRef: string): Promise<void> {
  const [rawPath, rawLine] = fileRef.split(":");
  const uri = vscode.Uri.file(path.resolve(rawPath));
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

  if (rawLine) {
    const line = Math.max(Number(rawLine) - 1, 0);
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}

export async function showCachedOrFresh(options: {
  panel: ResultsPanel;
  cache: CacheService;
  sidebarProvider: CodeExplainerProvider;
  cacheKey: string;
  label: string;
  source: CachedResultSource;
  loadingMessage: string;
  forceRefresh?: boolean;
  getFresh: () => Promise<AnalysisResult>;
  render: (result: AnalysisResult, refresh: () => void, source: CachedResultSource) => void;
}): Promise<void> {
  const cached = options.cache.get(options.cacheKey);
  if (cached && !options.forceRefresh) {
    options.render(cached.result, () => {
      void showCachedOrFresh({ ...options, forceRefresh: true });
    }, cached.source);
    return;
  }

  options.panel.showLoading("Code Explainer", options.loadingMessage);
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Code Explainer",
    },
    async () => options.getFresh()
  );

  const entry: CachedResultEntry = {
    key: options.cacheKey,
    label: options.label,
    updatedAt: Date.now(),
    result,
    source: options.source,
  };

  await options.cache.set(entry);
  options.sidebarProvider.refresh();
  options.render(result, () => {
    void showCachedOrFresh({ ...options, forceRefresh: true });
  }, options.source);
}
