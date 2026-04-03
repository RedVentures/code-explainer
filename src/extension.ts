import * as vscode from "vscode";
import { createCompareBranchCommand } from "./commands/compareBranch";
import { createDrawFlowChartCommand } from "./commands/drawFlowChart";
import { createExplainRepoCommand } from "./commands/explainRepo";
import { createExplainSelectionCommand } from "./commands/explainSelection";
import { handlePanelAction, openFileRef } from "./commands/shared";
import { createTraceRelationshipsCommand } from "./commands/traceRelationships";
import { CachedResultEntry } from "./models/types";
import { BranchAnalysisService } from "./services/analysis/BranchAnalysisService";
import { FlowAnalysisService } from "./services/analysis/FlowAnalysisService";
import { RepoAnalysisService } from "./services/analysis/RepoAnalysisService";
import { SelectionAnalysisService } from "./services/analysis/SelectionAnalysisService";
import { PromptBuilder } from "./services/llm/PromptBuilder";
import { RelationshipService } from "./services/repo/RelationshipService";
import { RepoScanner } from "./services/repo/RepoScanner";
import { SymbolService } from "./services/repo/SymbolService";
import { CacheService } from "./storage/CacheService";
import { CodeExplainerProvider } from "./ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "./ui/webview/panel";

export function activate(context: vscode.ExtensionContext): void {
  const repoScanner = new RepoScanner();
  const symbolService = new SymbolService();
  const relationshipService = new RelationshipService(symbolService);
  const promptBuilder = new PromptBuilder();
  const repoAnalysis = new RepoAnalysisService(repoScanner, promptBuilder);
  const branchAnalysis = new BranchAnalysisService(repoScanner, promptBuilder);
  const flowAnalysis = new FlowAnalysisService(repoScanner, promptBuilder);
  const selectionAnalysis = new SelectionAnalysisService(
    repoScanner,
    symbolService,
    relationshipService,
    promptBuilder
  );
  const panel = new ResultsPanel(context.extensionUri);
  const cacheService = new CacheService(context.workspaceState);
  const sidebarProvider = new CodeExplainerProvider(cacheService);
  const explainRepo = createExplainRepoCommand(panel, repoAnalysis, cacheService, sidebarProvider);
  const explainSelection = createExplainSelectionCommand(panel, selectionAnalysis, cacheService, sidebarProvider);
  const compareBranch = createCompareBranchCommand(panel, branchAnalysis, cacheService, sidebarProvider);
  const drawFlowChart = createDrawFlowChartCommand(panel, flowAnalysis, cacheService, sidebarProvider);
  const traceRelationships = createTraceRelationshipsCommand(
    panel,
    selectionAnalysis,
    cacheService,
    sidebarProvider
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("codeExplainer.sidebar", sidebarProvider),
    vscode.commands.registerCommand("codeExplainer.refreshSidebar", () => sidebarProvider.refresh()),
    vscode.commands.registerCommand("codeExplainer.explainRepo", wrapCommand(explainRepo)),
    vscode.commands.registerCommand("codeExplainer.explainSelection", wrapCommand(explainSelection)),
    vscode.commands.registerCommand("codeExplainer.compareBranch", wrapCommand(compareBranch)),
    vscode.commands.registerCommand("codeExplainer.drawFlowChart", wrapCommand(drawFlowChart)),
    vscode.commands.registerCommand("codeExplainer.traceRelationships", wrapCommand(traceRelationships)),
    vscode.commands.registerCommand(
      "codeExplainer.openCachedResult",
      wrapCommand(async (cacheKey: string) => {
        const entry = cacheService.get(cacheKey);
        if (!entry) {
          throw new Error("Cached result not found.");
        }

        panel.show(entry.result, {
          onAction: (action) => void handlePanelAction(action),
          onFileRef: (fileRef) => void openFileRef(fileRef),
          onRefresh: () =>
            void refreshCachedEntry(
              entry,
              explainRepo,
              explainSelection,
              compareBranch,
              drawFlowChart,
              traceRelationships
            ),
        });
      })
    )
  );
}

export function deactivate(): void {}

function wrapCommand<T extends unknown[]>(command: (...args: T) => Promise<void>) {
  return async (...args: T) => {
    try {
      await command(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Code Explainer: ${message}`);
    }
  };
}

async function refreshCachedEntry(
  entry: CachedResultEntry,
  explainRepo: (forceRefresh?: boolean) => Promise<void>,
  explainSelection: (
    forceRefresh?: boolean,
    target?: { filePath: string; startLine: number; endLine: number }
  ) => Promise<void>,
  compareBranch: (forceRefresh?: boolean) => Promise<void>,
  drawFlowChart: (
    forceRefresh?: boolean
  ) => Promise<void>,
  traceRelationships: (
    forceRefresh?: boolean,
    target?: { filePath: string; startLine: number; endLine: number }
  ) => Promise<void>
): Promise<void> {
  switch (entry.source.kind) {
    case "repo":
      await explainRepo(true);
      return;
    case "branch":
      await compareBranch(true);
      return;
    case "selection":
      await explainSelection(true, entry.source);
      return;
    case "flow":
      await drawFlowChart(true);
      return;
    case "trace":
      await traceRelationships(true, entry.source);
      return;
  }
}
