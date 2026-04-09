import * as path from "path";
import * as vscode from "vscode";
import { SelectionAnalysisService } from "../services/analysis/SelectionAnalysisService";
import { CacheService } from "../storage/CacheService";
import { CodeExplainerProvider } from "../ui/sidebar/CodeExplainerProvider";
import { ResultsPanel } from "../ui/webview/panel";
import { handlePanelAction, openFileRef, showCachedOrFresh } from "./shared";

export function createTraceRelationshipsCommand(
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

    const cacheKey = `trace:${filePath}:${startLine}:${endLine}`;
    const label = `Trace: ${path.basename(filePath)}:${startLine}-${endLine}`;

    await showCachedOrFresh({
      panel,
      cache,
      sidebarProvider,
      cacheKey,
      label,
      source: { kind: "trace", filePath, startLine, endLine },
      loadingMessage: "Tracing relationships around the selected code.",
      forceRefresh,
      getFresh: () => analysisService.traceRelationships({ filePath, startLine, endLine }),
      render: (result, refresh) =>
        panel.show(result, {
          onAction: (action) => void handlePanelAction(action, panel),
          onFileRef: (fileRef) => void openFileRef(fileRef),
          onRefresh: refresh,
        }),
    });
  };
}
