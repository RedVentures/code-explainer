import * as path from "path";
import * as vscode from "vscode";
import { SelectionAnalysisService } from "../services/analysis/SelectionAnalysisService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createExplainSelectionCommand(
  panel: ResultsPanel,
  analysisService: SelectionAnalysisService,
  cache: CacheService,
  sidebarProvider: CodeExplainerProvider
) {
  return async (
    forceRefresh = false,
    target?: { filePath: string; startLine: number; endLine: number }
  ) => {
    const editor = target ? undefined : vscode.window.activeTextEditor;
    const filePath = target?.filePath ?? editor?.document.uri.fsPath;
    const startLine = target?.startLine ?? (editor ? editor.selection.start.line + 1 : undefined);
    const endLine = target?.endLine ?? (editor ? editor.selection.end.line + 1 : undefined);

    if (!filePath || !startLine || !endLine) {
      throw new Error("Open a file and select code before using Code Explainer.");
    }

    const cacheKey = `selection:${filePath}:${startLine}:${endLine}`;
    const label = `Selection: ${path.basename(filePath)}:${startLine}-${endLine}`;

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label,
      source: { kind: "selection", filePath, startLine, endLine },
      loadingMessage: "Explaining the selected code and gathering related files.",
      forceRefresh,
      getFresh: () => analysisService.explainSelection({ filePath, startLine, endLine }),
      render: (result, refresh) =>
        panel.show(result, {
          onAction: (action) => void handlePanelAction(action),
          onFileRef: (fileRef) => void openFileRef(fileRef),
          onRefresh: refresh,
        }),
    });
  };
}
