import * as vscode from "vscode";
import { AnalysisResult, CachedResultSource } from "../../models/types";
import { renderHtml, renderLoadingHtml } from "./render";

export class ResultsPanel {
  private panel: vscode.WebviewPanel | undefined;
  private onAction: ((action: string) => void) | undefined;
  private onFileRef: ((fileRef: string) => void) | undefined;
  private onRefresh: (() => void) | undefined;
  private onMessage: ((message: unknown) => void) | undefined;
  private currentResult: AnalysisResult | undefined;
  private currentSource: CachedResultSource | undefined;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public show(
    result: AnalysisResult,
    handlers: {
      onAction: (action: string) => void;
      onFileRef: (fileRef: string) => void;
      onRefresh: () => void;
      onMessage?: (message: unknown) => void;
    },
    source?: CachedResultSource
  ): void {
    const panel = this.ensurePanel();
    this.currentResult = result;
    this.currentSource = source;
    this.onAction = handlers.onAction;
    this.onFileRef = handlers.onFileRef;
    this.onRefresh = handlers.onRefresh;
    this.onMessage = handlers.onMessage;

    panel.title = `Code Explainer: ${result.kind}`;
    panel.webview.html = renderHtml("Code Explainer", result);
    panel.reveal(vscode.ViewColumn.Beside);
  }

  public getCurrentResult(): AnalysisResult | undefined {
    return this.currentResult;
  }

  public getCurrentSource(): CachedResultSource | undefined {
    return this.currentSource;
  }

  public showLoading(title: string, message: string): void {
    const panel = this.ensurePanel();
    panel.title = title;
    panel.webview.html = renderLoadingHtml(title, message);
    panel.reveal(vscode.ViewColumn.Beside);
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    this.panel = vscode.window.createWebviewPanel(
      "codeExplainer.results",
      "Code Explainer",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.onAction = undefined;
      this.onFileRef = undefined;
      this.onRefresh = undefined;
      this.onMessage = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message: { type?: string; action?: string; fileRef?: string }) => {
      if (message.type === "refresh") {
        this.onRefresh?.();
        return;
      }
      if (message.type === "action" && message.action) {
        this.onAction?.(message.action);
      }
      if (message.type === "fileRef" && message.fileRef) {
        this.onFileRef?.(message.fileRef);
        return;
      }

      this.onMessage?.(message);
    });

    return this.panel;
  }
}
